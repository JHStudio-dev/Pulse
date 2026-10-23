'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { inferCampusScheduleSuggestions } from '@pulse/core';
import type { CampusSyncSnapshot } from '@pulse/types';
import {
  buildIngestRequest,
  campusCourseKey,
  ingestErrorMessage,
  isScheduleDraftComplete,
  planCourseImport,
  scheduleDraftFromSuggestion,
  type ImportCourseLink,
  type ImportSubjectOption,
  type ScheduleDraft,
} from '@/lib/campus-import';
import { ScheduleReview } from './schedule-review';

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

type CourseFailure = {
  courseExternalId: string;
  sessionId?: string;
  title: string;
  error: string;
};

type SectionWarning = CourseFailure & { section: string };

type CourseImport =
  | { status: 'pending' }
  | { status: 'importing' }
  | { status: 'done'; result: SyncResult }
  | { status: 'error'; error: string };

const IMPORT_STATUS_LABELS: Record<CourseImport['status'], string> = {
  pending: 'Pendiente',
  importing: 'Importando',
  done: 'Importada',
  error: 'Error',
};

const SECTION_LABELS: Record<string, string> = {
  documents: 'documentos',
  assignments: 'tareas',
  announcements: 'anuncios',
  events: 'agenda',
};

function isSnapshotMessage(value: unknown): value is {
  type: 'pulse:campus-sync:snapshot';
  snapshot: CampusSyncSnapshot;
} {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; snapshot?: unknown };
  return message.type === 'pulse:campus-sync:snapshot' && message.snapshot !== undefined;
}

function isBatchMessage(value: unknown): value is {
  type: 'pulse:campus-sync:batch';
  snapshots: CampusSyncSnapshot[];
  errors?: CourseFailure[];
  warnings?: SectionWarning[];
} {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; snapshots?: unknown };
  return message.type === 'pulse:campus-sync:batch' && Array.isArray(message.snapshots);
}

function failureKey(entry: CourseFailure): string {
  return campusCourseKey({ externalId: entry.courseExternalId, sessionId: entry.sessionId });
}

