import { describe, expect, it } from 'vitest';
import {
  campusCourseKey,
  createSyncRun,
  describeSyncRun,
  failSyncRun,
  finishSyncRun,
  isSyncRunActive,
  mapWithConcurrency,
  mergeSyncBatch,
  readCourseSections,
  readStoredBatch,
  removeImportedCourses,
  retryTargets,
  startSyncRunCourses,
  syncCourseBatch,
  updateSyncRunCourse,
  type CampusSnapshot,
  type SyncRun,
  type StoredBatch,
} from './companion-state.ts';

function snapshot(externalId: string, sessionId = '0', assignments = 0): CampusSnapshot {
  return {
    course: {
      externalId,
      sessionId,
      title: externalId,
      sourceUrl: `https://campus.ujcv.edu.hn/courses/${externalId}/index.php`,
    },
    documents: [],
    assignments: Array.from({ length: assignments }, (_, index) => ({
      externalId: `${externalId}-${index}`,
      courseExternalId: externalId,
      title: `Tarea ${index + 1}`,
      sourceUrl: `https://campus.ujcv.edu.hn/main/work/work_list.php?id=${index}`,
    })),
    announcements: [],
    events: [],
  };
}

const EMPTY: StoredBatch = { snapshots: [], errors: [], warnings: [] };

describe('sync run progress', () => {
  const courses = [
    { externalId: 'HIS101', sessionId: '0', title: 'Historia de Honduras' },
    { externalId: 'MAT102', sessionId: '0', title: 'Geometría y Trigonometría' },
    { externalId: 'ADM201', sessionId: '0' },
  ];

  it('starts every course as pending', () => {
    const run = startSyncRunCourses(createSyncRun('run', 'all', 0), courses, 10);

    expect(run.status).toBe('running');
    expect(run.courses.map((course) => [course.title, course.status])).toEqual([
      ['Historia de Honduras', 'pending'],
      ['Geometría y Trigonometría', 'pending'],
      ['ADM201', 'pending'],
    ]);
  });

  it('reports the course being read and how many are finished', () => {
    let run = startSyncRunCourses(createSyncRun('run', 'all', 0), courses, 0);
    run = updateSyncRunCourse(run, campusCourseKey(courses[0]!), { status: 'done' }, 1);
    run = updateSyncRunCourse(run, campusCourseKey(courses[1]!), { status: 'syncing' }, 2);

    expect(describeSyncRun(run)).toEqual({
      total: 3,
      finished: 1,
      failed: 0,
      current: { position: 2, title: 'Geometría y Trigonometría' },
    });
  });

  it('counts failed courses as finished', () => {
    let run = startSyncRunCourses(createSyncRun('run', 'all', 0), courses, 0);
    run = updateSyncRunCourse(
      run,
      campusCourseKey(courses[2]!),
      { status: 'error', error: 'Campus page timed out' },
      1,
    );

    expect(describeSyncRun(run)).toMatchObject({ finished: 1, failed: 1, current: null });
  });

  it('treats a run that stopped reporting as interrupted', () => {
    const run = startSyncRunCourses(createSyncRun('run', 'all', 0), courses, 1_000);

    expect(isSyncRunActive(run, 2_000, 5_000)).toBe(true);
    expect(isSyncRunActive(run, 7_000, 5_000)).toBe(false);
    expect(isSyncRunActive(finishSyncRun(run, 2_000), 2_000, 5_000)).toBe(false);
    expect(isSyncRunActive(failSyncRun(run, 'x', 2_000), 2_000, 5_000)).toBe(false);
    expect(isSyncRunActive(null, 0)).toBe(false);
  });
});

