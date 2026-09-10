import type { DocumentId, DocumentRecord, SubjectId, UserId } from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { DocumentRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toDocument } from './mappers';
import type { DocumentRow } from './rows';

const TABLE = 'documents';

export function createDocumentRepository(client: PulseSupabaseClient): DocumentRepository {
  return {
    async listBySubject(userId: UserId, subjectId: SubjectId): Promise<DocumentRecord[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('subject_id', subjectId)
        .order('created_at', { ascending: false });

      if (error) throw translateError(error);
      return (data as DocumentRow[]).map(toDocument);
    },

    async findById(userId: UserId, id: DocumentId): Promise<DocumentRecord | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toDocument(data as DocumentRow) : null;
    },

    async create(
      userId: UserId,
      input: Omit<DocumentRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    ): Promise<DocumentRecord> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          user_id: userId,
          subject_id: input.subjectId,
          class_session_id: input.classSessionId,
          title: input.title,
          source: input.source,
          storage_path: input.storagePath,
          external_url: input.externalUrl,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          content_hash: input.contentHash,
          replaces_document_id: input.replacesDocumentId,
        })
        .select()
        .single();

      if (error) throw translateError(error);
      return toDocument(data as DocumentRow);
    },

    async remove(userId: UserId, id: DocumentId): Promise<void> {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', id);
      if (error) throw translateError(error);
    },

    /**
     * Short lived link to a stored file.
     *
     * The bucket is private, so this is the only way a browser reaches the file.
     * The row is loaded first: signing a path taken from the client would let a
     * caller mint links for objects they do not own.
     */
    async createSignedUrl(
      userId: UserId,
      id: DocumentId,
      expiresInSeconds: number,
    ): Promise<string> {
      const document = await this.findById(userId, id);
      if (!document) throw new DatabaseError('not_found', `Document ${id} not found`);
      if (document.storagePath === null) {
        throw new DatabaseError('not_found', `Document ${id} has no stored file`);
      }

      const { data, error } = await client.storage
        .from('documents')
        .createSignedUrl(document.storagePath, expiresInSeconds);

      if (error) throw new DatabaseError('unavailable', error.message, error);
      return data.signedUrl;
    },
  };
}
