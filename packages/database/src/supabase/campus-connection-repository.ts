import type {
  CampusConnection,
  CampusConnectionId,
  CampusInstanceId,
  UserId,
} from '@pulse/types';
import { DatabaseError } from '../ports/errors';
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

    async markSyncSuccess(userId: UserId, id: CampusConnectionId): Promise<CampusConnection> {
      const { data, error } = await client
        .from(TABLE)
        .update({
          status: 'connected',
          last_synced_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Campus connection ${id} not found`);
      return toCampusConnection(data as CampusConnectionRow);
    },

    async markSyncError(
      userId: UserId,
      id: CampusConnectionId,
      errorMessage: string,
    ): Promise<CampusConnection> {
      const { data, error } = await client
        .from(TABLE)
        .update({ status: 'error', last_error: errorMessage })
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Campus connection ${id} not found`);
      return toCampusConnection(data as CampusConnectionRow);
    },
  };
}