describe('retrying a batch', () => {
  it('replaces a course that now synced and drops its old error', () => {
    const previous: StoredBatch = {
      snapshots: [snapshot('HIS101')],
      errors: [{ courseExternalId: 'MAT102', sessionId: '0', title: 'Geometría', error: 'timeout' }],
      warnings: [],
    };

    const merged = mergeSyncBatch(previous, {
      snapshots: [snapshot('MAT102', '0', 2)],
      errors: [],
      warnings: [],
    });

    expect(merged.snapshots.map((item) => item.course.externalId)).toEqual(['HIS101', 'MAT102']);
    expect(merged.errors).toEqual([]);
  });

  it('keeps an earlier snapshot when the retry fails', () => {
    const previous: StoredBatch = {
      snapshots: [snapshot('HIS101', '0', 3)],
      errors: [],
      warnings: [
        {
          courseExternalId: 'HIS101',
          sessionId: '0',
          title: 'Historia',
          section: 'announcements',
          error: 'timeout',
        },
      ],
    };

    const merged = mergeSyncBatch(previous, {
      snapshots: [],
      errors: [{ courseExternalId: 'HIS101', sessionId: '0', title: 'Historia', error: 'HTTP 500' }],
      warnings: [],
    });

    expect(merged.snapshots[0]?.assignments).toHaveLength(3);
    expect(merged.errors).toEqual([]);
    expect(merged.warnings).toHaveLength(1);
  });

  it('replaces section warnings once the course is read again', () => {
    const previous: StoredBatch = {
      snapshots: [snapshot('HIS101')],
      errors: [],
      warnings: [
        {
          courseExternalId: 'HIS101',
          sessionId: '0',
          title: 'Historia',
          section: 'announcements',
          error: 'timeout',
        },
      ],
    };

    const merged = mergeSyncBatch(previous, { snapshots: [snapshot('HIS101')], errors: [], warnings: [] });
    expect(merged.warnings).toEqual([]);
  });

  it('does not confuse two sessions of the same course', () => {
    const previous: StoredBatch = { snapshots: [snapshot('ADM201', '0', 1)], errors: [], warnings: [] };
    const merged = mergeSyncBatch(previous, {
      snapshots: [snapshot('ADM201', '7', 4)],
      errors: [],
      warnings: [],
    });

    expect(merged.snapshots.map((item) => [item.course.sessionId, item.assignments.length])).toEqual([
      ['0', 1],
      ['7', 4],
    ]);
  });

  it('starts fresh when there is nothing stored', () => {
    const next: StoredBatch = { snapshots: [snapshot('HIS101')], errors: [], warnings: [] };
    expect(mergeSyncBatch(null, next)).toBe(next);
  });

  it('retries failed courses and courses with unread sections once each', () => {
    const targets = retryTargets({
      snapshots: [snapshot('HIS101')],
      errors: [{ courseExternalId: 'MAT102', sessionId: '0', title: 'Geometría', error: 'x' }],
      warnings: [
        { courseExternalId: 'HIS101', sessionId: '0', title: 'Historia', section: 'events', error: 'x' },
        { courseExternalId: 'HIS101', sessionId: '0', title: 'Historia', section: 'announcements', error: 'x' },
      ],
    });

    expect(targets).toEqual([
      { externalId: 'MAT102', sessionId: '0', title: 'Geometría' },
      { externalId: 'HIS101', sessionId: '0', title: 'Historia' },
    ]);
  });
});

describe('stored batch', () => {
  it('removes only the courses Pulse imported', () => {
    const batch: StoredBatch = {
      snapshots: [snapshot('HIS101'), snapshot('MAT102')],
      errors: [{ courseExternalId: 'ADM201', sessionId: '0', title: 'Administración', error: 'x' }],
      warnings: [
        { courseExternalId: 'HIS101', sessionId: '0', title: 'Historia', section: 'events', error: 'x' },
      ],
    };

    const remaining = removeImportedCourses(batch, [{ externalId: 'HIS101', sessionId: '0' }]);

    expect(remaining.snapshots.map((item) => item.course.externalId)).toEqual(['MAT102']);
    expect(remaining.errors).toHaveLength(1);
    expect(remaining.warnings).toEqual([]);
  });

  it('reads the formats older builds stored', () => {
    expect(readStoredBatch([snapshot('HIS101')])?.snapshots).toHaveLength(1);
    expect(readStoredBatch({ snapshots: [snapshot('HIS101')], errors: [] })?.warnings).toEqual([]);
    expect(readStoredBatch({ errors: [] })).toBeNull();
    expect(readStoredBatch(undefined)).toBeNull();
    expect(readStoredBatch(EMPTY)).toEqual(EMPTY);
  });
});

describe('reading course sections', () => {
  it('keeps the readable sections when one tool fails', async () => {
    const result = await readCourseSections({
      documents: async () => [],
      assignments: async () => snapshot('HIS101', '0', 2).assignments,
      announcements: async () => {
        throw new Error('Campus returned HTTP 403');
      },
      events: async () => [],
    });

    expect(result.sections.assignments).toHaveLength(2);
    expect(result.sections.announcements).toEqual([]);
    expect(result.unread).toEqual([{ section: 'announcements', error: 'Campus returned HTTP 403' }]);
  });

  it('fails the course when no section could be read', async () => {
    const fail = async (): Promise<never> => {
      throw new Error('La sesión del campus expiró');
    };

    await expect(
      readCourseSections({ documents: fail, assignments: fail, announcements: fail, events: fail }),
    ).rejects.toThrow('La sesión del campus expiró');
  });
});

