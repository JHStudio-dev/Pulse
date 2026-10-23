import { describe, expect, it } from 'vitest';
import type { AcademicPeriod, CampusSyncSnapshot, UserId } from '@pulse/types';
import { removeTasks } from './academic-cleanup';
import { ingestCampusSnapshot } from './campus-sync-ingest';
import { createMemoryCampusSync, makePeriod, makeSubject } from './testing/memory-campus-sync';

const STUDENT = 'student-a' as UserId;

function snapshot(assignments: string[] = ['Ensayo 1', 'Lectura']): CampusSyncSnapshot {
  return {
    course: { externalId: 'ADM2011C1', sessionId: '0', title: 'Administración I' },
    documents: [],
    assignments: assignments.map((title, index) => ({
      externalId: `work-${index + 1}`,
      courseExternalId: 'ADM2011C1',
      title,
      sourceUrl: `https://campus.ujcv.edu.hn/main/work/work_list.php?id=${index + 1}`,
    })),
    announcements: [],
    events: [],
  };
}

const SCHEDULE = {
  weekdays: [2, 4] as Array<2 | 4>,
  startTime: '07:00',
  endTime: '08:30',
  modality: 'in_person' as const,
  meetingUrl: null,
  location: { campus: null, building: null, room: null },
};

type Memory = ReturnType<typeof createMemoryCampusSync>;

function sync(memory: Memory, data = snapshot(), schedule?: typeof SCHEDULE) {
  return ingestCampusSnapshot(
    STUDENT,
    { mode: 'create', snapshot: data, ...(schedule ? { schedule } : {}) },
    memory.repositories,
  );
}

/** Closes the current period and opens the next one. */
function startNextPeriod(memory: Memory, previous: AcademicPeriod): AcademicPeriod {
  previous.status = 'archived';
  const next = makePeriod(STUDENT, { name: 'I Periodo 2027' });
  memory.state.periods.push(next);
  return next;
}

async function lastPeriodWithCourse() {
  const memory = createMemoryCampusSync();
  const { period } = memory.addStudent(STUDENT);
  await sync(memory, snapshot(), SCHEDULE);

  const oldSubject = memory.state.subjects[0]!;
  const oldLink = memory.state.links[0]!;
  return { memory, period, oldSubject, oldLink };
}

describe('a campus course returning in a new period', () => {
  it('becomes a new subject of the new period', async () => {
    const { memory, period } = await lastPeriodWithCourse();
    const next = startNextPeriod(memory, period);

    const outcome = await sync(memory);

    expect(outcome).toMatchObject({ ok: true, result: { createdSubject: true } });
    expect(memory.state.subjects.map((subject) => subject.academicPeriodId)).toEqual([
      period.id,
      next.id,
    ]);
    expect(memory.state.links.map((link) => link.academicPeriodId)).toEqual([period.id, next.id]);
  });

  it('leaves the old subject, its tasks and its sync history where they were', async () => {
    const { memory, period, oldSubject, oldLink } = await lastPeriodWithCourse();
    oldSubject.archivedAt = '2026-12-20T00:00:00.000Z';
    const oldTasks = structuredClone(memory.state.tasks);
    const oldItems = structuredClone(memory.state.items);
    const oldRuns = memory.state.runs.filter((run) => run.subjectLinkId === oldLink.id).length;
    startNextPeriod(memory, period);

    await sync(memory);

    expect(memory.state.subjects[0]).toMatchObject({
      id: oldSubject.id,
      academicPeriodId: period.id,
      archivedAt: '2026-12-20T00:00:00.000Z',
    });
    expect(memory.state.tasks.filter((task) => task.subjectId === oldSubject.id)).toEqual(oldTasks);
    expect(memory.state.items.filter((item) => item.subjectLinkId === oldLink.id)).toEqual(
      oldItems,
    );
    expect(memory.state.runs.filter((run) => run.subjectLinkId === oldLink.id)).toHaveLength(
      oldRuns,
    );
    expect(memory.state.links[0]).toMatchObject({ id: oldLink.id, subjectId: oldSubject.id });
  });

  it('gets its own tasks instead of moving the old ones', async () => {
    const { memory, period, oldSubject } = await lastPeriodWithCourse();
    startNextPeriod(memory, period);

    const outcome = await sync(memory);
    if (!outcome.ok) throw new Error(outcome.error);

    const bySubject = (subjectId: string) =>
      memory.state.tasks.filter((task) => task.subjectId === subjectId).map((task) => task.title);

    expect(bySubject(oldSubject.id)).toEqual(['Ensayo 1', 'Lectura']);
    expect(bySubject(outcome.result.subjectId)).toEqual(['Ensayo 1', 'Lectura']);
  });

  it('starts without the old schedule', async () => {
    const { memory, period, oldSubject } = await lastPeriodWithCourse();
    startNextPeriod(memory, period);

    const outcome = await sync(memory);
    if (!outcome.ok) throw new Error(outcome.error);

    expect(memory.state.schedules.every((slot) => slot.subjectId === oldSubject.id)).toBe(true);
    expect(memory.state.subjects[1]?.defaultModality).toBe('unconfirmed');
  });

  it('is not affected by tasks deleted in the old period', async () => {
    const { memory, period } = await lastPeriodWithCourse();
    await removeTasks(STUDENT, [memory.state.tasks[0]!.id], memory.repositories);
    startNextPeriod(memory, period);

    const outcome = await sync(memory);
    if (!outcome.ok) throw new Error(outcome.error);

    expect(
      memory.state.tasks
        .filter((task) => task.subjectId === outcome.result.subjectId)
        .map((task) => task.title),
    ).toEqual(['Ensayo 1', 'Lectura']);
  });

  it('can join a subject the student already made in the new period', async () => {
    const { memory, period, oldSubject } = await lastPeriodWithCourse();
    const next = startNextPeriod(memory, period);
    const planned = makeSubject(STUDENT, next.id, { name: 'Administración I', code: 'ADM2011C1' });
    memory.state.subjects.push(planned);

    const outcome = await ingestCampusSnapshot(
      STUDENT,
      { mode: 'link', subjectId: planned.id, snapshot: snapshot() },
      memory.repositories,
    );

    expect(outcome).toMatchObject({ ok: true, result: { subjectId: planned.id } });
    expect(memory.state.links.find((link) => link.subjectId === oldSubject.id)).toBeDefined();
    expect(memory.state.links.find((link) => link.subjectId === planned.id)).toMatchObject({
      academicPeriodId: next.id,
    });
  });

  it('stays a single subject when synced again in the new period', async () => {
    const { memory, period } = await lastPeriodWithCourse();
    startNextPeriod(memory, period);

    await sync(memory);
    await sync(memory);

    expect(memory.state.subjects).toHaveLength(2);
    expect(memory.state.links).toHaveLength(2);
    expect(memory.state.tasks).toHaveLength(4);
  });

  it('refuses to put the course in a subject of an earlier period', async () => {
    const { memory, period, oldSubject } = await lastPeriodWithCourse();
    startNextPeriod(memory, period);

    const outcome = await ingestCampusSnapshot(
      STUDENT,
      { mode: 'link', subjectId: oldSubject.id, snapshot: snapshot() },
      memory.repositories,
    );

    expect(outcome).toEqual({ ok: false, status: 409, error: 'subject_not_in_active_period' });
  });
});
