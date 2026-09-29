const status = document.querySelector<HTMLParagraphElement>('#status');
const output = document.querySelector<HTMLElement>('#output');
const inspect = document.querySelector<HTMLButtonElement>('#inspect');
const sync = document.querySelector<HTMLButtonElement>('#sync');

function setBusy(busy: boolean): void {
  if (inspect) inspect.disabled = busy;
  if (sync) sync.disabled = busy;
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

    status.textContent = 'Course synced';
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
  }
});
