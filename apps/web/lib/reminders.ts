import { resolveReminders, type ResolvedReminder } from '@pulse/core';
import type {
  AcademicPeriod,
  ClassSession,
  Reminder,
  Subject,
  SubjectId,
  Task,
  UserId,
} from '@pulse/types';

interface Deps {
  reminders: { listByUser(userId: UserId): Promise<Reminder[]> };
  tasks: { listByUser(userId: UserId): Promise<Task[]> };
  sessions: {
    listInRange(userId: UserId, from: string, to: string): Promise<ClassSession[]>;
  };
  subjects: { listByPeriod(userId: UserId, periodId: AcademicPeriod['id']): Promise<Subject[]> };
}

/**
 * Loads reminders with their targets resolved.
 *
 * Kept in one place because Inicio and the reminders page need the same answer,
 * and duplicating the target lookup would let the two drift apart.
 */
export async function loadReminders(
  db: Deps,
  userId: UserId,
  period: AcademicPeriod,
  now: Date,
): Promise<ResolvedReminder[]> {
  const [reminders, tasks, subjects] = await Promise.all([
    db.reminders.listByUser(userId),
    db.tasks.listByUser(userId),
    db.subjects.listByPeriod(userId, period.id),
  ]);

  // Sessions are fetched across the period so a reminder can point anywhere in it.
  const sessions = await db.sessions.listInRange(
    userId,
    period.range.start,
    period.range.end ?? period.range.start,
  );

  const subjectsById: ReadonlyMap<SubjectId, Subject> = new Map(subjects.map((s) => [s.id, s]));

  return resolveReminders(
    reminders,
    {
      tasks: new Map(tasks.map((task) => [task.id as string, task])),
      sessions: new Map(sessions.map((session) => [session.id as string, session])),
      sessionTitles: new Map(
        sessions.map((session) => [
          session.id as string,
          subjectsById.get(session.subjectId)?.name ?? 'Clase',
        ]),
      ),
    },
    period.timeZone,
    now,
  );
}
