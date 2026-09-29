'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CampusSyncSnapshot } from '@pulse/types';

type SubjectOption = { id: string; name: string; code: string | null };

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

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== window) return;
      if (!isSnapshotMessage(event.data)) return;

      const received = event.data.snapshot;
      setSnapshot(received);
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
