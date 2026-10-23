import {
  BATCH_STORAGE_KEY,
  SNAPSHOT_STORAGE_KEY,
  readStoredBatch,
  removeImportedCourses,
} from '../src/companion-state.ts';

type ImportedCourse = { externalId: string; sessionId?: string };

function importedCourses(value: unknown): ImportedCourse[] | null {
  if (!Array.isArray(value)) return null;

  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return [];

    const course = entry as { externalId?: unknown; sessionId?: unknown };
    if (typeof course.externalId !== 'string') return [];

    return [
      {
        externalId: course.externalId,
        ...(typeof course.sessionId === 'string' ? { sessionId: course.sessionId } : {}),
      },
    ];
  });
}

async function deliverPending(): Promise<void> {
  const stored = await chrome.storage.local.get([SNAPSHOT_STORAGE_KEY, BATCH_STORAGE_KEY]);
  const batch = readStoredBatch(stored[BATCH_STORAGE_KEY]);

  if (batch && (batch.snapshots.length > 0 || batch.errors.length > 0)) {
    window.postMessage(
      {
        type: 'pulse:campus-sync:batch',
        snapshots: batch.snapshots,
        errors: batch.errors,
        warnings: batch.warnings,
      },
      window.location.origin,
    );
    return;
  }

  const snapshot = stored[SNAPSHOT_STORAGE_KEY];
  if (!snapshot) return;

  window.postMessage({ type: 'pulse:campus-sync:snapshot', snapshot }, window.location.origin);
}

async function consume(courses: ImportedCourse[] | null): Promise<void> {
  if (!courses) {
    await chrome.storage.local.remove([SNAPSHOT_STORAGE_KEY, BATCH_STORAGE_KEY]);
    return;
  }

  const stored = await chrome.storage.local.get(BATCH_STORAGE_KEY);
  const batch = readStoredBatch(stored[BATCH_STORAGE_KEY]);
  if (!batch) return;

  const remaining = removeImportedCourses(batch, courses);

  if (remaining.snapshots.length === 0 && remaining.errors.length === 0) {
    await chrome.storage.local.remove(BATCH_STORAGE_KEY);
  } else {
    await chrome.storage.local.set({ [BATCH_STORAGE_KEY]: remaining });
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const message = event.data as { type?: unknown; courses?: unknown } | null;

  if (message?.type === 'pulse:campus-sync:request') {
    void deliverPending();
  }

  if (message?.type === 'pulse:campus-sync:consumed') {
    void consume(importedCourses(message.courses));
  }
});

// The page may have asked before this script was injected.
void deliverPending();