function courseLabel(snapshot: CampusSyncSnapshot): string {
  return snapshot.course.title ?? snapshot.course.externalId;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

async function postIngest(body: unknown): Promise<SyncResult | { error: string }> {
  try {
    const response = await fetch('/api/campus-sync/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Partial<SyncResult> & {
      error?: string;
    };

    if (!response.ok || !data.summary) return { error: data.error ?? 'sync_failed' };
    return data as SyncResult;
  } catch {
    return { error: 'network' };
  }
}

export function CampusSyncImport({
  subjects,
  connectionId,
  links,
}: {
  subjects: ImportSubjectOption[];
  connectionId: string | null;
  links: ImportCourseLink[];
}) {
  const [snapshot, setSnapshot] = useState<CampusSyncSnapshot | null>(null);
  const [batchSnapshots, setBatchSnapshots] = useState<CampusSyncSnapshot[]>([]);
  const [sourceErrors, setSourceErrors] = useState<CourseFailure[]>([]);
  const [sectionWarnings, setSectionWarnings] = useState<SectionWarning[]>([]);
  const [receivedBatch, setReceivedBatch] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ScheduleDraft>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [imports, setImports] = useState<Record<string, CourseImport>>({});
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [status, setStatus] = useState('Buscando datos del Campus Companion…');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const usedSubjects = useRef(new Set<string>());
  const received = useRef(false);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== window) return;
      if (!isBatchMessage(event.data) && !isSnapshotMessage(event.data)) return;

      // The bridge may answer twice; the first delivery wins so edits survive.
      if (received.current) return;
      received.current = true;

      if (isBatchMessage(event.data)) {
        const incoming = event.data.snapshots;
        const nextDrafts: Record<string, ScheduleDraft> = {};

        for (const item of incoming) {
          const suggestion = inferCampusScheduleSuggestions(item)[0];
          if (suggestion) nextDrafts[campusCourseKey(item.course)] = scheduleDraftFromSuggestion(suggestion);
        }

        setReceivedBatch(true);
        setBatchSnapshots(incoming);
        setSourceErrors(Array.isArray(event.data.errors) ? event.data.errors : []);
        setSectionWarnings(Array.isArray(event.data.warnings) ? event.data.warnings : []);
        setDrafts(nextDrafts);
        setStatus(
          incoming.length > 0
            ? `${plural(incoming.length, 'materia lista', 'materias listas')} para importar.`
            : 'Ninguna materia pudo leerse del campus. Reintenta desde la extensión.',
        );
        return;
      }

      const incoming = event.data.snapshot;
      const suggestion = inferCampusScheduleSuggestions(incoming)[0];

      setSnapshot(incoming);
      setDrafts(
        suggestion ? { [campusCourseKey(incoming.course)]: scheduleDraftFromSuggestion(suggestion) } : {},
      );
      setStatus(`${courseLabel(incoming)} listo para importar.`);
    };

    window.addEventListener('message', receive);
    window.postMessage({ type: 'pulse:campus-sync:request' }, window.location.origin);

    const timeout = window.setTimeout(() => {
      setStatus((current) =>
        current.startsWith('Buscando')
          ? 'No hay una sincronización pendiente. Sincroniza un curso o todas tus materias desde la extensión.'
          : current,
      );
    }, 2500);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
    };
  }, []);

  const batchTotals = useMemo(
    () =>
      batchSnapshots.reduce(
        (total, item) => ({
          documents: total.documents + item.documents.length,
          assignments: total.assignments + item.assignments.length,
          announcements: total.announcements + item.announcements.length,
          events: total.events + item.events.length,
        }),
        { documents: 0, assignments: 0, announcements: 0, events: 0 },
      ),
    [batchSnapshots],
  );

  const unreadSections = useMemo(() => {
    const byCourse = new Map<string, string[]>();
    for (const warning of sectionWarnings) {
      const key = failureKey(warning);
      byCourse.set(key, [...(byCourse.get(key) ?? []), SECTION_LABELS[warning.section] ?? warning.section]);
    }
    return byCourse;
  }, [sectionWarnings]);

  const importCounts = useMemo(() => {
    const values = Object.values(imports);
    return {
      done: values.filter((entry) => entry.status === 'done'),
      failed: batchSnapshots.filter(
        (item) => imports[campusCourseKey(item.course)]?.status === 'error',
      ),
    };
  }, [imports, batchSnapshots]);

  function updateDraft(key: string, changes: Partial<ScheduleDraft>) {
    setDrafts((current) => {
      const draft = current[key];
      return draft ? { ...current, [key]: { ...draft, ...changes } } : current;
    });
  }

  function confirmedDraft(key: string): ScheduleDraft | null {
    return confirmed[key] ? (drafts[key] ?? null) : null;
  }

  async function importCourses(targets: CampusSyncSnapshot[]) {
    if (targets.length === 0 || busy) return;

    const incomplete = targets.find((item) => {
      const draft = confirmedDraft(campusCourseKey(item.course));
      return draft !== null && !isScheduleDraftComplete(draft);
    });

    if (incomplete) {
      setStatus(`Revisa el horario de ${courseLabel(incomplete)} antes de importar.`);
      return;
    }

    setBusy(true);
    setImports((current) => ({
      ...current,
      ...Object.fromEntries(targets.map((item) => [campusCourseKey(item.course), { status: 'pending' }])),
    }));

    const imported: Array<{ externalId: string; sessionId?: string }> = [];
    let failed = 0;

    for (const [index, item] of targets.entries()) {
      const key = campusCourseKey(item.course);
      setStatus(`Importando ${index + 1} / ${targets.length} · ${courseLabel(item)}`);
      setImports((current) => ({ ...current, [key]: { status: 'importing' } }));

      const plan = planCourseImport(item, {
        connectionId,
        subjects,
        links,
        usedSubjectIds: usedSubjects.current,
      });
      const response = await postIngest(buildIngestRequest(item, plan, confirmedDraft(key)));

      if ('error' in response) {
        failed += 1;
        setImports((current) => ({
          ...current,
          [key]: { status: 'error', error: ingestErrorMessage(response.error) },
        }));
        continue;
      }

      usedSubjects.current.add(response.subjectId);
      imported.push({
        externalId: item.course.externalId,
        ...(item.course.sessionId !== undefined ? { sessionId: item.course.sessionId } : {}),
      });
      setImports((current) => ({ ...current, [key]: { status: 'done', result: response } }));
    }

    // Only what reached Pulse leaves the extension; failures stay for a retry.
    if (imported.length > 0) {
      window.postMessage(
        { type: 'pulse:campus-sync:consumed', courses: imported },
        window.location.origin,
      );
    }

    setStatus(
      failed === 0
        ? `${plural(imported.length, 'materia importada', 'materias importadas')}.`
        : `${imported.length} importadas · ${failed} con error.`,
    );
    setBusy(false);
  }

  async function importSingle(mode: 'create' | 'link') {
    if (!snapshot || busy) return;
    if (mode === 'link' && !subjectId) return;

    const key = campusCourseKey(snapshot.course);
    const draft = confirmedDraft(key);

    if (draft && !isScheduleDraftComplete(draft)) {
      setStatus('Revisa los días y las horas antes de confirmar el horario.');
      return;
    }

    setBusy(true);
    setResult(null);
    setStatus(mode === 'create' ? 'Creando materia y guardando…' : 'Vinculando y guardando…');

    const response = await postIngest(
      buildIngestRequest(snapshot, mode === 'link' ? { mode, subjectId } : { mode }, draft),
    );

    if ('error' in response) {
      setStatus(ingestErrorMessage(response.error));
    } else {
      setResult(response);
      setStatus(
        response.createdSubject
          ? `${response.subjectName} fue creada y sincronizada.`
          : `${response.subjectName} quedó vinculada y sincronizada.`,
      );
      window.postMessage({ type: 'pulse:campus-sync:consumed' }, window.location.origin);
    }

    setBusy(false);
  }

  const singleKey = snapshot ? campusCourseKey(snapshot.course) : '';
  const singleSuggestion = snapshot ? inferCampusScheduleSuggestions(snapshot)[0] : undefined;
  const singleDraft = drafts[singleKey];
  const anyImported = Object.keys(imports).length > 0;

  return (
    <div className="mt-6">
      <p className="text-[color:var(--color-ink-muted)] text-sm" role="status" aria-live="polite">
        {status}
      </p>

      {receivedBatch ? (
        <section className="mt-6 border-y border-[color:var(--color-border)] py-5" aria-labelledby="bulk-sync-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="bulk-sync-heading" className="text-base font-medium">
                {plural(batchSnapshots.length, 'materia detectada', 'materias detectadas')}
                {sourceErrors.length > 0 ? ` · ${sourceErrors.length} sin leer` : ''}
              </h2>
              <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
                {batchTotals.assignments} tareas · {batchTotals.documents} documentos ·{' '}
                {batchTotals.announcements} anuncios · {batchTotals.events} eventos
              </p>
            </div>

            {batchSnapshots.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                {importCounts.failed.length > 0 && !busy ? (
                  <button
                    type="button"
                    onClick={() => void importCourses(importCounts.failed)}
                    className="rounded-sm border border-[color:var(--color-border)] px-3 py-2 text-sm"
                  >
                    Reintentar {importCounts.failed.length} con error
                  </button>
                ) : null}
                {!anyImported || busy ? (
                  <button
                    type="button"
                    onClick={() => void importCourses(batchSnapshots)}
                    disabled={busy}
                    className="rounded-sm border border-[color:var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
                  >
                    {busy ? 'Importando…' : 'Importar todas'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {batchSnapshots.length > 0 ? (
            <p className="text-[color:var(--color-ink-muted)] mt-3 max-w-2xl text-xs">
              Cada curso conserva la materia a la que ya está vinculado; si no, se une a una materia
              con el mismo código o nombre, y solo entonces se crea una nueva. Los horarios detectados
              se guardan únicamente si los confirmas.
            </p>
          ) : null}

          <ol className="mt-4 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)] text-sm">
            {batchSnapshots.map((item, index) => {
              const key = campusCourseKey(item.course);
              const suggestion = inferCampusScheduleSuggestions(item)[0];
              const draft = drafts[key];
              const entry = imports[key];
              const unread = unreadSections.get(key) ?? [];

              return (
                <li key={key} className="py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[color:var(--color-ink-muted)] w-6 shrink-0 text-xs tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="font-medium">{courseLabel(item)}</span>
                        <span
                          className={[
                            'text-xs uppercase tracking-wide',
                            entry?.status === 'error'
                              ? 'text-red-400'
                              : 'text-[color:var(--color-ink-muted)]',
                          ].join(' ')}
                        >
                          {entry ? IMPORT_STATUS_LABELS[entry.status] : null}
                        </span>
                      </div>

                      <p className="text-[color:var(--color-ink-muted)] mt-0.5 text-xs">
                        {plural(item.assignments.length, 'tarea')} ·{' '}
                        {plural(item.documents.length, 'documento')}
                        {unread.length > 0 ? ` · sin leer: ${unread.join(', ')}` : ''}
                      </p>

                      {entry?.status === 'error' ? (
                        <p className="mt-1 text-xs text-red-400">{entry.error}</p>
                      ) : null}

                      {entry?.status === 'done' ? (
                        <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
                          {entry.result.createdSubject ? 'Materia creada' : 'Vinculada'} ·{' '}
                          <a href={`/subjects/${entry.result.subjectId}`} className="underline underline-offset-4">
                            {entry.result.subjectName}
                          </a>{' '}
                          · {plural(entry.result.summary.newCount, 'nuevo')} ·{' '}
                          {plural(entry.result.summary.changedCount, 'cambiado')}
                        </p>
                      ) : null}

                      {suggestion && draft && entry?.status !== 'done' ? (
                        <ScheduleReview
                          id={`schedule-${index}`}
                          suggestion={suggestion}
                          draft={draft}
                          confirmed={Boolean(confirmed[key])}
                          disabled={busy}
                          onConfirmChange={(value) =>
                            setConfirmed((current) => ({ ...current, [key]: value }))
                          }
                          onDraftChange={(changes) => updateDraft(key, changes)}
                        />
                      ) : null}

                      {!suggestion && entry?.status !== 'done' ? (
                        <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
                          Sin horario claro en el campus.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {sourceErrors.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-medium">No se pudieron leer del campus</p>
              <ul className="text-[color:var(--color-ink-muted)] mt-2 space-y-1 text-xs">
                {sourceErrors.map((entry) => (
                  <li key={failureKey(entry)}>
                    {entry.title || entry.courseExternalId}: {entry.error}
                  </li>
                ))}
              </ul>
              <p className="text-[color:var(--color-ink-muted)] mt-2 text-xs">
                Reintenta estas materias desde la extensión con el campus abierto.
              </p>
            </div>
          ) : null}

          {importCounts.done.length > 0 && !busy ? (
            <a href="/tasks" className="mt-4 inline-block text-sm underline underline-offset-4">
              Ver tareas por materia
            </a>
          ) : null}
        </section>
      ) : null}

      {!receivedBatch && snapshot ? (
        <>
          <div className="mt-5 border-y border-[color:var(--color-border)] py-4">
            <p className="text-base font-medium">{courseLabel(snapshot)}</p>
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
              {snapshot.documents.length} documentos · {snapshot.assignments.length} tareas ·{' '}
              {snapshot.announcements.length} anuncios · {snapshot.events.length} eventos
            </p>
            {snapshot.assignments.length > 0 ? (
              <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
                Fechas detectadas:{' '}
                {snapshot.assignments.filter((assignment) => Boolean(assignment.dueAt)).length} de{' '}
                {snapshot.assignments.length} tareas. Pulse no inventa fechas que el campus no muestra.
              </p>
            ) : null}
          </div>

          {singleSuggestion && singleDraft ? (
            <ScheduleReview
              id="schedule-single"
              suggestion={singleSuggestion}
              draft={singleDraft}
              confirmed={Boolean(confirmed[singleKey])}
              disabled={busy}
              onConfirmChange={(value) => setConfirmed((current) => ({ ...current, [singleKey]: value }))}
              onDraftChange={(changes) => updateDraft(singleKey, changes)}
            />
          ) : (
            <p className="text-[color:var(--color-ink-muted)] mt-4 text-xs">
              No encontré un horario suficientemente claro. Puedes configurarlo manualmente después.
            </p>
          )}

          <div className="mt-6">
            <p className="text-sm font-medium">Crear desde el campus</p>
            <p className="text-[color:var(--color-ink-muted)] mt-1 max-w-xl text-xs">
              Pulse crea la materia con el nombre, código y docente detectados. Si confirmas el
              horario sugerido, también guarda esos días y horas.
            </p>
            <button
              type="button"
              onClick={() => void importSingle('create')}
              disabled={busy}
              className="mt-3 rounded-sm border border-[color:var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
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
                  className="block w-full rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2"
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
                onClick={() => void importSingle('link')}
                disabled={busy || !subjectId}
                className="mt-3 rounded-sm border border-[color:var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
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
