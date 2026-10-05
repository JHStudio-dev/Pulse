const STORAGE_KEY = 'pulseCampusSyncSnapshot';
const BATCH_STORAGE_KEY = 'pulseCampusSyncBatch';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const message = event.data as { type?: string };

  if (message?.type === 'pulse:campus-sync:request') {
    void chrome.storage.local.get([STORAGE_KEY, BATCH_STORAGE_KEY]).then((stored) => {
      const storedBatch = stored[BATCH_STORAGE_KEY];

      if (Array.isArray(storedBatch) && storedBatch.length > 0) {
        window.postMessage(
          {
            type: 'pulse:campus-sync:batch',
            snapshots: storedBatch,
            errors: [],
          },
          window.location.origin,
        );
        return;
      }

      if (
        storedBatch &&
        typeof storedBatch === 'object' &&
        Array.isArray(storedBatch.snapshots) &&
        storedBatch.snapshots.length > 0
      ) {
        window.postMessage(
          {
            type: 'pulse:campus-sync:batch',
            snapshots: storedBatch.snapshots,
            errors: Array.isArray(storedBatch.errors) ? storedBatch.errors : [],
          },
          window.location.origin,
        );
        return;
      }

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
    void chrome.storage.local.remove([STORAGE_KEY, BATCH_STORAGE_KEY]);
  }
});
