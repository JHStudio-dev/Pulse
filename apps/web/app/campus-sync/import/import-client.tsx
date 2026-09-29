'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CampusSyncSnapshot } from '@pulse/types';

type SubjectOption = { id: string; name: string; code: string | null };

type SyncResult = {
  runId: string;
  courseExternalId: string;
  summary: {
    discoveredCount: number;
    newCount: number;
    changedCount: number;
    unchangedCount: number;
    ignoredCount: number;
  };
};

type BridgeMessage =
  | { type: 'pulse:campus-sync:snapshot'; snapshot: CampusSyncSnapshot }
  | { type: string };

export function CampusSyncImport({ subjects }: { subjects: SubjectOption[] }) {
  const [snapshot, setSnapshot] = useState<CampusSyncSnapshot | null>(null);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [status, setStatus] = useState('Buscando datos del Campus Companion…');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    const receive = (event: MessageEvent<BridgeMessage>) => {
      if (event.source !== window) return;
      if (event.data?.type !== 'pulse:campus-sync:snapshot') return;

      const received = event.data.snapshot;
      setSnapshot(received);
      setStatus(`Curso ${received.course.externalId} listo para importar.`);
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

  async function ingest() {
    if (!snapshot || !subjectId || busy) return;

    setBusy(true);
    setResult(null);
    setStatus('Guardando sincronización…');

    try {
      const response = await fetch('/api/campus-sync/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subjectId, snapshot }),
      });

      const data = (await response.json()) as SyncResult | { error?: string };
      if (!response.ok || !('summary' in data)) {
        setStatus('No se pudo guardar la sincronización.');
        return;
      }

      setResult(data);
      setStatus('Sincronización guardada.');
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
          <div className="mt-5 border-y border-[color:var(--color-border)] py-4 text-sm">
            <p className="font-medium">{snapshot.course.externalId}</p>
            <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
              {counts.documents} documentos · {counts.assignments} tareas · {counts.announcements}{' '}
              anuncios · {counts.events} eventos
            </p>
          </div>

          <label className="mt-5 block text-sm">
            <span className="font-medium">Materia de Pulse</span>
            <select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="mt-2 block w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2"
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
            onClick={() => void ingest()}
            disabled={busy || !subjectId}
            className="mt-4 rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Importar a Pulse'}
          </button>
        </>
      ) : null}

      {result ? (
        <div className="mt-6 border-t border-[color:var(--color-border)] pt-4">
          <p className="text-sm font-medium">Resultado</p>
          <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
            {result.summary.newCount} nuevos · {result.summary.changedCount} cambiados ·{' '}
            {result.summary.unchangedCount} sin cambios
          </p>
        </div>
      ) : null}
    </div>
  );
}
