import { describe, expect, it } from 'vitest';
import type { Reminder, ReminderId, Task, TaskId, UserId } from '@pulse/types';
import { makeSession } from '../testing/factories';
import {
  offsetFromInstant,
  reminderFiresAt,
  reminderState,
  resolveReminders,
  sessionEndsAt,
  sessionStartsAt,
  taskDueAt,
} from './schedule';

const TZ = 'America/Tegucigalpa';
const NOW = '2026-03-01T00:00:00.000Z';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1' as TaskId,
    userId: 'user-1' as UserId,
    subjectId: null,
    title: 'Informe',
    description: null,
    assignedDate: null,
    dueDate: '2026-03-10',
    dueTime: null,
    status: 'pending',
    difficulty: null,
    progress: 0,
    estimatedMinutes: null,
    academicWeight: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'reminder-1' as ReminderId,
    userId: 'user-1' as UserId,
    target: { kind: 'task', classSessionId: null, taskId: 'task-1' as TaskId, assessmentId: null },
    kind: 'lead_time',
    offsetMinutes: 1440,
    enabled: true,
    createdAt: NOW,
    ...overrides,
  };
}

describe('taskDueAt', () => {
  it('uses end of day when the task carries no time', () => {
    // 23:59 in Tegucigalpa is 05:59 UTC the next day.
    expect(taskDueAt(makeTask(), TZ)?.toISOString()).toBe('2026-03-11T05:59:00.000Z');
  });

  it('uses the given time when present', () => {
    expect(taskDueAt(makeTask({ dueTime: '11:59' }), TZ)?.toISOString()).toBe(
      '2026-03-10T17:59:00.000Z',
    );
  });

  it('returns null without a due date', () => {
    expect(taskDueAt(makeTask({ dueDate: null }), TZ)).toBeNull();
  });
});

describe('reminderFiresAt', () => {
  it('subtracts the offset from the target', () => {
    const target = new Date('2026-03-10T17:59:00.000Z');
    expect(reminderFiresAt(target, 1440).toISOString()).toBe('2026-03-09T17:59:00.000Z');
  });

  it('fires at the target when the offset is zero', () => {
    const target = new Date('2026-03-10T17:59:00.000Z');
    expect(reminderFiresAt(target, 0).toISOString()).toBe(target.toISOString());
  });
});

describe('reminderState', () => {
  const fires = new Date('2026-03-09T12:00:00.000Z');
  const target = new Date('2026-03-10T12:00:00.000Z');

  it('is upcoming before it fires', () => {
    expect(reminderState(fires, target, new Date('2026-03-08T00:00:00Z'))).toBe('upcoming');
  });

  it('is due between firing and the target', () => {
    expect(reminderState(fires, target, new Date('2026-03-09T18:00:00Z'))).toBe('due');
  });

  it('is due exactly at the firing moment', () => {
    expect(reminderState(fires, target, fires)).toBe('due');
  });

  it('expires once the target has passed', () => {
    expect(reminderState(fires, target, new Date('2026-03-10T12:00:01Z'))).toBe('expired');
  });
});

describe('resolveReminders', () => {
  const emptyTargets = {
    tasks: new Map<string, Task>(),
    sessions: new Map(),
    sessionTitles: new Map<string, string>(),
  };

  it('resolves a task reminder with its title', () => {
    const targets = { ...emptyTargets, tasks: new Map([['task-1', makeTask()]]) };
    const [resolved] = resolveReminders(
      [makeReminder()],
      targets,
      TZ,
      new Date('2026-03-01T00:00:00Z'),
    );

    expect(resolved?.targetTitle).toBe('Informe');
    expect(resolved?.state).toBe('upcoming');
  });

  it('drops a reminder whose target no longer exists', () => {
    expect(resolveReminders([makeReminder()], emptyTargets, TZ, new Date(NOW))).toEqual([]);
  });

  it('skips disabled reminders', () => {
    const targets = { ...emptyTargets, tasks: new Map([['task-1', makeTask()]]) };
    expect(
      resolveReminders([makeReminder({ enabled: false })], targets, TZ, new Date(NOW)),
    ).toEqual([]);
  });

  it('ignores a reminder for a cancelled class', () => {
    const session = makeSession({ status: 'cancelled' });
    const reminder = makeReminder({
      target: {
        kind: 'class_session',
        classSessionId: session.id,
        taskId: null,
        assessmentId: null,
      },
    });

    const targets = {
      ...emptyTargets,
      sessions: new Map([[session.id as string, session]]),
      sessionTitles: new Map([[session.id as string, 'Física I']]),
    };

    expect(resolveReminders([reminder], targets, TZ, new Date(NOW))).toEqual([]);
  });

  it('orders by firing time', () => {
    const targets = { ...emptyTargets, tasks: new Map([['task-1', makeTask()]]) };
    const resolved = resolveReminders(
      [
        makeReminder({ id: 'late' as ReminderId, offsetMinutes: 60 }),
        makeReminder({ id: 'early' as ReminderId, offsetMinutes: 10080 }),
      ],
      targets,
      TZ,
      new Date(NOW),
    );

    expect(resolved.map((entry) => entry.reminder.id)).toEqual(['early', 'late']);
  });
});

describe('offsetFromInstant', () => {
  const target = new Date('2026-03-10T12:00:00.000Z');

  it('converts a chosen moment into minutes before the target', () => {
    expect(offsetFromInstant(target, new Date('2026-03-09T12:00:00Z'))).toBe(1440);
  });

  it('rejects a moment after the target', () => {
    expect(offsetFromInstant(target, new Date('2026-03-10T12:30:00Z'))).toBeNull();
  });
});

describe('sessionStartsAt', () => {
  it('resolves the session start in the period timezone', () => {
    const session = makeSession({ date: '2026-03-02', startTime: '08:00' });
    expect(sessionStartsAt(session, TZ).toISOString()).toBe('2026-03-02T14:00:00.000Z');
  });
});

describe('sessionEndsAt', () => {
  it('resolves the session end in the period timezone', () => {
    const session = makeSession({ date: '2026-03-02', endTime: '09:30' });
    expect(sessionEndsAt(session, TZ).toISOString()).toBe('2026-03-02T15:30:00.000Z');
  });
});
