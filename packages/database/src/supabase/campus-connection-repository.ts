import type { CampusConnection, CampusInstanceId, UserId } from '@pulse/types';
import type { CampusConnectionRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toCampusConnection } from './mappers';
import type { CampusConnectionRow } from './rows';

const TABLE = 'campus_connections';

export function createCampusConnectionRepository(
  client: PulseSupabaseClient,
): CampusConnectionRepository {
  return {
    async findByUser(userId: UserId): Promise<CampusConnection | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toCampusConnection(data as CampusConnectionRow) : null;
    },

    /** Upserts on (user_id, campus_instance_id), so re-selecting is not an error. */
    async selectCampus(
      userId: UserId,
      campusInstanceId: CampusInstanceId,
    ): Promise<CampusConnection> {
      const { data, error } = await client
        .from(TABLE)
        .upsert(
          { user_id: userId, campus_instance_id: campusInstanceId, status: 'disconnected' },
          { onConflict: 'user_id,campus_instance_id' },
        )
        .select()
        .single();

      if (error) throw translateError(error);
      return toCampusConnection(data as CampusConnectionRow);
    },
  };
}
