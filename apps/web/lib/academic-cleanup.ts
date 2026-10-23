import type {
  AcademicPeriodRepository,
  CampusSyncRepository,
  ClassSessionRepository,
  DocumentRepository,
  NoteRepository,
  RecordingRepository,
  SubjectRepository,
  TaskRepository,
} from '@pulse/database';
import type { DocumentRecord, SubjectId, Task, TaskId, UserId } from '@pulse/types';

/**
 * Permanent removal of academic records.
 *
 * Deleting a subject in the database cascades to its schedules, class sessions,
 * recordings, assessments and Campus Sync link, while tasks, documents, notes
 * and inbox captures are detached and kept. These helpers decide what goes with
 * a subject on top of that:
 *
 * - its tasks, because the student asked for them to go;
 * - documents mirrored from the campus, which are links Campus Sync re-creates;
 * - stored recording files, whose rows the cascade removes anyway.
 *
 * Files the student uploaded, notes and inbox captures are kept unassigned.
 * Tasks never record a period, so bulk task removal is scoped through subjects.
 * Deleting a task that came from the campus records the decision on its campus
 * item, so the next sync does not bring it back.
 */

export interface AcademicCleanupRepositories {
  periods: Pick<AcademicPeriodRepository, 'findActive'>;
  subjects: Pick<
    SubjectRepository,
    'findById' | 'listByPeriod' | 'listArchivedByPeriod' | 'remove'
  >;
  tasks: Pick<TaskRepository, 'listByUser' | 'listBySubject' | 'removeMany'>;
  campusSync: Pick<CampusSyncRepository, 'dismissAppliedTasks'>;
  documents: Pick<DocumentRepository, 'listBySubject' | 'removeMany'>;
  notes: Pick<NoteRepository, 'listBySubject'>;
  sessions: Pick<ClassSessionRepository, 'listBySubject'>;
  recordings: Pick<RecordingRepository, 'listBySession'>;
  /** Deletes stored recording objects; throws when storage refuses. */
  removeRecordingFiles(paths: readonly string[]): Promise<void>;
}

export interface SubjectRemovalPreview {
  tasks: number;
  campusDocuments: number;
  keptDocuments: number;
  keptNotes: number;
}

export function isCampusMirror(document: Pick<DocumentRecord, 'source' | 'storagePath'>): boolean {
  return document.source === 'campus_sync' && document.storagePath === null;
}

export function tasksOfSubjects(tasks: readonly Task[], subjectIds: ReadonlySet<string>): Task[] {
  return tasks.filter((task) => task.subjectId !== null && subjectIds.has(task.subjectId));
}

export async function previewSubjectRemoval(
  userId: UserId,
  subjectId: SubjectId,
  repositories: Pick<AcademicCleanupRepositories, 'tasks' | 'documents' | 'notes'>,
): Promise<SubjectRemovalPreview> {
  const [tasks, documents, notes] = await Promise.all([
    repositories.tasks.listBySubject(userId, subjectId),
    repositories.documents.listBySubject(userId, subjectId),
    repositories.notes.listBySubject(userId, subjectId),
  ]);

  const campusDocuments = documents.filter(isCampusMirror).length;

  return {
    tasks: tasks.length,
    campusDocuments,
    keptDocuments: documents.length - campusDocuments,
    keptNotes: notes.length,
  };
}

async function recordingFilesOfSubject(
  userId: UserId,
  subjectId: SubjectId,
  repositories: Pick<AcademicCleanupRepositories, 'sessions' | 'recordings'>,
): Promise<string[]> {
  const sessions = await repositories.sessions.listBySubject(userId, subjectId);
  const recordings = (
    await Promise.all(
      sessions.map((session) => repositories.recordings.listBySession(userId, session.id)),
    )
  ).flat();

  return recordings.flatMap((recording) =>
    recording.audioStoragePath
      ? [recording.storagePath, recording.audioStoragePath]
      : [recording.storagePath],
  );
}

