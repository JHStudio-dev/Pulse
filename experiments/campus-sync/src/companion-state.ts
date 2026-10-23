import type {
  CampusCourseRef,
  SyncedAnnouncement,
  SyncedAssignment,
  SyncedCourse,
  SyncedDocument,
  SyncedEvent,
} from './connector-contract.ts';

export const SNAPSHOT_STORAGE_KEY = 'pulseCampusSyncSnapshot';
export const BATCH_STORAGE_KEY = 'pulseCampusSyncBatch';
export const RUN_STORAGE_KEY = 'pulseCampusSyncRun';

/** A run that stops reporting for this long lost its campus tab. */
export const SYNC_RUN_STALE_AFTER_MS = 3 * 60 * 1000;

export type CampusSection = 'documents' | 'assignments' | 'announcements' | 'events';

export const CAMPUS_SECTION_LABELS: Record<CampusSection, string> = {
  documents: 'Documentos',
  assignments: 'Tareas',
  announcements: 'Anuncios',
  events: 'Agenda',
};

export interface CampusSnapshot {
  course: SyncedCourse;
  documents: SyncedDocument[];
  assignments: SyncedAssignment[];
  announcements: SyncedAnnouncement[];
  events: SyncedEvent[];
}

export interface CourseTarget extends CampusCourseRef {
  title?: string;
}

export interface CourseFailure {
  courseExternalId: string;
  sessionId?: string;
  title: string;
  error: string;
}

/** A section that could not be read. The rest of the course still syncs. */
export interface SectionWarning extends CourseFailure {
  section: CampusSection;
}

export interface StoredBatch {
  snapshots: CampusSnapshot[];
  errors: CourseFailure[];
  warnings: SectionWarning[];
}

export type CourseSyncStatus = 'pending' | 'syncing' | 'done' | 'error';

export interface CourseProgress {
  key: string;
  externalId: string;
  sessionId?: string;
  title: string;
  status: CourseSyncStatus;
  error?: string;
  unreadSections?: CampusSection[];
}

export interface SyncRun {
  id: string;
  mode: 'all' | 'retry';
  status: 'discovering' | 'running' | 'finished' | 'failed';
  startedAt: number;
  updatedAt: number;
  error?: string;
  courses: CourseProgress[];
}

export function campusCourseKey(course: { externalId: string; sessionId?: string | undefined }): string {
  return `${course.externalId}#${course.sessionId ?? ''}`;
}

function failureKey(failure: CourseFailure): string {
  return campusCourseKey({
    externalId: failure.courseExternalId,
    ...(failure.sessionId !== undefined ? { sessionId: failure.sessionId } : {}),
  });
}

export function createSyncRun(id: string, mode: SyncRun['mode'], now: number): SyncRun {
  return { id, mode, status: 'discovering', startedAt: now, updatedAt: now, courses: [] };
}

export function startSyncRunCourses(run: SyncRun, courses: CourseTarget[], now: number): SyncRun {
  return {
    ...run,
    status: 'running',
    updatedAt: now,
    courses: courses.map((course) => ({
      key: campusCourseKey(course),
      externalId: course.externalId,
      ...(course.sessionId !== undefined ? { sessionId: course.sessionId } : {}),
      title: course.title || course.externalId,
      status: 'pending',
    })),
  };
}

export function updateSyncRunCourse(
  run: SyncRun,
  key: string,
  changes: Partial<Pick<CourseProgress, 'status' | 'title' | 'error' | 'unreadSections'>>,
  now: number,
): SyncRun {
  return {
    ...run,
    updatedAt: now,
    courses: run.courses.map((course) => (course.key === key ? { ...course, ...changes } : course)),
  };
}

export function finishSyncRun(run: SyncRun, now: number): SyncRun {
  return { ...run, status: 'finished', updatedAt: now };
}

export function failSyncRun(run: SyncRun, error: string, now: number): SyncRun {
  return { ...run, status: 'failed', error, updatedAt: now };
}

