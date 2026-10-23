import { describe, expect, it } from 'vitest';
import type { CampusSyncSnapshot, TaskId, UserId } from '@pulse/types';
import { removeTasks } from './academic-cleanup';
import { restoreDismissedCampusTask } from './campus-sync-apply';
import { ingestCampusSnapshot } from './campus-sync-ingest';
import { createMemoryCampusSync, makeSubject } from './testing/memory-campus-sync';

const STUDENT = 'student-a' as UserId;
const OTHER_STUDENT = 'student-b' as UserId;

type Assignment = { id: string; title: string; dueAt?: string };

function snapshot(assignments: Assignment[]): CampusSyncSnapshot {
  return {
    course: { externalId: 'ADM2011C1', sessionId: '0', title: 'Administración I' },
    documents: [],
    assignments: assignments.map((assignment) => ({
      externalId: assignment.id,
      courseExternalId: 'ADM2011C1',
      title: assignment.title,
      sourceUrl: `https://campus.ujcv.edu.hn/main/work/work_list.php?id=${assignment.id}`,
      ...(assignment.dueAt ? { dueAt: assignment.dueAt } : {}),
    })),
    announcements: [],
    events: [],
  };
}

const ESSAY: Assignment = { id: 'work-1', title: 'Ensayo 1', dueAt: '2026-10-12T23:45:00' };
const READING: Assignment = { id: 'work-2', title: 'Lectura' };

type Memory = ReturnType<typeof createMemoryCampusSync>;

function sync(memory: Memory, assignments: Assignment[], userId = STUDENT) {
  return ingestCampusSnapshot(
    userId,
    { mode: 'create', snapshot: snapshot(assignments) },
    memory.repositories,
  );
}

async function setUp(): Promise<Memory> {
  const memory = createMemoryCampusSync();
  memory.addStudent(STUDENT);
  await sync(memory, [ESSAY, READING]);
  return memory;
}

function taskTitled(memory: Memory, title: string, userId = STUDENT) {
  return memory.state.tasks.find((task) => task.userId === userId && task.title === title);
}

async function deleteEssay(memory: Memory): Promise<void> {
  await removeTasks(STUDENT, [taskTitled(memory, 'Ensayo 1')!.id], memory.repositories);
}

describe('campus tasks the student deleted', () => {
  it('stay deleted when the course syncs again', async () => {
    const memory = await setUp();
    await deleteEssay(memory);

    await sync(memory, [ESSAY, READING]);

    expect(memory.state.tasks.map((task) => task.title)).toEqual(['Lectura']);
  });

  it('stay deleted when the campus later changes them, while the change is still tracked', async () => {
    const memory = await setUp();
    await deleteEssay(memory);

    const outcome = await sync(memory, [{ ...ESSAY, dueAt: '2026-10-14T23:45:00' }, READING]);

    expect(outcome).toMatchObject({ ok: true, result: { summary: { changedCount: 1 } } });
    expect(taskTitled(memory, 'Ensayo 1')).toBeUndefined();
    expect(memory.state.items.find((item) => item.externalId === 'work-1')).toMatchObject({
      lastChangeKind: 'changed',
      payload: expect.objectContaining({ dueAt: '2026-10-14T23:45:00' }),
    });
  });

  it('stay deleted when the course moves to another subject', async () => {
    const memory = await setUp();
    await deleteEssay(memory);
    const target = makeSubject(STUDENT, memory.state.periods[0]!.id, { name: 'Otra' });
    memory.state.subjects.push(target);

    await ingestCampusSnapshot(
      STUDENT,
      { mode: 'link', subjectId: target.id, snapshot: snapshot([ESSAY, READING]) },
      memory.repositories,
    );

    expect(memory.state.tasks.map((task) => [task.title, task.subjectId])).toEqual([
      ['Lectura', target.id],
    ]);
  });

  it('do not stop new campus assignments from arriving', async () => {
    const memory = await setUp();
    await deleteEssay(memory);

    await sync(memory, [ESSAY, READING, { id: 'work-3', title: 'Examen parcial' }]);

    expect(memory.state.tasks.map((task) => task.title).sort()).toEqual([
      'Examen parcial',
      'Lectura',
    ]);
  });

  it('come back when a task disappears without the student deleting it', async () => {
    const memory = await setUp();
    memory.deleteTask(taskTitled(memory, 'Ensayo 1')!.id);

    await sync(memory, [ESSAY, READING]);

    expect(taskTitled(memory, 'Ensayo 1')).toBeDefined();
  });

  it('can be restored, and then keep following the campus', async () => {
    const memory = await setUp();
    await deleteEssay(memory);
    const [dismissed] = await memory.repositories.campusSync.listDismissedItems(STUDENT);

    expect(await restoreDismissedCampusTask(STUDENT, dismissed!.id, memory.repositories)).toBe(
      true,
    );
    expect(taskTitled(memory, 'Ensayo 1')?.dueDate).toBe('2026-10-12');
    expect(await memory.repositories.campusSync.listDismissedItems(STUDENT)).toEqual([]);

    await sync(memory, [{ ...ESSAY, dueAt: '2026-10-15T23:45:00' }, READING]);

    expect(memory.state.tasks.filter((task) => task.title === 'Ensayo 1')).toHaveLength(1);
    expect(taskTitled(memory, 'Ensayo 1')?.dueDate).toBe('2026-10-15');
  });

  it('keep updating when the deletion never completed', async () => {
    const memory = await setUp();
    const essay = taskTitled(memory, 'Ensayo 1')!;
    await memory.repositories.campusSync.dismissAppliedTasks(STUDENT, [essay.id]);

    await sync(memory, [{ ...ESSAY, dueAt: '2026-10-16T23:45:00' }, READING]);

    expect(memory.state.tasks.find((task) => task.id === essay.id)?.dueDate).toBe('2026-10-16');
  });

  it('are decided per student', async () => {
    const memory = await setUp();
    memory.addStudent(OTHER_STUDENT);
    await sync(memory, [ESSAY, READING], OTHER_STUDENT);

    await deleteEssay(memory);
    await sync(memory, [ESSAY, READING], OTHER_STUDENT);

    expect(
      memory.state.tasks.filter((task) => task.userId === OTHER_STUDENT).map((task) => task.title),
    ).toEqual(['Ensayo 1', 'Lectura']);
    expect(await memory.repositories.campusSync.listDismissedItems(OTHER_STUDENT)).toEqual([]);
  });

  it('leave manual tasks out of it', async () => {
    const memory = await setUp();
    const manual = await memory.repositories.tasks.create(STUDENT, {
      subjectId: null,
      title: 'Comprar cuaderno',
      description: null,
      assignedDate: null,
      dueDate: null,
      dueTime: null,
      status: 'pending',
      difficulty: null,
      progress: 0,
      estimatedMinutes: null,
      academicWeight: null,
    });

    await removeTasks(STUDENT, [manual.id as TaskId], memory.repositories);

    expect(await memory.repositories.campusSync.listDismissedItems(STUDENT)).toEqual([]);
    expect(memory.state.tasks).toHaveLength(2);
  });
});
