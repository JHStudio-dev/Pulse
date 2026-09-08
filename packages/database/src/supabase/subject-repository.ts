import type { AcademicPeriodId, Subject, SubjectId, UserId } from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { SubjectRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { fromSubject, toSubject } from './mappers';
import type { SubjectRow } from './rows';

/**
 * Reference implementation of a repository port.
 *
 * The remaining repositories follow this shape: query, translate the driver
 * error, map rows to domain objects. Nothing above this layer sees PostgREST.
 */

const TABLE = 'subjects';

function translate(error: { code?: string; message: string }): DatabaseError {
  // PostgREST surfaces an RLS denial as an empty result or a 42501 code.
  if (error.code === '42501') {
    return new DatabaseError('permission_denied', error.message, error);
  }
  if (error.code === '23505') {
    return new DatabaseError('conflict', error.message, error);
  }
  return new DatabaseError('unavailable', error.message, error);
}

export function createSubjectRepository(client: PulseSupabaseClient): SubjectRepository {
  return {
    async listByPeriod(userId: UserId, periodId: AcademicPeriodId): Promise<Subject[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('academic_period_id', periodId)
        .is('archived_at', null)
        .order('name');

      if (error) throw translate(error);
      return (data as SubjectRow[]).map(toSubject);
    },

    async findById(userId: UserId, id: SubjectId): Promise<Subject | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw translate(error);
      return data ? toSubject(data as SubjectRow) : null;
    },

    async create(
      userId: UserId,
      input: Omit<Subject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    ): Promise<Subject> {
      const { data, error } = await client
        .from(TABLE)
        .insert(fromSubject({ ...input, userId }))
        .select()
        .single();

      if (error) throw translate(error);
      return toSubject(data as SubjectRow);
    },

    async update(
      userId: UserId,
      id: SubjectId,
      changes: Partial<Omit<Subject, 'id' | 'userId'>>,
    ): Promise<Subject> {
      const current = await this.findById(userId, id);
      if (!current) {
        throw new DatabaseError('not_found', `Subject ${id} not found`);
      }

      const { data, error } = await client
        .from(TABLE)
        .update(fromSubject({ ...current, ...changes }))
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .single();

      if (error) throw translate(error);
      return toSubject(data as SubjectRow);
    },

    async archive(userId: UserId, id: SubjectId): Promise<void> {
      const { error } = await client
        .from(TABLE)
        .update({ archived_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', id);

      if (error) throw translate(error);
    },
  };
}
