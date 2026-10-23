import type { CampusAppliedTarget } from '@pulse/types';

/** Where a task or document came from on the campus. */
export interface CampusOrigin {
  sourceUrl: string | null;
  /** The campus no longer lists it; Pulse keeps it regardless. */
  removed: boolean;
}

export function campusOrigins(targets: readonly CampusAppliedTarget[]): {
  tasks: ReadonlyMap<string, CampusOrigin>;
  documents: ReadonlyMap<string, CampusOrigin>;
} {
  const tasks = new Map<string, CampusOrigin>();
  const documents = new Map<string, CampusOrigin>();

  for (const target of targets) {
    const origin = { sourceUrl: target.sourceUrl, removed: target.removedAt !== null };
    if (target.taskId) tasks.set(target.taskId, origin);
    if (target.documentId) documents.set(target.documentId, origin);
  }

  return { tasks, documents };
}
