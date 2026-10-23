import { describe, expect, it } from 'vitest';
import type { CampusSyncSection, CampusSyncSnapshot, UserId } from '@pulse/types';
import { ingestCampusSnapshot } from './campus-sync-ingest';
import { createMemoryCampusSync } from './testing/memory-campus-sync';

const STUDENT = 'student-a' as UserId;
const ALL_SECTIONS: CampusSyncSection[] = ['documents', 'assignments', 'announcements', 'events'];

function snapshot(
  options: {
    assignments?: string[];
    documents?: string[];
    announcements?: string[];
    events?: string[];
    readSections?: CampusSyncSection[];
  } = {},
): CampusSyncSnapshot {
  const course = 'ADM2011C1';

  return {
    course: { externalId: course, sessionId: '0', title: 'Administración I' },
    documents: (options.documents ?? ['Sílabo.pdf']).map((name) => ({
      externalId: name,
      courseExternalId: course,
      name,
      kind: 'file' as const,
      sourceUrl: `https://campus.ujcv.edu.hn/courses/${course}/document/${name}`,
    })),
    assignments: (options.assignments ?? ['Ensayo 1', 'Lectura']).map((title) => ({
      externalId: title,
      courseExternalId: course,
      title,
      sourceUrl: `https://campus.ujcv.edu.hn/main/work/work_list.php?id=${encodeURIComponent(title)}`,
    })),
    announcements: (options.announcements ?? ['Bienvenida']).map((title) => ({
      externalId: title,
      courseExternalId: course,
      title,
      sourceUrl: `https://campus.ujcv.edu.hn/main/announcements/announcements.php?id=${encodeURIComponent(title)}`,
    })),
    events: (options.events ?? ['Examen parcial']).map((title) => ({
      courseExternalId: course,
      title,
      startsAt: '2026-11-03T08:00:00',
      allDay: false,
      sourceType: 'agenda' as const,
    })),
    ...(options.readSections ? { readSections: options.readSections } : {}),
  };
}

async function syncedCourse() {
  const memory = createMemoryCampusSync();
  memory.addStudent(STUDENT);
  await ingestCampusSnapshot(
    STUDENT,
    { mode: 'create', snapshot: snapshot({ readSections: ALL_SECTIONS }) },
    memory.repositories,
  );
  return memory;
}

function sync(memory: ReturnType<typeof createMemoryCampusSync>, data: CampusSyncSnapshot) {
  return ingestCampusSnapshot(STUDENT, { mode: 'create', snapshot: data }, memory.repositories);
}

function removed(memory: ReturnType<typeof createMemoryCampusSync>): string[] {
  return memory.state.items
    .filter((item) => item.removedAt !== null)
    .map((item) => `${item.kind}:${item.externalId}`);
}

describe('campus items that disappear', () => {
  it('are marked when a complete read no longer lists them', async () => {
    const memory = await syncedCourse();

    await sync(memory, snapshot({ assignments: ['Lectura'], readSections: ALL_SECTIONS }));

    expect(removed(memory)).toEqual(['assignment:Ensayo 1']);
  });

  it('keep the task the student already had', async () => {
    const memory = await syncedCourse();
    const before = structuredClone(memory.state.tasks);

    await sync(memory, snapshot({ assignments: ['Lectura'], readSections: ALL_SECTIONS }));

    expect(memory.state.tasks).toEqual(before);
  });

  it('are left alone when their section could not be read', async () => {
    const memory = await syncedCourse();

    await sync(
      memory,
      snapshot({
        assignments: [],
        announcements: [],
        readSections: ['documents', 'events'],
      }),
    );

    expect(removed(memory)).toEqual([]);
    expect(memory.state.tasks).toHaveLength(2);
  });

  it('are left alone when the snapshot does not say what was read', async () => {
    const memory = await syncedCourse();

    await sync(memory, snapshot({ assignments: [], documents: [], announcements: [] }));

    expect(removed(memory)).toEqual([]);
  });

  it('lose the mark when the campus lists them again', async () => {
    const memory = await syncedCourse();
    await sync(memory, snapshot({ assignments: ['Lectura'], readSections: ALL_SECTIONS }));

    await sync(memory, snapshot({ readSections: ALL_SECTIONS }));

    expect(removed(memory)).toEqual([]);
  });

  it('include documents and announcements, keeping their Pulse records', async () => {
    const memory = await syncedCourse();

    await sync(memory, snapshot({ documents: [], announcements: [], readSections: ALL_SECTIONS }));

    expect(removed(memory).sort()).toEqual(['announcement:Bienvenida', 'document:Sílabo.pdf']);
    expect(memory.state.documents).toHaveLength(1);
  });

  it('never include agenda events, which later reads do not reach back to', async () => {
    const memory = await syncedCourse();

    await sync(memory, snapshot({ events: [], readSections: ALL_SECTIONS }));

    expect(removed(memory)).toEqual([]);
  });

  it('stay scoped to the course that was synced', async () => {
    const memory = await syncedCourse();
    const other = snapshot({ readSections: ALL_SECTIONS });
    other.course = { externalId: 'MAT102B1', sessionId: '0', title: 'Geometría' };
    await sync(memory, other);

    await sync(memory, snapshot({ assignments: [], readSections: ALL_SECTIONS }));

    expect(removed(memory)).toEqual(['assignment:Ensayo 1', 'assignment:Lectura']);
  });
});
