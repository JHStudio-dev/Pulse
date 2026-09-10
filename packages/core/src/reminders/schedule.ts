import type { ClassSession, Instant, Reminder, Task, TimeZone } from '@pulse/types';
import { zonedTimeToDate } from '../time/zone';

/**
 * When a reminder fires.
 *
 * This is scheduling, deliberately separate from delivery. A reminder stores an
 * academic rule — a target plus an offset — and this resolves it to an instant.
 * Any channel added later (push, email, anything else) reads the same result;
 * none of them change the rule.
 */

/** The moment a target is due. A task with no time is due at end of day. */
export function taskDueAt(task: Task, timeZone: TimeZone): Date | null {
  if (task.dueDate === null) return null;
  return zonedTimeToDate(task.dueDate, task.dueTime ?? '23:59', timeZone);
}

export function sessionStartsAt(session: ClassSession, timeZone: TimeZone): Date {
  return zonedTimeToDate(session.date, session.startTime, timeZone);
}

/**
 * Applies the offset to a target instant.
 *
 * Offsets are minutes *before* the target, which is why the schema constrains
 * them to be positive: a reminder after the deadline has already failed at its
 * job.
 */
export function reminderFiresAt(targetAt: Date, offsetMinutes: number): Date {
  return new Date(targetAt.getTime() - offsetMinutes * 60_000);
}

export type ReminderState = 'due' | 'upcoming' | 'expired';

/**
 * Classifies a reminder against the clock.
 *
 * `expired` means the target itself has passed: the moment to act is gone, so
 * showing it as due would be misleading. `due` is the window between firing and
 * the target.
 */
export function reminderState(firesAt: Date, targetAt: Date, now: Date): ReminderState {
  if (now.getTime() >= targetAt.getTime()) return 'expired';
  if (now.getTime() >= firesAt.getTime()) return 'due';
  return 'upcoming';
}

export interface ResolvedReminder {
  reminder: Reminder;
  firesAt: Instant;
  targetAt: Instant;
  state: ReminderState;
  /** Label of whatever the reminder points at, for display. */
  targetTitle: string;
}

export interface ReminderTargets {
  tasks: ReadonlyMap<string, Task>;
  sessions: ReadonlyMap<string, ClassSession>;
  /** Subject name per session, so a class reminder can name its subject. */
  sessionTitles: ReadonlyMap<string, string>;
}

/**
 * Resolves reminders against their targets.
 *
 * A reminder whose target no longer exists is dropped rather than shown with a
 * blank name: the row can outlive its target through a race, and a reminder
 * pointing at nothing is not something to act on. Disabled reminders are
 * skipped too.
 */
export function resolveReminders(
  reminders: readonly Reminder[],
  targets: ReminderTargets,
  timeZone: TimeZone,
  now: Date,
): ResolvedReminder[] {
  const resolved: ResolvedReminder[] = [];

  for (const reminder of reminders) {
    if (!reminder.enabled) continue;

    let targetAt: Date | null = null;
    let targetTitle = '';

    if (reminder.target.kind === 'task' && reminder.target.taskId !== null) {
      const task = targets.tasks.get(reminder.target.taskId);
      if (!task) continue;
      targetAt = taskDueAt(task, timeZone);
      targetTitle = task.title;
    }

    if (reminder.target.kind === 'class_session' && reminder.target.classSessionId !== null) {
      const session = targets.sessions.get(reminder.target.classSessionId);
      if (!session) continue;
      if (session.status === 'cancelled') continue;
      targetAt = sessionStartsAt(session, timeZone);
      targetTitle = targets.sessionTitles.get(reminder.target.classSessionId) ?? 'Clase';
    }

    // Assessment targets are valid in the schema but have no Phase 1 screen.
    if (targetAt === null) continue;

    const firesAt = reminderFiresAt(targetAt, reminder.offsetMinutes);

    resolved.push({
      reminder,
      firesAt: firesAt.toISOString(),
      targetAt: targetAt.toISOString(),
      state: reminderState(firesAt, targetAt, now),
      targetTitle,
    });
  }

  return resolved.sort((a, b) => a.firesAt.localeCompare(b.firesAt));
}

/** Offsets offered for a task deadline, in minutes before it. */
export const TASK_OFFSETS: ReadonlyArray<{ minutes: number; code: string }> = [
  { minutes: 0, code: 'same_day' },
  { minutes: 1440, code: 'one_day' },
  { minutes: 4320, code: 'three_days' },
  { minutes: 10080, code: 'seven_days' },
];

/** Offsets offered for a class session, in minutes before it starts. */
export const SESSION_OFFSETS: ReadonlyArray<{ minutes: number; code: string }> = [
  { minutes: 0, code: 'at_start' },
  { minutes: 10, code: 'ten_minutes' },
  { minutes: 30, code: 'thirty_minutes' },
];

/**
 * Converts a chosen instant into an offset the schema can store.
 *
 * Returns null when the instant is not before the target, since the column only
 * accepts a non-negative offset.
 */
export function offsetFromInstant(targetAt: Date, chosen: Date): number | null {
  const minutes = Math.round((targetAt.getTime() - chosen.getTime()) / 60_000);
  return minutes >= 0 ? minutes : null;
}
