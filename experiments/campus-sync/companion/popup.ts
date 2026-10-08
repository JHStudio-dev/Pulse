const status = document.querySelector<HTMLParagraphElement>('#status');
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
const failedSection = document.querySelector<HTMLElement>('#failed-section');
const failedList = document.querySelector<HTMLUListElement>('#failed-list');
const retryFailed = document.querySelector<HTMLButtonElement>('#retry-failed');

const STORAGE_KEY = 'pulseCampusSyncSnapshot';
const BATCH_STORAGE_KEY = 'pulseCampusSyncBatch';
const PULSE_IMPORT_URL = 'http://localhost:3000/campus-sync/import';

type StatusState = 'idle' | 'busy' | 'success' | 'error';

type CourseFailure = {
  courseExternalId: string;
  sessionId?: string;
  title: string;
  error: string;
};

type Snapshot = {
  course: {
    externalId: string;
    title?: string;
  };
  documents: unknown[];
  assignments: unknown[];
  announcements: unknown[];
  events: unknown[];
};

type StoredBatch = {
  snapshots: Snapshot[];
  errors: CourseFailure[];
};

type SummaryData = {
  title: string;
  subtitle?: string;
  courses: number;
  tasks: number;
  documents: number;
  announcements: number;
  events: number;
};

function setStatus(message: string, state: StatusState = 'idle'): void {
  if (status) status.textContent = message;
  if (statusCard) statusCard.dataset.state = state;
}

function showSummary(data: SummaryData): void {
  if (!summary) return;

  summary.hidden = false;
  if (summaryTitle) summaryTitle.textContent = data.title;
  if (summarySubtitle) summarySubtitle.textContent = data.subtitle ?? '';
  if (metricCourses) metricCourses.textContent = String(data.courses);
  if (metricTasks) metricTasks.textContent = String(data.tasks);
  if (metricDocs) metricDocs.textContent = String(data.documents);
  if (metricNews) metricNews.textContent = String(data.announcements);
  if (metricEvents) metricEvents.textContent = String(data.events);
}

function hideSummary(): void {
  if (summary) summary.hidden = true;
}

function setBusy(busy: boolean): void {
  if (inspect) inspect.disabled = busy;
  if (sync) sync.disabled = busy;
  if (syncAll) syncAll.disabled = busy;
  if (retryFailed) retryFailed.disabled = busy;
  if (openPulse && busy) openPulse.disabled = true;
}

function batchTotals(snapshots: Snapshot[]) {
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

function showFailures(errors: CourseFailure[]): void {
  if (!failedSection || !failedList) return;

  failedList.replaceChildren();

  if (errors.length === 0) {
    failedSection.hidden = true;
    return;
  }

  failedSection.hidden = false;

  for (const failure of errors) {
    const item = document.createElement('li');
    const course = document.createElement('span');
    const reason = document.createElement('span');

    course.className = 'failed-course';
    course.textContent = failure.title || failure.courseExternalId;

    reason.className = 'failed-reason';
    reason.textContent = failure.error;

    item.append(course, reason);
    failedList.append(item);
  }
}

function renderBatch(batch: StoredBatch): void {
  const totals = batchTotals(batch.snapshots);
  const failed = batch.errors.length;

  setStatus(
    failed === 0
      ? `${batch.snapshots.length} materias listas para Pulse.`
      : `${batch.snapshots.length} listas · ${failed} con error de lectura.`,
    failed === 0 ? 'success' : 'error',
  );

  showSummary({
    title: 'Sincronización completa',
    subtitle: failed > 0 ? `${failed} con error` : 'Todo listo',
    courses: batch.snapshots.length,
    tasks: totals.assignments,
    documents: totals.documents,
    announcements: totals.announcements,
    events: totals.events,
  });

  showFailures(batch.errors);

  if (output) {
    output.textContent = JSON.stringify(
      {
        courses: batch.snapshots.length,
        failed,
        ...totals,
        errors: batch.errors,
      },
      null,
      2,
    );
  }
}

async function refreshPendingState(): Promise<void> {
  if (!openPulse) return;

  const stored = await chrome.storage.local.get([STORAGE_KEY, BATCH_STORAGE_KEY]);
  const hasPending = Boolean(stored[STORAGE_KEY] || stored[BATCH_STORAGE_KEY]);
  openPulse.disabled = !hasPending;
}

async function getActiveCampusTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id || !tab.url?.startsWith('https://campus.ujcv.edu.hn/')) {
    return null;
  }

  return tab;
}

inspect?.addEventListener('click', async () => {
  if (!output) return;

  setBusy(true);
  hideSummary();
  showFailures([]);
  setStatus('Inspeccionando la página actual…', 'busy');

  try {
    const tab = await getActiveCampusTab();

    if (!tab?.id) {
      setStatus('Abre primero el campus de UJCV.', 'error');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'pulse:inspect',
    });

    setStatus(
      response.ok ? `Página detectada: ${response.pageKind}` : 'Esta página no es compatible.',
      response.ok ? 'success' : 'error',
    );

    output.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    setStatus('No se pudo inspeccionar la página.', 'error');
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setBusy(false);
    await refreshPendingState();
  }
});

