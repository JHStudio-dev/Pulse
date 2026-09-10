import type { ClassSessionId, Note, NoteId, SubjectId, UserId } from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { NoteRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toNote } from './mappers';
import type { NoteRow } from './rows';

const TABLE = 'notes';

export function createNoteRepository(client: PulseSupabaseClient): NoteRepository {
  return {
    async listBySubject(userId: UserId, subjectId: SubjectId): Promise<Note[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('subject_id', subjectId)
        .order('created_at', { ascending: false });

      if (error) throw translateError(error);
      return (data as NoteRow[]).map(toNote);
    },

    async findBySession(userId: UserId, sessionId: ClassSessionId): Promise<Note | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('class_session_id', sessionId)
        .order('created_at')
        .limit(1)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toNote(data as NoteRow) : null;
    },

    async create(
      userId: UserId,
      input: Omit<Note, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    ): Promise<Note> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          user_id: userId,
          subject_id: input.subjectId,
          class_session_id: input.classSessionId,
          title: input.title,
          body: input.body,
          markers: input.markers,
        })
        .select()
        .single();

      if (error) throw translateError(error);
      return toNote(data as NoteRow);
    },

    async updateBody(userId: UserId, id: NoteId, body: string): Promise<Note> {
      const { data, error } = await client
        .from(TABLE)
        .update({ body })
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Note ${id} not found`);
      return toNote(data as NoteRow);
    },

    async remove(userId: UserId, id: NoteId): Promise<void> {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', id);
      if (error) throw translateError(error);
    },
  };
}
