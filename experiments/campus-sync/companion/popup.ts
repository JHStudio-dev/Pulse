const status = document.querySelector<HTMLParagraphElement>('#status');
const output = document.querySelector<HTMLElement>('#output');
const inspect = document.querySelector<HTMLButtonElement>('#inspect');
const sync = document.querySelector<HTMLButtonElement>('#sync');
const syncAll = document.querySelector<HTMLButtonElement>('#sync-all');
const openPulse = document.querySelector<HTMLButtonElement>('#open-pulse');

const STORAGE_KEY = 'pulseCampusSyncSnapshot';
const BATCH_STORAGE_KEY = 'pulseCampusSyncBatch';
const PULSE_IMPORT_URL = 'http://localhost:3000/campus-sync/import';

function setBusy(busy: boolean): void {
  if (inspect) inspect.disabled = busy;
  if (sync) sync.disabled = busy;
  if (syncAll) syncAll.disabled = busy;
  if (openPulse && busy) openPulse.disabled = true;
}

async function refreshPendingState(): Promise<void> {
  if (!openPulse) return;
  const stored = await chrome.storage.local.get([STORAGE_KEY, BATCH_STORAGE_KEY]);
  openPulse.disabled = !stored[STORAGE_KEY] && !stored[BATCH_STORAGE_KEY];
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
  if (!status || !output) return;

  setBusy(true);

  try {
    const tab = await getActiveCampusTab();

    if (!tab?.id) {
      status.textContent = 'Open UJCV campus first.';
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'pulse:inspect',
    });

    status.textContent = response.ok
      ? `Detected: ${response.pageKind}`
      : 'Unsupported page';

    output.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    status.textContent = 'Could not inspect page';
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setBusy(false);
    await refreshPendingState();
  }
});

sync?.addEventListener('click', async () => {
  if (!status || !output) return;

  setBusy(true);
  status.textContent = 'Syncing course…';
  output.textContent = '';

  try {
    const tab = await getActiveCampusTab();

    if (!tab?.id) {
      status.textContent = 'Open a UJCV course first.';
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'pulse:sync-course',
    });

    if (!response.ok) {
      status.textContent = 'Sync failed';
      output.textContent = response.error ?? 'Unknown error';
      return;
    }

    const data = response.data;
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
    await chrome.storage.local.remove(BATCH_STORAGE_KEY);

    status.textContent = 'Course synced. Ready for Pulse.';
    if (openPulse) openPulse.disabled = false;
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
    status.textContent = 'Sync failed';
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setBusy(false);
    await refreshPendingState();
  }
});


syncAll?.addEventListener('click', async () => {
  if (!status || !output) return;

  setBusy(true);
  status.textContent = 'Syncing all courses…';
  output.textContent = '';

  try {
    const tab = await getActiveCampusTab();

    if (!tab?.id) {
      status.textContent = 'Open UJCV campus first.';
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'pulse:sync-all-courses',
    });

    if (!response.ok) {
      status.textContent = 'Bulk sync failed';
      output.textContent = response.error ?? 'Unknown error';
      return;
    }

    const batch = response.data;
    await chrome.storage.local.set({ [BATCH_STORAGE_KEY]: batch.snapshots });
    await chrome.storage.local.remove(STORAGE_KEY);

    const totals = batch.snapshots.reduce(
      (acc: { documents: number; assignments: number; announcements: number; events: number }, item: any) => ({
        documents: acc.documents + item.documents.length,
        assignments: acc.assignments + item.assignments.length,
        announcements: acc.announcements + item.announcements.length,
        events: acc.events + item.events.length,
      }),
      { documents: 0, assignments: 0, announcements: 0, events: 0 },
    );

    status.textContent = `${batch.snapshots.length} courses synced. Ready for Pulse.`;
    if (openPulse) openPulse.disabled = false;
    output.textContent = JSON.stringify(
      {
        courses: batch.snapshots.length,
        failed: batch.errors.length,
        ...totals,
        errors: batch.errors,
      },
      null,
      2,
    );
  } catch (error) {
    status.textContent = 'Bulk sync failed';
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    setBusy(false);
    await refreshPendingState();
  }
});

openPulse?.addEventListener('click', async () => {
  const stored = await chrome.storage.local.get([STORAGE_KEY, BATCH_STORAGE_KEY]);
  if (!stored[STORAGE_KEY] && !stored[BATCH_STORAGE_KEY]) {
    if (status) status.textContent = 'Sync a course first.';
    return;
  }

  await chrome.tabs.create({ url: PULSE_IMPORT_URL });
  window.close();
});

void refreshPendingState();
