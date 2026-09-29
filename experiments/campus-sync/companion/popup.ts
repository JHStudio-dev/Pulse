const status = document.querySelector<HTMLParagraphElement>('#status');
const output = document.querySelector<HTMLElement>('#output');
const inspect = document.querySelector<HTMLButtonElement>('#inspect');

inspect?.addEventListener('click', async () => {
  if (!status || !output) return;

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      status.textContent = 'No active tab.';
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'pulse:inspect',
    });

    status.textContent = response.ok ? `Detected: ${response.pageKind}` : 'Unsupported page';

    output.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    status.textContent = 'Could not inspect page';

    output.textContent = error instanceof Error ? error.message : String(error);
  }
});
