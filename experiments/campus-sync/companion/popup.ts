import {
  BATCH_STORAGE_KEY,
  CAMPUS_SECTION_LABELS,
  RUN_STORAGE_KEY,
  SNAPSHOT_STORAGE_KEY,
  campusCourseKey,
  describeSyncRun,
  isSyncRunActive,
  readStoredBatch,
  retryTargets,
  type CampusSection,
  type CampusSnapshot,
  type CourseProgress,
  type StoredBatch,
  type SyncRun,
} from '../src/companion-state.ts';
import type { StartSyncResponse, SyncCourseResponse } from './messages.ts';

const statusText = document.querySelector<HTMLParagraphElement>('#status');
const statusCard = document.querySelector<HTMLElement>('#status-card');
const output = document.querySelector<HTMLElement>('#output');
const inspect = document.querySelector<HTMLButtonElement>('#inspect');
const sync = document.querySelector<HTMLButtonElement>('#sync');
const syncAll = document.querySelector<HTMLButtonElement>('#sync-all');
const openPulse = document.querySelector<HTMLButtonElement>('#open-pulse');
const summary = document.querySelector<HTMLElement>('#summary');
const summaryTitle = document.querySelector<HTMLParagraphElement>('#summary-title');
const summarySubtitle = document.querySelector<HTMLParagraphElement>('#summary-subtitle');
const metricCourses = document.querySelector<HTMLElement>('#metric-courses');
const metricTasks = document.querySelector<HTMLElement>('#metric-tasks');
const metricDocs = document.querySelector<HTMLElement>('#metric-docs');
const metricNews = document.querySelector<HTMLElement>('#metric-news');
const metricEvents = document.querySelector<HTMLElement>('#metric-events');
const runSection = document.querySelector<HTMLElement>('#run');
const runTitle = document.querySelector<HTMLElement>('#run-title');
const runCount = document.querySelector<HTMLElement>('#run-count');
const runBar = document.querySelector<HTMLElement>('#run-bar');
const runList = document.querySelector<HTMLOListElement>('#run-list');
const retryFailed = document.querySelector<HTMLButtonElement>('#retry-failed');

const PULSE_IMPORT_URL = 'http://localhost:3000/campus-sync/import';

const STATUS_LABELS: Record<CourseProgress['status'], string> = {
  pending: 'Pendiente',
  syncing: 'Sincronizando',
  done: 'Lista',
  error: 'Error',
};

type StatusState = 'idle' | 'busy' | 'success' | 'error';

type PopupState = {
  run: SyncRun | null;
  batch: StoredBatch | null;
  snapshot: CampusSnapshot | null;
};

let state: PopupState = { run: null, batch: null, snapshot: null };
let singleSyncRunning = false;

