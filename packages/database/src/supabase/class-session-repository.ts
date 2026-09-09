import type { ClassSession, ClassSessionId, IsoDate, SubjectId, UserId } from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { ClassSessionRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { fromClassSession, toClassSession } from './mappers';
import type { ClassSessionRow } from './rows';

const TABLE = 'class_sessions';

export function createClassSessionRepository(client: PulseSupabaseClient): ClassSessionRepository {
  return {
    async listInRange(userId: UserId, from: IsoDate, to: IsoDate): Promise<ClassSession[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .gte('session_date', from)
        .lte('session_date', to)
        .order('session_date')
        .order('start_time');

      if (error) throw translateError(error);
      return (data as ClassSessionRow[]).map(toClassSession);
    },

    async listBySubject(userId: UserId, subjectId: SubjectId): Promise<ClassSession[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('subject_id', subjectId)
        .order('session_date')
        .order('start_time');

      if (error) throw translateError(error);
      return (data as ClassSessionRow[]).map(toClassSession);
    },

    async findById(userId: UserId, id: ClassSessionId): Promise<ClassSession | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toClassSession(data as ClassSessionRow) : null;
    },

    /**
     * Inserts generated sessions in one statement.
     *
     * Generation produces a whole term at once, so inserting row by row would
     * mean hundreds of round trips.
     */
    async createMany(
      userId: UserId,
      sessions: ReadonlyArray<Omit<ClassSession, 'id' | 'createdAt' | 'updatedAt'>>,
    ): Promise<ClassSession[]> {
      if (sessions.length === 0) return [];

      const { data, error } = await client
        .from(TABLE)
        .insert(sessions.map((session) => fromClassSession(session, userId)))
        .select();

      if (error) throw translateError(error);
      return (data as ClassSessionRow[]).map(toClassSession);
    },

    async update(
      userId: UserId,
      id: ClassSessionId,
      changes: Partial<Omit<ClassSession, 'id'>>,
    ): Promise<ClassSession> {
      const current = await this.findById(userId, id);
      if (!current) throw new DatabaseError('not_found', `Class session ${id} not found`);

      const { data, error } = await client
        .from(TABLE)
        .update(fromClassSession({ ...current, ...changes }, userId))
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .single();

      if (error) throw translateError(error);
      return toClassSession(data as ClassSessionRow);
    },
  };
}