export function isSyncRunActive(
  run: SyncRun | null | undefined,
  now: number,
  staleAfterMs = SYNC_RUN_STALE_AFTER_MS,
): boolean {
  if (!run || (run.status !== 'discovering' && run.status !== 'running')) return false;
  return now - run.updatedAt < staleAfterMs;
}

export function describeSyncRun(run: SyncRun): {
  total: number;
  finished: number;
  failed: number;
  current: { position: number; title: string } | null;
} {
  const index = run.courses.findIndex((course) => course.status === 'syncing');
  const current = index === -1 ? null : run.courses[index];

  return {
    total: run.courses.length,
    finished: run.courses.filter((course) => course.status === 'done' || course.status === 'error')
      .length,
    failed: run.courses.filter((course) => course.status === 'error').length,
    current: current ? { position: index + 1, title: current.title } : null,
  };
}

/**
 * Folds a retry into the stored batch.
 *
 * Courses that were retried and succeeded replace their old snapshot. A course
 * that fails again keeps an earlier snapshot if there is one, so a retry never
 * leaves less to import than before.
 */
export function mergeSyncBatch(previous: StoredBatch | null, next: StoredBatch): StoredBatch {
  if (!previous) return next;

  const synced = new Set(next.snapshots.map((snapshot) => campusCourseKey(snapshot.course)));
  const snapshots = previous.snapshots.map(
    (snapshot) =>
      next.snapshots.find(
        (candidate) => campusCourseKey(candidate.course) === campusCourseKey(snapshot.course),
      ) ?? snapshot,
  );

  for (const snapshot of next.snapshots) {
    const key = campusCourseKey(snapshot.course);
    if (!previous.snapshots.some((existing) => campusCourseKey(existing.course) === key)) {
      snapshots.push(snapshot);
    }
  }

  const available = new Set(snapshots.map((snapshot) => campusCourseKey(snapshot.course)));
  const failed = new Set(next.errors.map(failureKey));

  return {
    snapshots,
    errors: [
      ...previous.errors.filter((error) => {
        const key = failureKey(error);
        return !synced.has(key) && !failed.has(key);
      }),
      ...next.errors.filter((error) => !available.has(failureKey(error))),
    ],
    warnings: [
      ...previous.warnings.filter((warning) => !synced.has(failureKey(warning))),
      ...next.warnings,
    ],
  };
}

/** Courses worth another attempt: unreadable ones and ones missing a section. */
export function retryTargets(batch: StoredBatch): CourseTarget[] {
  const targets = new Map<string, CourseTarget>();

  for (const entry of [...batch.errors, ...batch.warnings]) {
    const key = failureKey(entry);
    if (targets.has(key)) continue;

    targets.set(key, {
      externalId: entry.courseExternalId,
      ...(entry.sessionId !== undefined ? { sessionId: entry.sessionId } : {}),
      title: entry.title,
    });
  }

  return [...targets.values()];
}

/** Removes courses Pulse already imported, keeping the rest for a later attempt. */
export function removeImportedCourses(
  batch: StoredBatch,
  imported: ReadonlyArray<{ externalId: string; sessionId?: string | undefined }>,
): StoredBatch {
  const keys = new Set(imported.map(campusCourseKey));

  return {
    snapshots: batch.snapshots.filter((snapshot) => !keys.has(campusCourseKey(snapshot.course))),
    errors: batch.errors,
    warnings: batch.warnings.filter((warning) => !keys.has(failureKey(warning))),
  };
}

/** Older companion builds stored a bare array or omitted warnings. */
export function readStoredBatch(value: unknown): StoredBatch | null {
  if (Array.isArray(value)) {
    return { snapshots: value as CampusSnapshot[], errors: [], warnings: [] };
  }

  if (!value || typeof value !== 'object') return null;

  const batch = value as Partial<Record<keyof StoredBatch, unknown>>;
  if (!Array.isArray(batch.snapshots)) return null;

  return {
    snapshots: batch.snapshots as CampusSnapshot[],
    errors: Array.isArray(batch.errors) ? (batch.errors as CourseFailure[]) : [],
    warnings: Array.isArray(batch.warnings) ? (batch.warnings as SectionWarning[]) : [],
  };
}

