import type { SubjectId, Task, TaskId, UserId } from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { TaskRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { fromTimeOfDay, toTask } from './mappers';
import type { TaskRow } from './rows';

const TABLE = 'tasks';

/** Only the fields present are written, so a partial update stays partial. */
function toRow(task: Partial<Omit<Task, 'id' | 'userId'>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (task.subjectId !== undefined) row['subject_id'] = task.subjectId;
  if (task.title !== undefined) row['title'] = task.title;
  if (task.description !== undefined) row['description'] = task.description;
  if (task.assignedDate !== undefined) row['assigned_date'] = task.assignedDate;
  if (task.dueDate !== undefined) row['due_date'] = task.dueDate;
  if (task.dueTime !== undefined) {
    row['due_time'] = task.dueTime === null ? null : fromTimeOfDay(task.dueTime);
  }
  if (task.status !== undefined) row['status'] = task.status;
  if (task.difficulty !== undefined) row['difficulty'] = task.difficulty;
  if (task.progress !== undefined) row['progress'] = task.progress;
  if (task.estimatedMinutes !== undefined) row['estimated_minutes'] = task.estimatedMinutes;
  if (task.academicWeight !== undefined) row['academic_weight'] = task.academicWeight;
  return row;
}

export function createTaskRepository(client: PulseSupabaseClient): TaskRepository {
  return {
    async listByUser(userId: UserId): Promise<Task[]> {
      // Nulls last so undated work does not sit above a real deadline.
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('due_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw translateError(error);
      return (data as TaskRow[]).map(toTask);
    },

    async listBySubject(userId: UserId, subjectId: SubjectId): Promise<Task[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('subject_id', subjectId)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw translateError(error);
      return (data as TaskRow[]).map(toTask);
    },

    async findById(userId: UserId, id: TaskId): Promise<Task | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toTask(data as TaskRow) : null;
    },

    async create(
      userId: UserId,
      input: Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    ): Promise<Task> {
      const { data, error } = await client
        .from(TABLE)
        .insert({ ...toRow(input), user_id: userId })
        .select()
        .single();

      if (error) throw translateError(error);
      return toTask(data as TaskRow);
    },

    async update(
      userId: UserId,
      id: TaskId,
      changes: Partial<Omit<Task, 'id' | 'userId'>>,
    ): Promise<Task> {
      const { data, error } = await client
        .from(TABLE)
        .update(toRow(changes))
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Task ${id} not found`);
      return toTask(data as TaskRow);
    },

    async remove(userId: UserId, id: TaskId): Promise<void> {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', id);
      if (error) throw translateError(error);
    },
  };
}
