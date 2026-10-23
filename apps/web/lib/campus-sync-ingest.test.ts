import { describe, expect, it } from 'vitest';
import type { CampusSyncSnapshot, SubjectId, UserId } from '@pulse/types';
import type { CampusSyncIngestRequest } from '@pulse/validation';
import { ingestCampusSnapshot } from './campus-sync-ingest';
import { createMemoryCampusSync, makePeriod, makeSubject } from './testing/memory-campus-sync';

const STUDENT = 'student-a' as UserId;
const OTHER_STUDENT = 'student-b' as UserId;

function snapshot(overrides: Partial<CampusSyncSnapshot['course']> = {}): CampusSyncSnapshot {
  const course = {
    externalId: 'ADM2011C1',
    sessionId: '0',
    title: 'Administración I',
    teacher: 'Lic. Martínez',
    ...overrides,
  };

  return {
    course,
    documents: [
      {
        externalId: 'doc-1',
        courseExternalId: course.externalId,
        name: 'Sílabo.pdf',
        kind: 'file',
        size: '1.2MB',
        sourceUrl: 'https://campus.ujcv.edu.hn/courses/ADM2011C1/document/silabo.pdf',
      },
      {
        externalId: 'folder-1',
        courseExternalId: course.externalId,
        name: 'Unidad 1',
        kind: 'folder',
        sourceUrl: 'https://campus.ujcv.edu.hn/main/document/document.php?id=2',
      },
    ],
    assignments: [
      {
        externalId: 'work-1',
        courseExternalId: course.externalId,
        title: 'Ensayo 1',
        dueAt: '2026-10-12T23:45:00',
        sourceUrl: 'https://campus.ujcv.edu.hn/main/work/work_list.php?id=1',
      },
      {
        externalId: 'work-2',
        courseExternalId: course.externalId,
        title: 'Lectura',
        sourceUrl: 'https://campus.ujcv.edu.hn/main/work/work_list.php?id=2',
      },
    ],
    announcements: [],
    events: [],
  };
}

function create(data: CampusSyncSnapshot, schedule?: CampusSyncIngestRequest['schedule']) {
  return { mode: 'create' as const, snapshot: data, ...(schedule ? { schedule } : {}) };
}

const SCHEDULE = {
  weekdays: [1, 3] as Array<1 | 3>,
  startTime: '18:00',
  endTime: '19:30',
  modality: 'virtual' as const,
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  location: { campus: null, building: null, room: null },
};

describe('campus snapshot ingestion', () => {
  it('creates the subject, its tasks and its file links on the first sync', async () => {
    const memory = createMemoryCampusSync();
    const { period } = memory.addStudent(STUDENT);

    const outcome = await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    expect(outcome).toMatchObject({
      ok: true,
      result: { createdSubject: true, subjectName: 'Administración I' },
    });
    expect(memory.state.subjects).toEqual([
      expect.objectContaining({
        academicPeriodId: period.id,
        name: 'Administración I',
        code: 'ADM2011C1',
        professorName: 'Lic. Martínez',
      }),
    ]);
    expect(memory.state.tasks.map((task) => [task.title, task.dueDate, task.dueTime])).toEqual([
      ['Ensayo 1', '2026-10-12', '23:45'],
      ['Lectura', null, null],
    ]);
    expect(memory.state.documents.map((document) => document.title)).toEqual(['Sílabo.pdf']);
  });

  it('changes nothing when the same snapshot arrives again', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);

    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);
    const second = await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    expect(second).toMatchObject({
      ok: true,
      result: { createdSubject: false, summary: { newCount: 0, changedCount: 0, unchangedCount: 4 } },
    });
    expect(memory.state.subjects).toHaveLength(1);
    expect(memory.state.links).toHaveLength(1);
    expect(memory.state.tasks).toHaveLength(2);
    expect(memory.state.documents).toHaveLength(1);
  });

  it('updates a task in place when its campus deadline changes', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);
    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    const moved = snapshot();
    moved.assignments[0]!.dueAt = '2026-10-14T23:45:00';
    const outcome = await ingestCampusSnapshot(STUDENT, create(moved), memory.repositories);

    expect(outcome).toMatchObject({ ok: true, result: { summary: { changedCount: 1 } } });
    expect(memory.state.tasks).toHaveLength(2);
    expect(memory.state.tasks[0]?.dueDate).toBe('2026-10-14');
  });

  it('never clears a deadline when a later sync arrives without one', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);
    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    const undated = snapshot();
    delete undated.assignments[0]!.dueAt;
    await ingestCampusSnapshot(STUDENT, create(undated), memory.repositories);

    expect(memory.state.tasks[0]?.dueDate).toBe('2026-10-12');
  });

  it('keeps earlier tasks when a section is missing from the snapshot', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);
    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    const partial = { ...snapshot(), assignments: [] };
    await ingestCampusSnapshot(STUDENT, create(partial), memory.repositories);

    expect(memory.state.tasks).toHaveLength(2);
  });

  it('reuses a link stored before session ids were normalized', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);
    await ingestCampusSnapshot(
      STUDENT,
      create(snapshot({ sessionId: undefined })),
      memory.repositories,
    );

    const outcome = await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    expect(outcome).toMatchObject({ ok: true, result: { createdSubject: false } });
    expect(memory.state.subjects).toHaveLength(1);
    expect(memory.state.tasks).toHaveLength(2);
    expect(memory.state.links).toEqual([expect.objectContaining({ externalSessionId: '0' })]);
  });

  it('treats a blank session id as no session', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);

    await ingestCampusSnapshot(STUDENT, create(snapshot({ sessionId: '' })), memory.repositories);
    await ingestCampusSnapshot(STUDENT, create(snapshot({ sessionId: '' })), memory.repositories);

    expect(memory.state.links).toEqual([expect.objectContaining({ externalSessionId: null })]);
    expect(memory.state.subjects).toHaveLength(1);
  });

  it('keeps two sessions of the same course apart', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);

    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);
    await ingestCampusSnapshot(
      STUDENT,
      create(snapshot({ sessionId: '7', title: 'Administración I - Verano' })),
      memory.repositories,
    );

    expect(memory.state.subjects.map((subject) => subject.name)).toEqual([
      'Administración I',
      'Administración I - Verano',
    ]);
  });

  it('recreates a task the student deleted while the course stays linked', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);
    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    memory.deleteTask(memory.state.tasks[0]!.id);
    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    expect(memory.state.tasks.map((task) => task.title).sort()).toEqual(['Ensayo 1', 'Lectura']);
  });
});