function setStatus(message: string, tone: StatusState = 'idle'): void {
  if (statusText) statusText.textContent = message;
  if (statusCard) statusCard.dataset.state = tone;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function unreadLabel(sections: readonly CampusSection[]): string {
  if (sections.length === 1) return `${CAMPUS_SECTION_LABELS[sections[0]!]} sin leer`;
  return `${sections.length} secciones sin leer`;
}

function totals(snapshots: readonly CampusSnapshot[]) {
  return snapshots.reduce(
    (acc, item) => ({
      documents: acc.documents + item.documents.length,
      assignments: acc.assignments + item.assignments.length,
      announcements: acc.announcements + item.announcements.length,
      events: acc.events + item.events.length,
    }),
    { documents: 0, assignments: 0, announcements: 0, events: 0 },
  );
}

function showSummary(title: string, subtitle: string, snapshots: readonly CampusSnapshot[]): void {
  if (!summary) return;

  const sum = totals(snapshots);
  summary.hidden = false;
  if (summaryTitle) summaryTitle.textContent = title;
  if (summarySubtitle) summarySubtitle.textContent = subtitle;
  if (metricCourses) metricCourses.textContent = String(snapshots.length);
  if (metricTasks) metricTasks.textContent = String(sum.assignments);
  if (metricDocs) metricDocs.textContent = String(sum.documents);
  if (metricNews) metricNews.textContent = String(sum.announcements);
  if (metricEvents) metricEvents.textContent = String(sum.events);
}

function hideSummary(): void {
  if (summary) summary.hidden = true;
}

function runIsActive(): boolean {
  return isSyncRunActive(state.run, Date.now());
}

function renderControls(): void {
  const busy = singleSyncRunning || runIsActive();
  const pending = Boolean(state.snapshot) || (state.batch?.snapshots.length ?? 0) > 0;
  const retryable = state.batch ? retryTargets(state.batch).length : 0;

  if (inspect) inspect.disabled = busy;
  if (sync) sync.disabled = busy;
  if (syncAll) syncAll.disabled = busy;
  if (openPulse) openPulse.disabled = busy || !pending;

  if (retryFailed) {
    retryFailed.hidden = retryable === 0;
    retryFailed.disabled = busy;
    retryFailed.textContent = `Reintentar ${plural(retryable, 'materia')}`;
  }
}

function renderRunItem(course: CourseProgress, index: number): HTMLLIElement {
  const item = document.createElement('li');
  const position = document.createElement('span');
  const copy = document.createElement('span');
  const name = document.createElement('span');
  const label = document.createElement('span');

  item.className = 'run-item';
  item.dataset.status = course.status;
  if (course.status === 'syncing') item.setAttribute('aria-current', 'step');

  position.className = 'run-index';
  position.textContent = String(index + 1).padStart(2, '0');

  copy.className = 'run-copy';
  name.className = 'run-course';
  name.textContent = course.title;
  name.title = course.title;
  copy.append(name);

  const detail =
    course.status === 'error'
      ? course.error
      : course.unreadSections && course.unreadSections.length > 0
        ? unreadLabel(course.unreadSections)
        : undefined;

  if (detail) {
    const note = document.createElement('span');
    note.className = 'run-detail';
    note.textContent = detail;
    copy.append(note);
  }

  label.className = 'run-state';
  label.textContent = STATUS_LABELS[course.status];

  item.append(position, copy, label);
  return item;
}

function renderRun(): void {
  const run = state.run;

  if (!runSection || !run || run.courses.length === 0) {
    if (runSection) runSection.hidden = true;
    return;
  }

  const progress = describeSyncRun(run);
  runSection.hidden = false;

  if (runTitle) {
    runTitle.textContent = runIsActive()
      ? run.mode === 'retry'
        ? 'Reintento en curso'
        : 'Sincronización en curso'
      : 'Última sincronización';
  }
  if (runCount) runCount.textContent = `${progress.finished} / ${progress.total}`;
  if (runBar) {
    runBar.style.width = `${progress.total === 0 ? 0 : (progress.finished / progress.total) * 100}%`;
  }

  runList?.replaceChildren(...run.courses.map(renderRunItem));
}

function renderStatus(): void {
  const run = state.run;

  if (run && runIsActive()) {
    const progress = describeSyncRun(run);

    if (run.status === 'discovering') {
      setStatus('Buscando tus materias en el campus…', 'busy');
    } else if (progress.current) {
      setStatus(
        `${progress.current.position} / ${progress.total} · ${progress.current.title}`,
        'busy',
      );
    } else {
      setStatus(`Guardando ${plural(progress.total, 'materia')}…`, 'busy');
    }
    return;
  }

  if (run && (run.status === 'discovering' || run.status === 'running')) {
    setStatus(
      'La sincronización se interrumpió. Mantén la pestaña del campus abierta y vuelve a intentarlo.',
      'error',
    );
    return;
  }

  if (run?.status === 'failed') {
    setStatus(run.error ?? 'No se pudo completar la sincronización.', 'error');
    return;
  }

  const batch = state.batch;
  if (batch) {
    const ready = batch.snapshots.length;
    const failed = batch.errors.length;
    const partial = new Set(
      batch.warnings.map((warning) =>
        campusCourseKey({ externalId: warning.courseExternalId, sessionId: warning.sessionId }),
      ),
    ).size;

    const parts = [`${plural(ready, 'materia lista', 'materias listas')} para Pulse`];
    if (failed > 0) parts.push(`${failed} con error`);
    if (partial > 0) parts.push(`${partial} incompleta${partial === 1 ? '' : 's'}`);

    setStatus(`${parts.join(' · ')}.`, failed > 0 ? 'error' : partial > 0 ? 'idle' : 'success');
    return;
  }

  if (state.snapshot) {
    setStatus('Materia lista para importar en Pulse.', 'success');
    return;
  }

  setStatus('Listo para sincronizar.');
}

function renderBatchSummary(): void {
  const batch = state.batch;

  if (batch && batch.snapshots.length > 0) {
    showSummary(
      'Pendiente de importar',
      batch.errors.length > 0 ? `${batch.errors.length} con error` : 'Todo listo',
      batch.snapshots,
    );
  } else if (state.snapshot) {
    showSummary(
      state.snapshot.course.title || state.snapshot.course.externalId,
      state.snapshot.course.externalId,
      [state.snapshot],
    );
  } else {
    hideSummary();
  }
}

function render(): void {
  renderStatus();
  renderRun();
  renderBatchSummary();
  renderControls();
}

async function loadState(): Promise<void> {
  const stored = await chrome.storage.local.get([
    RUN_STORAGE_KEY,
    BATCH_STORAGE_KEY,
    SNAPSHOT_STORAGE_KEY,
  ]);

  state = {
    run: (stored[RUN_STORAGE_KEY] as SyncRun | undefined) ?? null,
    batch: readStoredBatch(stored[BATCH_STORAGE_KEY]),
    snapshot: (stored[SNAPSHOT_STORAGE_KEY] as CampusSnapshot | undefined) ?? null,
  };
}

async function getActiveCampusTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url?.startsWith('https://campus.ujcv.edu.hn/')) {
    return null;
  }

  return tab;
}

