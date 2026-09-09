import type { AcademicPeriodId, Subject, SubjectId, UserId } from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import { translateError } from './errors';
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

      if (error) throw translateError(error);
      return (data as SubjectRow[]).map(toSubject);
    },

    async findById(userId: UserId, id: SubjectId): Promise<Subject | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw translateError(error);
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

      if (error) throw translateError(error);
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

      if (error) throw translateError(error);
      return toSubject(data as SubjectRow);
    },

    async archive(userId: UserId, id: SubjectId): Promise<void> {
      const { error } = await client
        .from(TABLE)
        .update({ archived_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', id);

      if (error) throw translateError(error);
    },
  };
}
