import type { InboxItem, InboxItemId, SubjectId, UserId } from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { InboxRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toInboxItem } from './mappers';
import type { InboxItemRow } from './rows';

const TABLE = 'inbox_items';

export function createInboxRepository(client: PulseSupabaseClient): InboxRepository {
  return {
    async listByUser(userId: UserId): Promise<InboxItem[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw translateError(error);
      return (data as InboxItemRow[]).map(toInboxItem);
    },

    async findById(userId: UserId, id: InboxItemId): Promise<InboxItem | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toInboxItem(data as InboxItemRow) : null;
    },

    /** Stores the text exactly as typed. Nothing is parsed or rewritten. */
    async capture(
      userId: UserId,
      rawText: string,
      subjectId: SubjectId | null,
    ): Promise<InboxItem> {
      const { data, error } = await client
        .from(TABLE)
        .insert({ user_id: userId, raw_text: rawText, subject_id: subjectId })
        .select()
        .single();

      if (error) throw translateError(error);
      return toInboxItem(data as InboxItemRow);
    },

    async update(
      userId: UserId,
      id: InboxItemId,
      changes: { rawText?: string; subjectId?: SubjectId | null },
    ): Promise<InboxItem> {
      const row: Record<string, unknown> = {};
      if (changes.rawText !== undefined) row['raw_text'] = changes.rawText;
      if (changes.subjectId !== undefined) row['subject_id'] = changes.subjectId;

      const { data, error } = await client
        .from(TABLE)
        .update(row)
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Inbox item ${id} not found`);
      return toInboxItem(data as InboxItemRow);
    },

    /**
     * Closes an item.
     *
     * `converted` means it became a task or a note; `discarded` means it was
     * dismissed. Keeping the row rather than deleting it preserves what the
     * student originally wrote.
     */
    async close(
      userId: UserId,
      id: InboxItemId,
      status: 'converted' | 'discarded',
    ): Promise<InboxItem> {
      const { data, error } = await client
        .from(TABLE)
        .update({ status, processed_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Inbox item ${id} not found`);
      return toInboxItem(data as InboxItemRow);
    },

    async remove(userId: UserId, id: InboxItemId): Promise<void> {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', id);
      if (error) throw translateError(error);
    },
  };
}
