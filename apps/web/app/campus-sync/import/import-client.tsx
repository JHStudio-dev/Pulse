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

type BatchSyncResult = {
  succeeded: number;
  failed: number;
  createdSubjects: number;
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  errors: Array<{ course: string; error: string }>;
};

function isSnapshotMessage(value: unknown): value is {
  type: 'pulse:campus-sync:snapshot';
  snapshot: CampusSyncSnapshot;
} {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; snapshot?: unknown };
  return message.type === 'pulse:campus-sync:snapshot' && message.snapshot !== undefined;
}

type BatchSourceError = {
  courseExternalId: string;
  title: string;
  error: string;
};

function isBatchMessage(value: unknown): value is {
  type: 'pulse:campus-sync:batch';
  snapshots: CampusSyncSnapshot[];
  errors: BatchSourceError[];
} {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; snapshots?: unknown; errors?: unknown };
  return (
    message.type === 'pulse:campus-sync:batch' &&
    Array.isArray(message.snapshots) &&
    message.snapshots.length > 0
  );
}

function normalized(value: string | undefined | null): string {
  return (value ?? '').trim().toLocaleLowerCase('es');
}

export function CampusSyncImport({ subjects }: { subjects: SubjectOption[] }) {
  const [snapshot, setSnapshot] = useState<CampusSyncSnapshot | null>(null);
  const [batchSnapshots, setBatchSnapshots] = useState<CampusSyncSnapshot[]>([]);
  const [batchSourceErrors, setBatchSourceErrors] = useState<BatchSourceError[]>([]);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [status, setStatus] = useState('Buscando datos del Campus Companion…');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [batchResult, setBatchResult] = useState<BatchSyncResult | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [confirmSchedule, setConfirmSchedule] = useState(false);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== window) return;

      if (isBatchMessage(event.data)) {
        const received = event.data.snapshots;
        setBatchSnapshots(received);
        setBatchSourceErrors(Array.isArray(event.data.errors) ? event.data.errors : []);
        setSnapshot(received[0] ?? null);
        setScheduleDraft(null);
        setConfirmSchedule(false);
        setStatus(`${received.length} materias listas para importar.`);
        return;
      }

      if (!isSnapshotMessage(event.data)) return;

      const received = event.data.snapshot;
      setBatchSnapshots([]);
      setBatchSourceErrors([]);
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
          ? 'No hay una sincronización pendiente. Sincroniza un curso o todas tus materias desde la extensión.'
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
      assignmentsWithDueDate: snapshot.assignments.filter((assignment) => Boolean(assignment.dueAt)).length,
      announcements: snapshot.announcements.length,
      events: snapshot.events.length,
    };
  }, [snapshot]);

  const batchCounts = useMemo(() => {
    if (batchSnapshots.length === 0) return null;

    return batchSnapshots.reduce(
      (total, item) => ({
        documents: total.documents + item.documents.length,
        assignments: total.assignments + item.assignments.length,
        announcements: total.announcements + item.announcements.length,
        events: total.events + item.events.length,
      }),
      { documents: 0, assignments: 0, announcements: 0, events: 0 },
    );
  }, [batchSnapshots]);

  async function ingestAll() {
    if (batchSnapshots.length === 0 || busy) return;

    setBusy(true);
    setResult(null);
    setBatchResult(null);

    const aggregate: BatchSyncResult = {
      succeeded: 0,
      failed: 0,
      createdSubjects: 0,
      newCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      errors: [],
    };

    const usedSubjects = new Set<string>();

    try {
      for (let index = 0; index < batchSnapshots.length; index += 1) {
        const item = batchSnapshots[index]!;
        const label = item.course.title ?? item.course.externalId;
        setStatus(`Importando ${index + 1} de ${batchSnapshots.length}: ${label}`);

        const match = subjects.find((subject) => {
          if (usedSubjects.has(subject.id)) return false;

          const courseCode = normalized(item.course.code ?? item.course.externalId);
          const subjectCode = normalized(subject.code);
          if (courseCode && subjectCode && courseCode === subjectCode) return true;

          return normalized(subject.name) === normalized(item.course.title);
        });

        const response = await fetch('/api/campus-sync/ingest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            match
              ? { mode: 'link', subjectId: match.id, snapshot: item }
              : { mode: 'create', snapshot: item },
          ),
        });

        const data = (await response.json()) as SyncResult | { error?: string };

        if (!response.ok || !('summary' in data)) {
          aggregate.failed += 1;
          aggregate.errors.push({
            course: label,
            error: 'error' in data && data.error ? data.error : 'sync_failed',
          });
          continue;
        }

        if (match) usedSubjects.add(match.id);

        aggregate.succeeded += 1;
        if (data.createdSubject) aggregate.createdSubjects += 1;
        aggregate.newCount += data.summary.newCount;
        aggregate.changedCount += data.summary.changedCount;
        aggregate.unchangedCount += data.summary.unchangedCount;
      }

      setBatchResult(aggregate);
      setStatus(
        aggregate.failed === 0
          ? `${aggregate.succeeded} materias sincronizadas correctamente.`
          : `${aggregate.succeeded} materias sincronizadas · ${aggregate.failed} con error.`,
      );

      if (aggregate.failed === 0) {
        window.postMessage({ type: 'pulse:campus-sync:consumed' }, window.location.origin);
      }
    } catch {
      setStatus('Se interrumpió la sincronización masiva.');
    } finally {
      setBusy(false);
    }
  }

  async function ingest(mode: 'create' | 'link') {
    if (!snapshot || busy) return;
    if (mode === 'link' && !subjectId) return;

    if (
      confirmSchedule &&
      scheduleDraft &&
      (scheduleDraft.weekdays.length === 0 ||
        !scheduleDraft.startTime ||
        !scheduleDraft.endTime ||
        scheduleDraft.startTime >= scheduleDraft.endTime)
    ) {
      setStatus('Revisa los días y las horas antes de confirmar el horario.');
      return;
    }

    setBusy(true);
    setResult(null);
    setBatchResult(null);
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

      {batchSnapshots.length > 1 && batchCounts ? (
        <section className="mt-6 border-y border-[color:var(--color-border)] py-5" aria-labelledby="bulk-sync-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="bulk-sync-heading" className="text-base font-medium">
                {batchSnapshots.length} materias detectadas
                {batchSourceErrors.length > 0 ? ` · ${batchSourceErrors.length} con error de lectura` : ''}
              </h2>
              <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
                {batchCounts.assignments} tareas · {batchCounts.documents} documentos ·{' '}
                {batchCounts.announcements} anuncios · {batchCounts.events} eventos
              </p>
            </div>

            <button
              type="button"
              onClick={() => void ingestAll()}
              disabled={busy}
              className="rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
            >
              {busy ? 'Sincronizando…' : 'Importar todas automáticamente'}
            </button>
          </div>

          <p className="text-[color:var(--color-ink-muted)] mt-3 max-w-2xl text-xs">
            Pulse reutiliza una materia existente cuando coincide el código. Las demás se crean
            automáticamente. Los horarios detectados no se guardan sin revisión.
          </p>

          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {batchSnapshots.map((item) => (
              <li key={item.course.externalId} className="rounded-md border border-[color:var(--color-border)] px-3 py-2">
                <span className="font-medium">{item.course.title ?? item.course.externalId}</span>
                <span className="text-[color:var(--color-ink-muted)] ml-2 text-xs">
                  {item.assignments.length} tareas
                </span>
              </li>
            ))}
          </ul>

          {batchSourceErrors.length > 0 ? (
            <div className="mt-4 border-t border-[color:var(--color-border)] pt-3">
              <p className="text-xs font-medium">No se pudieron leer</p>
              <ul className="text-[color:var(--color-ink-muted)] mt-2 space-y-1 text-xs">
                {batchSourceErrors.map((entry) => (
                  <li key={entry.courseExternalId}>
                    {entry.title || entry.courseExternalId}: {entry.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {batchSnapshots.length <= 1 && snapshot && counts ? (
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
            {counts.assignments > 0 ? (
              <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
                Fechas detectadas: {counts.assignmentsWithDueDate} de {counts.assignments} tareas.
                {counts.assignmentsWithDueDate === 0
                  ? ' El campus no proporcionó fechas reconocibles para este curso.'
                  : ''}
              </p>
            ) : null}
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
              Pulse crea la materia con el nombre, código y docente detectados. Si confirmas el
              horario sugerido, también guarda esos días y horas.
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

      {batchResult ? (
        <section className="mt-6 border-t border-[color:var(--color-border)] pt-4" aria-labelledby="bulk-result-heading">
          <h2 id="bulk-result-heading" className="text-sm font-medium">Resultado</h2>
          <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
            {batchResult.succeeded} materias listas
            {batchResult.failed > 0 ? ` · ${batchResult.failed} con error` : ''}
            {' · '}{batchResult.newCount} nuevos · {batchResult.changedCount} cambiados ·{' '}
            {batchResult.unchangedCount} sin cambios
          </p>
          {batchResult.errors.length > 0 ? (
            <ul className="text-[color:var(--color-ink-muted)] mt-3 space-y-1 text-xs">
              {batchResult.errors.map((entry) => (
                <li key={entry.course}>{entry.course}: {entry.error}</li>
              ))}
            </ul>
          ) : null}
          <a href="/tasks" className="mt-3 inline-block text-sm underline underline-offset-4">
            Ver tareas por materia
          </a>
        </section>
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