async function startBatch(message: unknown, busyMessage: string): Promise<void> {
  const tab = await getActiveCampusTab();

  if (!tab?.id) {
    setStatus('Abre primero el campus de UJCV.', 'error');
    return;
  }

  setStatus(busyMessage, 'busy');

  try {
    const response = (await chrome.tabs.sendMessage(tab.id, message)) as StartSyncResponse;
    if (!response.ok) setStatus(response.error, 'error');
  } catch (error) {
    setStatus('Recarga la pestaña del campus e inténtalo de nuevo.', 'error');
    if (output) output.textContent = error instanceof Error ? error.message : String(error);
  }
}

inspect?.addEventListener('click', async () => {
  if (!output) return;

  setStatus('Inspeccionando la página actual…', 'busy');

  try {
    const tab = await getActiveCampusTab();

    if (!tab?.id) {
      setStatus('Abre primero el campus de UJCV.', 'error');
      return;
    }

    const response = (await chrome.tabs.sendMessage(tab.id, { type: 'pulse:inspect' })) as {
      ok: boolean;
      pageKind: string;
    };

    setStatus(
      response.ok ? `Página detectada: ${response.pageKind}` : 'Esta página no es compatible.',
      response.ok ? 'success' : 'error',
    );

    output.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    setStatus('No se pudo inspeccionar la página.', 'error');
    output.textContent = error instanceof Error ? error.message : String(error);
  }
});

sync?.addEventListener('click', async () => {
  const tab = await getActiveCampusTab();

  if (!tab?.id) {
    setStatus('Abre una materia de UJCV antes de sincronizar.', 'error');
    return;
  }

  singleSyncRunning = true;
  renderControls();
  hideSummary();
  setStatus('Sincronizando la materia actual…', 'busy');
  if (output) output.textContent = '';

  try {
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: 'pulse:sync-course',
    })) as SyncCourseResponse;

    if (!response.ok) {
      setStatus(response.error, 'error');
      return;
    }

    await loadState();
    render();

    if (response.unread.length > 0) {
      setStatus(`Materia lista para Pulse · ${unreadLabel(response.unread)}.`);
    }

    if (output) {
      output.textContent = JSON.stringify(
        {
          course: response.snapshot.course.externalId,
          unread: response.unread,
          ...totals([response.snapshot]),
          data: response.snapshot,
        },
        null,
        2,
      );
    }
  } catch (error) {
    setStatus('Recarga la pestaña del campus e inténtalo de nuevo.', 'error');
    if (output) output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    singleSyncRunning = false;
    renderControls();
  }
});

syncAll?.addEventListener('click', () => {
  void startBatch({ type: 'pulse:sync-all-courses' }, 'Buscando tus materias en el campus…');
});

retryFailed?.addEventListener('click', () => {
  const courses = state.batch ? retryTargets(state.batch) : [];
  if (courses.length === 0) return;

  void startBatch(
    { type: 'pulse:sync-courses', courses },
    `Reintentando ${plural(courses.length, 'materia')}…`,
  );
});

openPulse?.addEventListener('click', async () => {
  if (!state.snapshot && (state.batch?.snapshots.length ?? 0) === 0) {
    setStatus('Primero sincroniza una materia o todas.', 'error');
    return;
  }

  await chrome.tabs.create({ url: PULSE_IMPORT_URL });
  window.close();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!(RUN_STORAGE_KEY in changes || BATCH_STORAGE_KEY in changes || SNAPSHOT_STORAGE_KEY in changes)) {
    return;
  }

  void loadState().then(render);
});

// Notices a run whose campus tab closed while the popup stays open.
window.setInterval(() => {
  if (state.run && (state.run.status === 'discovering' || state.run.status === 'running')) render();
}, 15_000);

void loadState().then(render);