export interface CourseSyncResult {
  snapshot: CampusSnapshot;
  unread: Array<{ section: CampusSection; error: string }>;
}

/**
 * Reads each course in turn, saving progress after every step.
 *
 * One course failing never stops the others. A fatal error, such as an expired
 * campus session, marks the remaining courses failed without trying them, so a
 * later retry picks them up.
 */
export async function syncCourseBatch(
  initial: SyncRun,
  targets: CourseTarget[],
  options: {
    syncCourse: (course: CampusCourseRef) => Promise<CourseSyncResult>;
    save: (run: SyncRun) => Promise<void>;
    isFatal: (error: unknown) => boolean;
    now?: () => number;
  },
): Promise<{ run: SyncRun; batch: StoredBatch; fatalError: string | null }> {
  const now = options.now ?? Date.now;
  const batch: StoredBatch = { snapshots: [], errors: [], warnings: [] };
  let run = startSyncRunCourses(initial, targets, now());
  let fatalError: string | null = null;

  await options.save(run);

  for (const target of targets) {
    const key = campusCourseKey(target);
    const title = target.title || target.externalId;
    const course: CampusCourseRef = {
      externalId: target.externalId,
      ...(target.sessionId !== undefined ? { sessionId: target.sessionId } : {}),
    };
    const owner = {
      courseExternalId: target.externalId,
      ...(target.sessionId !== undefined ? { sessionId: target.sessionId } : {}),
    };

    if (fatalError !== null) {
      batch.errors.push({ ...owner, title, error: fatalError });
      run = updateSyncRunCourse(run, key, { status: 'error', error: fatalError }, now());
      continue;
    }

    run = updateSyncRunCourse(run, key, { status: 'syncing' }, now());
    await options.save(run);

    try {
      const { snapshot, unread } = await options.syncCourse(course);
      const courseTitle = snapshot.course.title || title;

      batch.snapshots.push(snapshot);
      batch.warnings.push(
        ...unread.map((entry) => ({ ...owner, title: courseTitle, ...entry })),
      );
      run = updateSyncRunCourse(
        run,
        key,
        { status: 'done', title: courseTitle, unreadSections: unread.map((entry) => entry.section) },
        now(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      batch.errors.push({ ...owner, title, error: message });
      run = updateSyncRunCourse(run, key, { status: 'error', error: message }, now());
      if (options.isFatal(error)) fatalError = message;
    }

    await options.save(run);
  }

  return { run, batch, fatalError };
}

export type SectionReaders = {
  [K in CampusSection]: () => Promise<CampusSnapshot[K]>;
};

/**
 * Reads every section of a course independently.
 *
 * A section is either complete or left out: a half-read list could look like
 * deleted work. The course fails only when nothing at all could be read.
 */
export async function readCourseSections(readers: SectionReaders): Promise<{
  sections: Pick<CampusSnapshot, CampusSection>;
  unread: Array<{ section: CampusSection; error: string }>;
}> {
  const names = Object.keys(readers) as CampusSection[];
  const results = await Promise.allSettled(names.map((name) => readers[name]()));

  const sections: Pick<CampusSnapshot, CampusSection> = {
    documents: [],
    assignments: [],
    announcements: [],
    events: [],
  };
  const unread: Array<{ section: CampusSection; error: string }> = [];

  results.forEach((result, index) => {
    const name = names[index]!;

    if (result.status === 'fulfilled') {
      Object.assign(sections, { [name]: result.value });
      return;
    }

    unread.push({
      section: name,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });

  if (unread.length === names.length) {
    throw new Error(unread[0]?.error ?? 'No se pudo leer la materia');
  }

  return { sections, unread };
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await map(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
