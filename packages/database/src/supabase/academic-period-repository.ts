import type { AcademicPeriod, AcademicPeriodId, UserId } from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { AcademicPeriodRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toAcademicPeriod } from './mappers';
import type { AcademicPeriodRow } from './rows';

const TABLE = 'academic_periods';

/** Flattens the domain date range back into the two columns the table uses. */
function toRow(period: Partial<Omit<AcademicPeriod, 'id' | 'userId'>>) {
  const row: Record<string, unknown> = {};
  if (period.name !== undefined) row['name'] = period.name;
  if (period.status !== undefined) row['status'] = period.status;
  if (period.timeZone !== undefined) row['time_zone'] = period.timeZone;
  if (period.range !== undefined) {
    row['start_date'] = period.range.start;
    row['end_date'] = period.range.end;
  }
  return row;
}

export function createAcademicPeriodRepository(
  client: PulseSupabaseClient,
): AcademicPeriodRepository {
  return {
    async listByUser(userId: UserId): Promise<AcademicPeriod[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('start_date', { ascending: false });

      if (error) throw translateError(error);
      return (data as AcademicPeriodRow[]).map(toAcademicPeriod);
    },

    async findActive(userId: UserId): Promise<AcademicPeriod | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toAcademicPeriod(data as AcademicPeriodRow) : null;
    },

    async findById(userId: UserId, id: AcademicPeriodId): Promise<AcademicPeriod | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toAcademicPeriod(data as AcademicPeriodRow) : null;
    },

    async create(
      userId: UserId,
      input: Omit<AcademicPeriod, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    ): Promise<AcademicPeriod> {
      const { data, error } = await client
        .from(TABLE)
        .insert({ ...toRow(input), user_id: userId })
        .select()
        .single();

      if (error) throw translateError(error);
      return toAcademicPeriod(data as AcademicPeriodRow);
    },

    async update(
      userId: UserId,
      id: AcademicPeriodId,
      changes: Partial<Omit<AcademicPeriod, 'id' | 'userId'>>,
    ): Promise<AcademicPeriod> {
      const { data, error } = await client
        .from(TABLE)
        .update(toRow(changes))
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Academic period ${id} not found`);
      return toAcademicPeriod(data as AcademicPeriodRow);
    },
  };
}