/**
 * Removes a subject with its tasks, campus mirrors and recording files.
 *
 * A storage failure stops before the subject row goes, so a recording is never
 * left listed without its audio.
 */
export async function removeSubjectPermanently(
  userId: UserId,
  subjectId: SubjectId,
  repositories: AcademicCleanupRepositories,
): Promise<void> {
  const [tasks, documents, recordingFiles] = await Promise.all([
    repositories.tasks.listBySubject(userId, subjectId),
    repositories.documents.listBySubject(userId, subjectId),
    recordingFilesOfSubject(userId, subjectId, repositories),
  ]);

  // Tasks first: once the subject is gone they could no longer be told apart.
  await repositories.tasks.removeMany(
    userId,
    tasks.map((task) => task.id),
  );
  await repositories.documents.removeMany(
    userId,
    documents.filter(isCampusMirror).map((document) => document.id),
  );

  if (recordingFiles.length > 0) await repositories.removeRecordingFiles(recordingFiles);

  await repositories.subjects.remove(userId, subjectId);
}

async function activePeriodSubjectIds(
  userId: UserId,
  repositories: Pick<AcademicCleanupRepositories, 'periods' | 'subjects'>,
): Promise<SubjectId[] | null> {
  const period = await repositories.periods.findActive(userId);
  if (!period) return null;

  const [active, archived] = await Promise.all([
    repositories.subjects.listByPeriod(userId, period.id),
    repositories.subjects.listArchivedByPeriod(userId, period.id),
  ]);

  return [...active, ...archived].map((subject) => subject.id);
}

/** Every subject of the active period, archived ones included. */
export async function removeActivePeriodSubjects(
  userId: UserId,
  repositories: AcademicCleanupRepositories,
): Promise<number> {
  const subjectIds = await activePeriodSubjectIds(userId, repositories);
  if (!subjectIds) return 0;

  for (const subjectId of subjectIds) {
    await removeSubjectPermanently(userId, subjectId, repositories);
  }

  return subjectIds.length;
}

/**
 * Deletes tasks the student chose to remove.
 *
 * The decision is recorded first: once a task is gone, nothing ties it back to
 * the campus assignment it came from. If the delete then fails, the task still
 * exists and keeps syncing, so a half-finished removal hides nothing.
 */
export async function removeTasks(
  userId: UserId,
  taskIds: readonly TaskId[],
  repositories: {
    tasks: Pick<TaskRepository, 'removeMany'>;
    campusSync: Pick<CampusSyncRepository, 'dismissAppliedTasks'>;
  },
): Promise<void> {
  if (taskIds.length === 0) return;

  await repositories.campusSync.dismissAppliedTasks(userId, taskIds);
  await repositories.tasks.removeMany(userId, taskIds);
}

/** Tasks of the active period's subjects. Tasks without a subject are left alone. */
export async function removeActivePeriodTasks(
  userId: UserId,
  repositories: Pick<AcademicCleanupRepositories, 'periods' | 'subjects' | 'tasks' | 'campusSync'>,
): Promise<number> {
  const subjectIds = await activePeriodSubjectIds(userId, repositories);
  if (!subjectIds) return 0;

  const tasks = tasksOfSubjects(await repositories.tasks.listByUser(userId), new Set(subjectIds));
  await removeTasks(
    userId,
    tasks.map((task) => task.id),
    repositories,
  );

  return tasks.length;
}

/** Tasks with no subject, which cannot be placed in any period. */
export async function removeUnassignedTasks(
  userId: UserId,
  repositories: Pick<AcademicCleanupRepositories, 'tasks' | 'campusSync'>,
): Promise<number> {
  const tasks = (await repositories.tasks.listByUser(userId)).filter(
    (task) => task.subjectId === null,
  );
  await removeTasks(
    userId,
    tasks.map((task) => task.id),
    repositories,
  );

  return tasks.length;
}
