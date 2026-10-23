import { describe, expect, it } from 'vitest';
import type {
  AcademicPeriod,
  AcademicPeriodId,
  ClassSession,
  ClassSessionId,
  DocumentId,
  DocumentRecord,
  Note,
  Recording,
  Subject,
  SubjectId,
  Task,
  TaskId,
  UserId,
} from '@pulse/types';
import {
  previewSubjectRemoval,
  removeActivePeriodSubjects,
  removeActivePeriodTasks,
  removeSubjectPermanently,
  removeUnassignedTasks,
  type AcademicCleanupRepositories,
} from './academic-cleanup';
import { makePeriod, makeSubject } from './testing/memory-campus-sync';

const STUDENT = 'student-a' as UserId;
const OTHER_STUDENT = 'student-b' as UserId;

let sequence = 0;

function task(userId: UserId, subjectId: SubjectId | null, title: string): Task {
  sequence += 1;
  return {
    id: `task-${sequence}` as TaskId,
    userId,
    subjectId,
    title,
    description: null,
    assignedDate: null,
    dueDate: null,
    dueTime: null,
    status: 'pending',
    difficulty: null,
    progress: 0,
    estimatedMinutes: null,
    academicWeight: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function document(
  userId: UserId,
  subjectId: SubjectId,
  source: DocumentRecord['source'],
  storagePath: string | null,
): DocumentRecord {
  sequence += 1;
  return {
    id: `document-${sequence}` as DocumentId,
    userId,
    subjectId,
    classSessionId: null,
    title: `Documento ${sequence}`,
    source,
    storagePath,
    externalUrl: storagePath ? null : 'https://campus.ujcv.edu.hn/document.pdf',
    mimeType: null,
    sizeBytes: null,
    contentHash: null,
    replacesDocumentId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function world() {
  const periods: AcademicPeriod[] = [];
  const subjects: Subject[] = [];
  let tasks: Task[] = [];
  let documents: DocumentRecord[] = [];
  const notes: Array<Pick<Note, 'id' | 'userId' | 'subjectId'>> = [];
  // Sessions carry no owner field; the test keeps one beside each row.
  const sessions: Array<{ id: ClassSessionId; userId: UserId; subjectId: SubjectId }> = [];
  const recordings: Array<
    Pick<Recording, 'id' | 'userId' | 'classSessionId' | 'storagePath' | 'audioStoragePath'>
  > = [];
  const removedFiles: string[] = [];
  const dismissedTasks: string[] = [];
  let storageFails = false;

  const own = <T extends { userId: UserId }>(rows: T[], userId: UserId) =>
    rows.filter((row) => row.userId === userId);

  const repositories: AcademicCleanupRepositories = {
    periods: {
      async findActive(userId) {
        return own(periods, userId).find((period) => period.status === 'active') ?? null;
      },
    },
    subjects: {
      async findById(userId, id) {
        return own(subjects, userId).find((subject) => subject.id === id) ?? null;
      },
      async listByPeriod(userId, periodId) {
        return own(subjects, userId).filter(
          (subject) => subject.academicPeriodId === periodId && subject.archivedAt === null,
        );
      },
      async listArchivedByPeriod(userId, periodId) {
        return own(subjects, userId).filter(
          (subject) => subject.academicPeriodId === periodId && subject.archivedAt !== null,
        );
      },
      async remove(userId, id) {
        const index = subjects.findIndex(
          (subject) => subject.userId === userId && subject.id === id,
        );
        if (index !== -1) subjects.splice(index, 1);
        // Mirrors the foreign keys: tasks and documents are detached, not deleted.
        for (const row of [...tasks, ...documents]) {
          if (row.userId === userId && row.subjectId === id) row.subjectId = null;
        }
      },
    },
    tasks: {
      async listByUser(userId) {
        return own(tasks, userId);
      },
      async listBySubject(userId, subjectId) {
        return own(tasks, userId).filter((row) => row.subjectId === subjectId);
      },
      async removeMany(userId, ids) {
        tasks = tasks.filter((row) => row.userId !== userId || !ids.includes(row.id));
      },
    },
    campusSync: {
      async dismissAppliedTasks(_userId, ids) {
        dismissedTasks.push(...ids);
      },
    },
    documents: {
      async listBySubject(userId, subjectId) {
        return own(documents, userId).filter((row) => row.subjectId === subjectId);
      },
      async removeMany(userId, ids) {
        documents = documents.filter((row) => row.userId !== userId || !ids.includes(row.id));
      },
    },
    notes: {
      async listBySubject(userId, subjectId) {
        return own(notes, userId).filter((row) => row.subjectId === subjectId) as Note[];
      },
    },
    sessions: {
      async listBySubject(userId, subjectId) {
        return own(sessions, userId)
          .filter((row) => row.subjectId === subjectId)
          .map((row) => ({ id: row.id, subjectId: row.subjectId }) as ClassSession);
      },
    },
    recordings: {
      async listBySession(userId, sessionId) {
        return own(recordings, userId).filter(
          (row) => row.classSessionId === sessionId,
        ) as Recording[];
      },
    },
    async removeRecordingFiles(paths) {
      if (storageFails) throw new Error('storage unavailable');
      removedFiles.push(...paths);
    },
  };

  const current = makePeriod(STUDENT);
  const previous = makePeriod(STUDENT, { status: 'archived', name: 'I Periodo 2026' });
  periods.push(current, previous);

  return {
    current,
    previous,
    repositories,
    removedFiles,
    dismissedTasks,
    subjects,
    notes,
    sessions,
    recordings,
    get tasks() {
      return tasks;
    },
    get documents() {
      return documents;
    },
    add(subject: Subject) {
      subjects.push(subject);
      return subject;
    },
    addTask(row: Task) {
      tasks.push(row);
      return row;
    },
    addDocument(row: DocumentRecord) {
      documents.push(row);
      return row;
    },
    failStorage() {
      storageFails = true;
    },
  };
}

function subjectIn(periodId: AcademicPeriodId, overrides: Partial<Subject> = {}) {
  return makeSubject(STUDENT, periodId, overrides);
}

describe('removing a subject permanently', () => {
  it('removes its tasks and campus links but keeps uploads and notes', async () => {
    const w = world();
    const subject = w.add(subjectIn(w.current.id, { archivedAt: '2026-10-02T00:00:00.000Z' }));
    const other = w.add(subjectIn(w.current.id));
    w.addTask(task(STUDENT, subject.id, 'Ensayo'));
    w.addTask(task(STUDENT, other.id, 'Otra materia'));
    w.addDocument(document(STUDENT, subject.id, 'campus_sync', null));
    const upload = w.addDocument(document(STUDENT, subject.id, 'upload', 'student-a/apuntes.pdf'));
    w.notes.push({ id: 'note-1' as Note['id'], userId: STUDENT, subjectId: subject.id });

    expect(await previewSubjectRemoval(STUDENT, subject.id, w.repositories)).toEqual({
      tasks: 1,
      campusDocuments: 1,
      keptDocuments: 1,
      keptNotes: 1,
    });

    await removeSubjectPermanently(STUDENT, subject.id, w.repositories);

    // The campus link goes with the subject, so there is nothing to suppress.
    expect(w.dismissedTasks).toEqual([]);
    expect(w.subjects.map((row) => row.id)).toEqual([other.id]);
    expect(w.tasks.map((row) => row.title)).toEqual(['Otra materia']);
    expect(w.documents).toEqual([expect.objectContaining({ id: upload.id, subjectId: null })]);
  });

  it('removes stored recording files of its classes', async () => {
    const w = world();
    const subject = w.add(subjectIn(w.current.id));
    w.sessions.push({ id: 'session-1' as ClassSessionId, userId: STUDENT, subjectId: subject.id });
    w.recordings.push({
      id: 'recording-1' as Recording['id'],
      userId: STUDENT,
      classSessionId: 'session-1' as ClassSessionId,
      storagePath: 'student-a/clase.webm',
      audioStoragePath: 'student-a/clase.m4a',
    });

    await removeSubjectPermanently(STUDENT, subject.id, w.repositories);

    expect(w.removedFiles).toEqual(['student-a/clase.webm', 'student-a/clase.m4a']);
  });

  it('keeps the subject when its recording files cannot be removed', async () => {
    const w = world();
    const subject = w.add(subjectIn(w.current.id));
    w.sessions.push({ id: 'session-1' as ClassSessionId, userId: STUDENT, subjectId: subject.id });
    w.recordings.push({
      id: 'recording-1' as Recording['id'],
      userId: STUDENT,
      classSessionId: 'session-1' as ClassSessionId,
      storagePath: 'student-a/clase.webm',
      audioStoragePath: null,
    });
    w.failStorage();

    await expect(removeSubjectPermanently(STUDENT, subject.id, w.repositories)).rejects.toThrow();
    expect(w.subjects).toHaveLength(1);
  });

  it('removes every subject of the active period and nothing from earlier periods', async () => {
    const w = world();
    w.add(subjectIn(w.current.id));
    w.add(subjectIn(w.current.id, { archivedAt: '2026-10-02T00:00:00.000Z' }));
    const history = w.add(subjectIn(w.previous.id));
    w.addTask(task(STUDENT, history.id, 'Tarea histórica'));

    expect(await removeActivePeriodSubjects(STUDENT, w.repositories)).toBe(2);
    expect(w.subjects.map((row) => row.id)).toEqual([history.id]);
    expect(w.tasks.map((row) => row.title)).toEqual(['Tarea histórica']);
  });
});

describe('removing tasks in bulk', () => {
  it('removes only tasks of the active period, archived subjects included', async () => {
    const w = world();
    const active = w.add(subjectIn(w.current.id));
    const archived = w.add(subjectIn(w.current.id, { archivedAt: '2026-10-02T00:00:00.000Z' }));
    const history = w.add(subjectIn(w.previous.id));
    w.addTask(task(STUDENT, active.id, 'Actual'));
    w.addTask(task(STUDENT, archived.id, 'Archivada'));
    w.addTask(task(STUDENT, history.id, 'Histórica'));
    w.addTask(task(STUDENT, null, 'Sin materia'));

    expect(await removeActivePeriodTasks(STUDENT, w.repositories)).toBe(2);
    expect(w.tasks.map((row) => row.title)).toEqual(['Histórica', 'Sin materia']);
    // Campus tasks among them must not be reimported by the next sync.
    expect(w.dismissedTasks).toHaveLength(2);
  });

  it('removes tasks without a subject only when asked explicitly', async () => {
    const w = world();
    const active = w.add(subjectIn(w.current.id));
    w.addTask(task(STUDENT, active.id, 'Actual'));
    w.addTask(task(STUDENT, null, 'Sin materia'));

    expect(await removeUnassignedTasks(STUDENT, w.repositories)).toBe(1);
    expect(w.tasks.map((row) => row.title)).toEqual(['Actual']);
  });

  it('does nothing without an active period', async () => {
    const w = world();
    w.current.status = 'archived';
    const subject = w.add(subjectIn(w.current.id));
    w.addTask(task(STUDENT, subject.id, 'Actual'));

    expect(await removeActivePeriodTasks(STUDENT, w.repositories)).toBe(0);
    expect(w.tasks).toHaveLength(1);
  });

  it('never touches another student’s tasks', async () => {
    const w = world();
    w.addTask(task(OTHER_STUDENT, null, 'Ajena'));
    const mine = w.add(subjectIn(w.current.id));
    w.addTask(task(STUDENT, mine.id, 'Mía'));

    await removeUnassignedTasks(STUDENT, w.repositories);
    await removeActivePeriodTasks(STUDENT, w.repositories);

    expect(w.tasks.map((row) => row.title)).toEqual(['Ajena']);
  });
});
