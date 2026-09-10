'use server';

import { isRecordingDurationAllowed, MAX_RECORDING_SECONDS } from '@pulse/core';
import type { ClassSessionId, RecordingId, RecordingPermission } from '@pulse/types';
import { uuidSchema } from '@pulse/validation';
import { RECORDINGS_BUCKET } from '@pulse/database';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';
import { ALLOWED_RECORDING_TYPES, MAX_RECORDING_BYTES } from '@/lib/recordings';
import { sanitizeFilename } from '@/lib/uploads';

export interface RecordingResult {
  error: string | null;
  saved: boolean;
}

export interface PlaybackResult {
  error: string | null;
  url: string | null;
  recordingId: string | null;
}

const PERMISSIONS: readonly RecordingPermission[] = ['own_permission', 'official_material'];

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

/**
 * Stores a recording for a class and records it.
 *
 * Three things are refused outright, in this order, because each is cheaper to
 * check than the next: a missing permission confirmation, a file that breaks the
 * size or type rules, and a session that is not the caller's. Ownership is never
 * taken from the form — the session is loaded through the signed in user, so a
 * borrowed session id resolves to nothing.
 */
export async function uploadRecording(
  _previous: RecordingResult,
  formData: FormData,
): Promise<RecordingResult> {
  const parsedSession = uuidSchema.safeParse(text(formData, 'sessionId'));
  if (!parsedSession.success) return { error: 'Clase no válida', saved: false };

  // Explicit, and never inferred from a previous upload.
  if (formData.get('permissionConfirmed') !== 'on') {
    return { error: 'Confirma que puedes grabar o usar esta clase', saved: false };
  }

  const permission = text(formData, 'permission') as RecordingPermission;
  if (!PERMISSIONS.includes(permission)) {
    return { error: 'Indica por qué puedes usar esta grabación', saved: false };
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Elige un archivo de audio', saved: false };
  }

  if (file.size > MAX_RECORDING_BYTES) {
    return { error: 'La grabación supera los 200 MB', saved: false };
  }

  if (!ALLOWED_RECORDING_TYPES.has(file.type)) {
    return { error: 'Ese formato de audio no está permitido', saved: false };
  }

  const rawDuration = Number(text(formData, 'durationSeconds'));
  const durationSeconds =
    Number.isFinite(rawDuration) && rawDuration > 0 ? Math.round(rawDuration) : null;

  if (!isRecordingDurationAllowed(durationSeconds)) {
    return {
      error: `La grabación supera los ${MAX_RECORDING_SECONDS / 60} minutos`,
      saved: false,
    };
  }

  const { userId, db, supabase } = await requireUser();
  const sessionId = parsedSession.data as ClassSessionId;

  const session = await db.sessions.findById(userId, sessionId);
  if (!session) return { error: 'Clase no encontrada', saved: false };

  const objectPath = `${userId}/${sessionId}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .upload(objectPath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { error: 'No se pudo subir la grabación. Inténtalo de nuevo.', saved: false };
  }

  try {
    await db.recordings.create(userId, {
      classSessionId: sessionId,
      storagePath: objectPath,
      originalFilename: file.name.slice(0, 200),
      mimeType: file.type,
      sizeBytes: file.size,
      durationSeconds,
      permission,
    });
  } catch {
    // Never leave an orphan object behind: the file is only reachable through
    // its row, so a row that failed to save makes the upload unreferenced.
    await supabase.storage.from(RECORDINGS_BUCKET).remove([objectPath]);
    return { error: 'No se pudo guardar la grabación. Inténtalo de nuevo.', saved: false };
  }

  revalidatePath('/sessions/[id]', 'page');
  return { error: null, saved: true };
}

/**
 * Removes the row and the stored file together.
 *
 * The object goes first. If that fails the row stays, so the recording is still
 * listed and can be deleted again — the opposite order would hide a file that
 * nothing points at any more.
 */
export async function deleteRecording(formData: FormData): Promise<void> {
  const parsedId = uuidSchema.safeParse(String(formData.get('recordingId') ?? ''));
  if (!parsedId.success) return;

  const { userId, db, supabase } = await requireUser();
  const recordingId = parsedId.data as RecordingId;

  const recording = await db.recordings.findById(userId, recordingId);
  if (!recording) return;

  const { error } = await supabase.storage.from(RECORDINGS_BUCKET).remove([recording.storagePath]);

  if (error) {
    revalidatePath('/sessions/[id]', 'page');
    return;
  }

  await db.recordings.remove(userId, recordingId);
  revalidatePath('/sessions/[id]', 'page');
}

/**
 * Issues a playback URL that expires shortly.
 *
 * Returned to the page rather than redirected to, so the audio plays in place
 * and the link never reaches the HTML of a page that could be cached.
 */
export async function playRecording(
  _previous: PlaybackResult,
  formData: FormData,
): Promise<PlaybackResult> {
  const parsedId = uuidSchema.safeParse(text(formData, 'recordingId'));
  if (!parsedId.success) {
    return { error: 'Grabación no válida', url: null, recordingId: null };
  }

  const { userId, db } = await requireUser();

  try {
    const url = await db.recordings.createSignedUrl(userId, parsedId.data as RecordingId, 300);
    return { error: null, url, recordingId: parsedId.data };
  } catch {
    return { error: 'No se pudo abrir la grabación', url: null, recordingId: null };
  }
}