sync?.addEventListener('click', async () => {
  if (!output) return;

  setBusy(true);
  hideSummary();
  showFailures([]);
  setStatus('Sincronizando la materia actual…', 'busy');
  output.textContent = '';

  try {
    const tab = await getActiveCampusTab();

    if (!tab?.id) {
      setStatus('Abre una materia de UJCV antes de sincronizar.', 'error');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'pulse:sync-course',
    });

    if (!response.ok) {
      setStatus('No se pudo sincronizar la materia.', 'error');
      output.textContent = response.error ?? 'Error desconocido';
      return;
    }

    const data = response.data as Snapshot;
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
    await chrome.storage.local.remove(BATCH_STORAGE_KEY);

    setStatus('Materia lista para importar en Pulse.', 'success');
    if (openPulse) openPulse.disabled = false;

    showSummary({
      title: data.course.title ?? data.course.externalId,
      subtitle: data.course.externalId,
      courses: 1,
      tasks: data.assignments.length,
      documents: data.documents.length,
      announcements: data.announcements.length,
      events: data.events.length,
    });

    output.textContent = JSON.stringify(
      {
        course: data.course.externalId,
        documents: data.documents.length,
        assignments: data.assignments.length,
        announcements: data.announcements.length,
        events: data.events.length,
        data,
      },
      null,
      2,
    );
  } catch (error) {
    setStatus('No se pudo sincronizar la materia.', 'error');
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setBusy(false);
    await refreshPendingState();
  }
});

syncAll?.addEventListener('click', async () => {
  if (!output) return;

  setBusy(true);
  hideSummary();
  showFailures([]);
  setStatus('Buscando y sincronizando todas tus materias…', 'busy');
  output.textContent = '';

  try {
    const tab = await getActiveCampusTab();

    if (!tab?.id) {
      setStatus('Abre primero el campus de UJCV.', 'error');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'pulse:sync-all-courses',
    });

    if (!response.ok) {
      setStatus('No se pudo completar la sincronización masiva.', 'error');
      output.textContent = response.error ?? 'Error desconocido';
      return;
    }

    const batch = response.data as StoredBatch;

    await chrome.storage.local.set({ [BATCH_STORAGE_KEY]: batch });
    await chrome.storage.local.remove(STORAGE_KEY);

    renderBatch(batch);
    if (openPulse) openPulse.disabled = false;
  } catch (error) {
    setStatus('No se pudo completar la sincronización masiva.', 'error');
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setBusy(false);
    await refreshPendingState();
  }
});

retryFailed?.addEventListener('click', async () => {
  if (!output) return;

  const stored = await chrome.storage.local.get(BATCH_STORAGE_KEY);
  const batch = stored[BATCH_STORAGE_KEY] as StoredBatch | undefined;

  if (!batch || !Array.isArray(batch.errors) || batch.errors.length === 0) {
    showFailures([]);
    return;
  }

  setBusy(true);
  setStatus(`Reintentando ${batch.errors.length} materia${batch.errors.length === 1 ? '' : 's'}…`, 'busy');

  try {
    const tab = await getActiveCampusTab();

    if (!tab?.id) {
      setStatus('Abre primero el campus de UJCV.', 'error');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'pulse:sync-courses',
      courses: batch.errors.map((failure) => ({
        externalId: failure.courseExternalId,
        ...(failure.sessionId !== undefined ? { sessionId: failure.sessionId } : {}),
        title: failure.title,
      })),
    });

    if (!response.ok) {
      setStatus('No se pudieron reintentar las materias.', 'error');
      output.textContent = response.error ?? 'Error desconocido';
      return;
    }

    const retried = response.data as StoredBatch;
    const merged = new Map(batch.snapshots.map((item) => [item.course.externalId, item]));

    for (const item of retried.snapshots) {
      merged.set(item.course.externalId, item);
    }

    const nextBatch: StoredBatch = {
      snapshots: [...merged.values()],
      errors: retried.errors,
    };

    await chrome.storage.local.set({ [BATCH_STORAGE_KEY]: nextBatch });
    renderBatch(nextBatch);

    if (nextBatch.errors.length === 0) {
      setStatus(`${nextBatch.snapshots.length} materias listas para Pulse.`, 'success');
    }
  } catch (error) {
    setStatus('No se pudieron reintentar las materias.', 'error');
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setBusy(false);
    await refreshPendingState();
  }
});

openPulse?.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get([STORAGE_KEY, BATCH_STORAGE_KEY]);

  if (!stored[STORAGE_KEY] && !stored[BATCH_STORAGE_KEY]) {
    setStatus('Primero sincroniza una materia o todas.', 'error');
    return;
  }

  await chrome.tabs.create({ url: PULSE_IMPORT_URL });
  window.close();
});

void refreshPendingState();
