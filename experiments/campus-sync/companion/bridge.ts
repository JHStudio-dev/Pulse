const STORAGE_KEY = 'pulseCampusSyncSnapshot';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const message = event.data as { type?: string };

  if (message?.type === 'pulse:campus-sync:request') {
    void chrome.storage.local.get(STORAGE_KEY).then((stored) => {
      const snapshot = stored[STORAGE_KEY];
      if (!snapshot) return;

      window.postMessage(
        {
          type: 'pulse:campus-sync:snapshot',
          snapshot,
        },
        window.location.origin,
      );
    });
  }

  if (message?.type === 'pulse:campus-sync:consumed') {
    void chrome.storage.local.remove(STORAGE_KEY);
  }
});
