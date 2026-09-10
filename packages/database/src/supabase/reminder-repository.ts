import type { ClassSessionId, Reminder, ReminderId, TaskId, UserId } from '@pulse/types';
import type { ReminderRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toReminder } from './mappers';
import type { ReminderRow } from './rows';

const TABLE = 'reminders';

export function createReminderRepository(client: PulseSupabaseClient): ReminderRepository {
  return {
    async listByUser(userId: UserId): Promise<Reminder[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw translateError(error);
      return (data as ReminderRow[]).map(toReminder);
    },

    /**
     * Creates a reminder for a task.
     *
     * The composite foreign key on (task_id, user_id) means the database itself
     * rejects a task belonging to someone else, so a forged id cannot produce a
     * reminder even if it reached this far.
     */
    async createForTask(userId: UserId, taskId: TaskId, offsetMinutes: number): Promise<Reminder> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          user_id: userId,
          target_kind: 'task',
          task_id: taskId,
          kind: 'lead_time',
          offset_minutes: offsetMinutes,
        })
        .select()
        .single();

      if (error) throw translateError(error);
      return toReminder(data as ReminderRow);
    },

    async createForSession(
      userId: UserId,
      sessionId: ClassSessionId,
      offsetMinutes: number,
    ): Promise<Reminder> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          user_id: userId,
          target_kind: 'class_session',
          class_session_id: sessionId,
          // `start` when it fires at the session, a lead time otherwise.
          kind: offsetMinutes === 0 ? 'start' : 'lead_time',
          offset_minutes: offsetMinutes,
        })
        .select()
        .single();

      if (error) throw translateError(error);
      return toReminder(data as ReminderRow);
    },

    async remove(userId: UserId, id: ReminderId): Promise<void> {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', id);
      if (error) throw translateError(error);
    },
  };
}
