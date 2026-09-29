'use client';

import { useEffect, useMemo, useState } from 'react';
import { inferCampusScheduleSuggestions } from '@pulse/core';
import type { CampusSyncSnapshot, Modality, Weekday } from '@pulse/types';

type SubjectOption = { id: string; name: string; code: string | null };


type ScheduleDraft = {
  weekdays: Weekday[];
  startTime: string;
  endTime: string;
  modality: Modality;
  meetingUrl: string;
};

const DAY_LABELS: ReadonlyArray<{ value: Weekday; label: string }> = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

type SyncResult = {
  runId: string;
  courseExternalId: string;
  subjectId: string;
  subjectName: string;
  createdSubject: boolean;
  summary: {
    discoveredCount: number;
    newCount: number;
    changedCount: number;
    unchangedCount: number;
    ignoredCount: number;
  };
};

function isSnapshotMessage(value: unknown): value is {
  type: 'pulse:campus-sync:snapshot';
  snapshot: CampusSyncSnapshot;
} {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; snapshot?: unknown };
  return message.type === 'pulse:campus-sync:snapshot' && message.snapshot !== undefined;
}

export function CampusSyncImport({ subjects }: { subjects: SubjectOption[] }) {
  const [snapshot, setSnapshot] = useState<CampusSyncSnapshot | null>(null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [status, setStatus] = useState('Buscando datos del Campus Companion…');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [confirmSchedule, setConfirmSchedule] = useState(false);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== window) return;
      if (!isSnapshotMessage(event.data)) return;

      const received = event.data.snapshot;
      setSnapshot(received);

      const suggested = inferCampusScheduleSuggestions(received)[0];
      setScheduleDraft(
        suggested
          ? {
              weekdays: [...suggested.weekdays],
              startTime: suggested.startTime,
              endTime: suggested.endTime,
              modality: suggested.modality,
              meetingUrl: suggested.meetingUrl ?? '',
            }
          : null,
      );
      setConfirmSchedule(false);
      setStatus(`${received.course.title ?? received.course.externalId} listo para importar.`);
    };

    window.addEventListener('message', receive);
    window.postMessage({ type: 'pulse:campus-sync:request' }, window.location.origin);

    const timeout = window.setTimeout(() => {
      setStatus((current) =>
        current.startsWith('Buscando')
          ? 'No hay una sincronización pendiente. Sincroniza un curso desde la extensión.'
          : current,
      );
    }, 1500);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
    };
  }, []);

  const scheduleSuggestions = useMemo(
    () => (snapshot ? inferCampusScheduleSuggestions(snapshot) : []),
    [snapshot],
  );

  const counts = useMemo(() => {
    if (!snapshot) return null;
    return {
      documents: snapshot.documents.length,
      assignments: snapshot.assignments.length,
      announcements: snapshot.announcements.length,
      events: snapshot.events.length,
    };
  }, [snapshot]);

  async function ingest(mode: 'create' | 'link') {
    if (!snapshot || busy) return;
    if (mode === 'link' && !subjectId) return;

    setBusy(true);
    setResult(null);
    setStatus(mode === 'create' ? 'Creando materia y guardando…' : 'Vinculando y guardando…');

    try {
      const response = await fetch('/api/campus-sync/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          ...(mode === 'link' ? { subjectId } : {}),
          snapshot,
          ...(confirmSchedule && scheduleDraft
            ? {
                schedule: {
                  weekdays: scheduleDraft.weekdays,
                  startTime: scheduleDraft.startTime,
                  endTime: scheduleDraft.endTime,
                  modality: scheduleDraft.modality,
                  meetingUrl: scheduleDraft.meetingUrl.trim() || null,
                  location: { campus: null, building: null, room: null },
                },
              }
            : {}),
        }),
      });

      const data = (await response.json()) as SyncResult | { error?: string };
      if (!response.ok || !('summary' in data)) {
        setStatus('No se pudo guardar la sincronización.');
        return;
      }

      setResult(data);
      setStatus(
        data.createdSubject
          ? `${data.subjectName} fue creada y sincronizada.`
          : `${data.subjectName} quedó vinculada y sincronizada.`,
      );
      window.postMessage({ type: 'pulse:campus-sync:consumed' }, window.location.origin);
    } catch {
      setStatus('No se pudo contactar Pulse.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <p className="text-[color:var(--color-ink-muted)] text-sm">{status}</p>

      {snapshot && counts ? (
        <>
          <div className="mt-5 border-y border-[color:var(--color-border)] py-4">
            <p className="text-base font-medium">
              {snapshot.course.title ?? snapshot.course.externalId}
            </p>
            <dl className="text-[color:var(--color-ink-muted)] mt-2 grid gap-1 text-xs">
              <div className="flex gap-2">
                <dt className="font-medium">Código</dt>
                <dd>{snapshot.course.code ?? snapshot.course.externalId}</dd>
              </div>
              {snapshot.course.teacher ? (
                <div className="flex gap-2">
                  <dt className="font-medium">Docente</dt>
                  <dd>{snapshot.course.teacher}</dd>
                </div>
              ) : null}
              {snapshot.course.section ? (
                <div className="flex gap-2">
                  <dt className="font-medium">Sección</dt>
                  <dd>{snapshot.course.section}</dd>
                </div>
              ) : null}
            </dl>
            <p className="text-[color:var(--color-ink-muted)] mt-3 text-xs">
              {counts.documents} documentos · {counts.assignments} tareas · {counts.announcements}{' '}
              anuncios · {counts.events} eventos
            </p>
          </div>


          <div className="mt-6 border-t border-[color:var(--color-border)] pt-5">
            <p className="text-sm font-medium">Horario detectado</p>

            {scheduleDraft && scheduleSuggestions[0] ? (
              <>
                <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
                  Aproximación del campus · confianza {scheduleSuggestions[0].confidence === 'high' ? 'alta' : 'media'}.
                  Revísala antes de guardarla.
                </p>

                <div className="mt-4 grid gap-4">
                  <fieldset>
                    <legend className="text-xs font-medium">Días</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {DAY_LABELS.map((day) => {
                        const checked = scheduleDraft.weekdays.includes(day.value);
                        return (
                          <label
                            key={day.value}
                            className="flex items-center gap-1.5 rounded-md border border-[color:var(--color-border)] px-2 py-1 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setScheduleDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        weekdays: checked
                                          ? current.weekdays.filter((value) => value !== day.value)
                                          : [...current.weekdays, day.value].sort(),
                                      }
                                    : current,
                                )
                              }
                            />
                            {day.label}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs">
                      Inicio
                      <input
                        type="time"
                        value={scheduleDraft.startTime}
                        onChange={(event) =>
                          setScheduleDraft((current) =>
                            current ? { ...current, startTime: event.target.value } : current,
                          )
                        }
                        className="mt-1 block w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1.5"
                      />
                    </label>
                    <label className="text-xs">
                      Fin
                      <input
                        type="time"
                        value={scheduleDraft.endTime}
                        onChange={(event) =>
                          setScheduleDraft((current) =>
                            current ? { ...current, endTime: event.target.value } : current,
                          )
                        }
                        className="mt-1 block w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1.5"
                      />
                    </label>
                  </div>

                  <label className="text-xs">
                    Modalidad
                    <select
                      value={scheduleDraft.modality}
                      onChange={(event) =>
                        setScheduleDraft((current) =>
                          current
                            ? { ...current, modality: event.target.value as Modality }
                            : current,
                        )
                      }
                      className="mt-1 block w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1.5"
                    >
                      <option value="unconfirmed">Sin confirmar</option>
                      <option value="virtual">Virtual</option>
                      <option value="in_person">Presencial</option>
                      <option value="hybrid">Híbrida</option>
                    </select>
                  </label>

                  <label className="text-xs">
                    Enlace de clase
                    <input
                      type="url"
                      value={scheduleDraft.meetingUrl}
                      onChange={(event) =>
                        setScheduleDraft((current) =>
                          current ? { ...current, meetingUrl: event.target.value } : current,
                        )
                      }
                      placeholder="Opcional"
                      className="mt-1 block w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1.5"
                    />
                  </label>

                  <p className="text-[color:var(--color-ink-muted)] text-xs">
                    Evidencia: {scheduleSuggestions[0].evidence}
                  </p>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmSchedule}
                      onChange={(event) => setConfirmSchedule(event.target.checked)}
                    />
                    Confirmar y guardar este horario
                  </label>
                </div>
              </>
            ) : (
              <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
                No encontré un horario suficientemente claro. Puedes configurarlo manualmente después.
              </p>
            )}
          </div>

          <div className="mt-5">
            <p className="text-sm font-medium">Crear desde el campus</p>
            <p className="text-[color:var(--color-ink-muted)] mt-1 max-w-xl text-xs">
              Pulse crea la materia con el nombre, código y docente detectados. La modalidad y el
              horario quedan sin confirmar hasta tener datos fiables del campus.
            </p>
            <button
              type="button"
              onClick={() => void ingest('create')}
              disabled={busy}
              className="mt-3 rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
            >
              {busy ? 'Guardando…' : 'Crear materia automáticamente'}
            </button>
          </div>

          {subjects.length > 0 ? (
            <div className="mt-7 border-t border-[color:var(--color-border)] pt-5">
              <p className="text-sm font-medium">O vincular con una materia existente</p>
              <label className="mt-3 block text-sm">
                <span className="sr-only">Materia de Pulse</span>
                <select
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                  className="block w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2"
                >
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.code ? `${subject.code} · ` : ''}
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => void ingest('link')}
                disabled={busy || !subjectId}
                className="mt-3 rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
              >
                {busy ? 'Guardando…' : 'Vincular materia existente'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {result ? (
        <div className="mt-6 border-t border-[color:var(--color-border)] pt-4">
          <p className="text-sm font-medium">Resultado</p>
          <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
            {result.summary.newCount} nuevos · {result.summary.changedCount} cambiados ·{' '}
            {result.summary.unchangedCount} sin cambios
          </p>
          <a
            href={`/subjects/${result.subjectId}`}
            className="mt-3 inline-block text-sm underline underline-offset-4"
          >
            Abrir {result.subjectName}
          </a>
        </div>
      ) : null}
    </div>
  );
}
