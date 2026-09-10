import type { ClassSessionId, Recording, RecordingId, RecordingStatus, UserId } from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { RecordingRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toRecording } from './mappers';
import type { RecordingRow } from './rows';

const TABLE = 'recordings';
export const RECORDINGS_BUCKET = 'class-recordings';

/** Timestamps the queue columns for whichever state the recording moves into. */
function statusTimestamps(status: RecordingStatus): Record<string, string | null> {
  const now = new Date().toISOString();

  if (status === 'queued') return { queued_at: now, processing_started_at: null };
  if (status === 'transcribing') return { processing_started_at: now };
  if (status === 'ready' || status === 'failed') return { processed_at: now };
  return {};
}

export function createRecordingRepository(client: PulseSupabaseClient): RecordingRepository {
  return {
    async listBySession(userId: UserId, sessionId: ClassSessionId): Promise<Recording[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('class_session_id', sessionId)
        .order('created_at', { ascending: false });

      if (error) throw translateError(error);
      return (data as RecordingRow[]).map(toRecording);
    },

    async findById(userId: UserId, id: RecordingId): Promise<Recording | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toRecording(data as RecordingRow) : null;
    },

    /**
     * Records an already uploaded file.
     *
     * The status is not accepted from the caller: a new row is always
     * `uploaded`, and moving it on is what setStatus is for.
     */
    async create(
      userId: UserId,
      input: Parameters<RecordingRepository['create']>[1],
    ): Promise<Recording> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          user_id: userId,
          class_session_id: input.classSessionId,
          capture_mode: input.captureMode,
          storage_path: input.storagePath,
          has_video: input.hasVideo,
          has_system_audio: input.hasSystemAudio,
          has_microphone: input.hasMicrophone,
          original_filename: input.originalFilename,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          duration_seconds: input.durationSeconds,
          permission: input.permission,
        })
        .select()
        .single();

      if (error) throw translateError(error);
      return toRecording(data as RecordingRow);
    },

    async setStatus(
      userId: UserId,
      id: RecordingId,
      status: RecordingStatus,
      failureReason: string | null = null,
    ): Promise<Recording> {
      const { data, error } = await client
        .from(TABLE)
        .update({
          status,
          failure_reason: status === 'failed' ? (failureReason ?? 'unknown') : null,
          ...statusTimestamps(status),
        })
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Recording ${id} not found`);
      return toRecording(data as RecordingRow);
    },

    async remove(userId: UserId, id: RecordingId): Promise<void> {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', id);
      if (error) throw translateError(error);
    },

    async createSignedUrl(
      userId: UserId,
      id: RecordingId,
      expiresInSeconds: number,
    ): Promise<string> {
      const recording = await this.findById(userId, id);
      if (!recording) throw new DatabaseError('not_found', `Recording ${id} not found`);

      const { data, error } = await client.storage
        .from(RECORDINGS_BUCKET)
        .createSignedUrl(recording.storagePath, expiresInSeconds);

      if (error) throw new DatabaseError('unavailable', error.message, error);
      return data.signedUrl;
    },
  };
}