describe('bounded concurrency', () => {
  it('keeps result order and never exceeds the limit', async () => {
    let running = 0;
    let peak = 0;

    const results = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, value));
      running -= 1;
      return value * 10;
    });

    expect(results).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });

  it('stops at the first failure', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (value) => {
        if (value === 2) throw new Error('detail page failed');
        return value;
      }),
    ).rejects.toThrow('detail page failed');
  });
});

describe('syncing a batch of courses', () => {
  const targets = [
    { externalId: 'HIS101', sessionId: '0', title: 'Historia de Honduras' },
    { externalId: 'MAT102', sessionId: '0', title: 'Geometría y Trigonometría' },
    { externalId: 'ADM201', sessionId: '0', title: 'Administración I' },
  ];

  class SessionExpired extends Error {}

  async function runBatch(
    syncCourse: (course: { externalId: string }) => Promise<{
      snapshot: CampusSnapshot;
      unread: Array<{ section: 'announcements' | 'events'; error: string }>;
    }>,
  ) {
    const saved: SyncRun[] = [];
    const attempted: string[] = [];

    const result = await syncCourseBatch(createSyncRun('run', 'all', 0), targets, {
      syncCourse: async (course) => {
        attempted.push(course.externalId);
        return syncCourse(course);
      },
      save: async (run) => {
        saved.push(run);
      },
      isFatal: (error) => error instanceof SessionExpired,
      now: () => 1,
    });

    return { ...result, saved, attempted };
  }

  it('keeps syncing after one course fails', async () => {
    const { batch, run, fatalError } = await runBatch(async (course) => {
      if (course.externalId === 'MAT102') throw new Error('La lista de tareas no terminó de cargar');
      return { snapshot: snapshot(course.externalId), unread: [] };
    });

    expect(batch.snapshots.map((item) => item.course.externalId)).toEqual(['HIS101', 'ADM201']);
    expect(batch.errors).toEqual([
      {
        courseExternalId: 'MAT102',
        sessionId: '0',
        title: 'Geometría y Trigonometría',
        error: 'La lista de tareas no terminó de cargar',
      },
    ]);
    expect(run.courses.map((course) => course.status)).toEqual(['done', 'error', 'done']);
    expect(fatalError).toBeNull();
  });

  it('records unread sections against the course without failing it', async () => {
    const { batch, run } = await runBatch(async (course) => ({
      snapshot: snapshot(course.externalId),
      unread: course.externalId === 'HIS101' ? [{ section: 'announcements', error: 'HTTP 403' }] : [],
    }));

    expect(batch.snapshots).toHaveLength(3);
    expect(batch.warnings).toEqual([
      {
        courseExternalId: 'HIS101',
        sessionId: '0',
        title: 'HIS101',
        section: 'announcements',
        error: 'HTTP 403',
      },
    ]);
    expect(run.courses[0]).toMatchObject({ status: 'done', unreadSections: ['announcements'] });
  });

  it('stops reading after a fatal error and keeps the rest for a retry', async () => {
    const { batch, run, attempted, fatalError } = await runBatch(async (course) => {
      if (course.externalId === 'MAT102') throw new SessionExpired('La sesión del campus expiró');
      return { snapshot: snapshot(course.externalId), unread: [] };
    });

    expect(attempted).toEqual(['HIS101', 'MAT102']);
    expect(fatalError).toBe('La sesión del campus expiró');
    expect(batch.errors.map((error) => error.courseExternalId)).toEqual(['MAT102', 'ADM201']);
    expect(retryTargets(batch).map((target) => target.externalId)).toEqual(['MAT102', 'ADM201']);
    expect(run.courses.map((course) => course.status)).toEqual(['done', 'error', 'error']);
  });

  it('saves progress before and after each course', async () => {
    const { saved } = await runBatch(async (course) => ({
      snapshot: snapshot(course.externalId),
      unread: [],
    }));

    expect(saved.map((run) => run.courses.map((course) => course.status).join(','))).toEqual([
      'pending,pending,pending',
      'syncing,pending,pending',
      'done,pending,pending',
      'done,syncing,pending',
      'done,done,pending',
      'done,done,syncing',
      'done,done,done',
    ]);
  });
});
