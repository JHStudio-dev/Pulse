'use server';

import type { DocumentId, SubjectId } from '@pulse/types';
import { uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, sanitizeFilename } from '@/lib/uploads';

export interface UploadResult {
  error: string | null;
  saved: boolean;
}

/**
 * Stores a file and records it.
 *
 * Ownership never comes from the form: the user id is taken from the session
 * and the subject is loaded through it, so a forged subject id belonging to
 * someone else resolves to nothing. The object path is built server side under
 * a folder named after the owner, which is what the storage policies check.
 */
export async function uploadDocument(
  _previous: UploadResult,
  formData: FormData,
): Promise<UploadResult> {
  const parsedSubject = uuidSchema.safeParse(String(formData.get('subjectId') ?? ''));
  if (!parsedSubject.success) return { error: 'Materia no válida', saved: false };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Elige un archivo', saved: false };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: 'El archivo supera los 25 MB', saved: false };
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { error: 'Ese tipo de archivo no está permitido', saved: false };
  }

  const { userId, db, supabase } = await requireUser();
  const subjectId = parsedSubject.data as SubjectId;

  const subject = await db.subjects.findById(userId, subjectId);
  if (!subject) return { error: 'Materia no encontrada', saved: false };

  const safeName = sanitizeFilename(file.name);
  const objectPath = `${userId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(objectPath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { error: 'No se pudo subir el archivo. Inténtalo de nuevo.', saved: false };
  }

  const title = String(formData.get('title') ?? '').trim();

  try {
    await db.documents.create(userId, {
      subjectId,
      classSessionId: null,
      // The original filename is kept as the fallback title.
      title: title.length > 0 ? title.slice(0, 200) : file.name.slice(0, 200),
      source: 'upload',
      storagePath: objectPath,
      externalUrl: null,
      mimeType: file.type,
      sizeBytes: file.size,
      contentHash: null,
      replacesDocumentId: null,
    });
  } catch {
    // Do not leave an orphan object behind if the row fails.
    await supabase.storage.from('documents').remove([objectPath]);
    return { error: 'No se pudo guardar el documento. Inténtalo de nuevo.', saved: false };
  }

  revalidatePath(`/subjects/${subjectId}`);
  return { error: null, saved: true };
}

/** Removes the row and the stored object together. */
export async function deleteDocument(formData: FormData): Promise<void> {
  const parsedId = uuidSchema.safeParse(String(formData.get('documentId') ?? ''));
  const parsedSubject = uuidSchema.safeParse(String(formData.get('subjectId') ?? ''));
  if (!parsedId.success || !parsedSubject.success) return;

  const { userId, db, supabase } = await requireUser();
  const documentId = parsedId.data as DocumentId;

  const document = await db.documents.findById(userId, documentId);
  if (!document) return;

  if (document.storagePath !== null) {
    await supabase.storage.from('documents').remove([document.storagePath]);
  }
  await db.documents.remove(userId, documentId);

  revalidatePath(`/subjects/${parsedSubject.data}`);
}

/** Issues a signed URL and sends the browser to it. */
export async function openDocument(formData: FormData): Promise<void> {
  const parsedId = uuidSchema.safeParse(String(formData.get('documentId') ?? ''));
  if (!parsedId.success) return;

  const { userId, db } = await requireUser();

  // Short lived: long enough to open, not to share around.
  const url = await db.documents.createSignedUrl(userId, parsedId.data as DocumentId, 60);
  redirect(url);
}