describe('confirmed schedules during ingestion', () => {
  it('stores the confirmed schedule on the synced subject only', async () => {
    const memory = createMemoryCampusSync();
    const { period } = memory.addStudent(STUDENT);
    const unrelated = makeSubject(STUDENT, period.id, { name: 'Historia', code: 'HIS101' });
    memory.state.subjects.push(unrelated);

    const outcome = await ingestCampusSnapshot(STUDENT, create(snapshot(), SCHEDULE), memory.repositories);
    if (!outcome.ok) throw new Error(outcome.error);

    expect(memory.state.schedules.map((slot) => [slot.subjectId, slot.weekday])).toEqual([
      [outcome.result.subjectId, 1],
      [outcome.result.subjectId, 3],
    ]);
    expect(memory.state.subjects.find((subject) => subject.id === outcome.result.subjectId)).toMatchObject({
      defaultModality: 'virtual',
      defaultMeetingUrl: 'https://meet.google.com/abc-defg-hij',
    });
  });

  it('does not repeat identical slots when the schedule is confirmed again', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);

    await ingestCampusSnapshot(STUDENT, create(snapshot(), SCHEDULE), memory.repositories);
    await ingestCampusSnapshot(STUDENT, create(snapshot(), SCHEDULE), memory.repositories);

    expect(memory.state.schedules).toHaveLength(2);
  });

  it('saves no schedule unless one was confirmed', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);

    await ingestCampusSnapshot(
      STUDENT,
      create(snapshot({ scheduleHints: ['Horario de clases: lunes 6:00 pm - 7:30 pm'] })),
      memory.repositories,
    );

    expect(memory.state.schedules).toEqual([]);
  });
});

describe('subjects outside the active period', () => {
  it('refuses a course still linked to a subject from an earlier period', async () => {
    const memory = createMemoryCampusSync();
    const { period } = memory.addStudent(STUDENT);
    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    period.status = 'archived';
    memory.state.periods.push(makePeriod(STUDENT, { name: 'III Periodo 2026' }));
    const tasksBefore = structuredClone(memory.state.tasks);

    const outcome = await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    expect(outcome).toEqual({ ok: false, status: 409, error: 'course_linked_to_previous_period' });
    expect(memory.state.subjects).toHaveLength(1);
    expect(memory.state.tasks).toEqual(tasksBefore);
  });

  it('refuses to link a course to a subject from another period', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);
    const old = makeSubject(STUDENT, makePeriod(STUDENT, { status: 'archived' }).id);
    memory.state.subjects.push(old);

    const outcome = await ingestCampusSnapshot(
      STUDENT,
      { mode: 'link', subjectId: old.id, snapshot: snapshot() },
      memory.repositories,
    );

    expect(outcome).toEqual({ ok: false, status: 409, error: 'subject_not_in_active_period' });
    expect(memory.state.links).toEqual([]);
  });

  it('restores an archived subject of the active period when its course syncs', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);
    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);
    memory.state.subjects[0]!.archivedAt = '2026-10-02T00:00:00.000Z';

    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    expect(memory.state.subjects[0]?.archivedAt).toBeNull();
  });
});

describe('ownership', () => {
  it('never reuses another student’s link or subject', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);
    memory.addStudent(OTHER_STUDENT);

    await ingestCampusSnapshot(OTHER_STUDENT, create(snapshot()), memory.repositories);
    await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    const mine = memory.state.subjects.filter((subject) => subject.userId === STUDENT);
    expect(mine).toHaveLength(1);
    expect(memory.state.tasks.filter((task) => task.userId === STUDENT)).toHaveLength(2);
    expect(memory.state.tasks.filter((task) => task.userId === OTHER_STUDENT)).toHaveLength(2);
  });

  it('does not link a course to another student’s subject', async () => {
    const memory = createMemoryCampusSync();
    memory.addStudent(STUDENT);
    const { period } = memory.addStudent(OTHER_STUDENT);
    const theirs = makeSubject(OTHER_STUDENT, period.id);
    memory.state.subjects.push(theirs);

    const outcome = await ingestCampusSnapshot(
      STUDENT,
      { mode: 'link', subjectId: theirs.id as SubjectId, snapshot: snapshot() },
      memory.repositories,
    );

    expect(outcome).toEqual({ ok: false, status: 404, error: 'subject_not_found' });
  });

  it('asks for an active period before creating anything', async () => {
    const memory = createMemoryCampusSync();
    const { period } = memory.addStudent(STUDENT);
    period.status = 'archived';

    const outcome = await ingestCampusSnapshot(STUDENT, create(snapshot()), memory.repositories);

    expect(outcome).toEqual({ ok: false, status: 409, error: 'active_period_not_found' });
    expect(memory.state.subjects).toEqual([]);
  });
});
