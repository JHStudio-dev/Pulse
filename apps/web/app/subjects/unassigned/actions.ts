'use server';

import type { DocumentId, NoteId, SubjectId } from '@pulse/types';
import { uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';
import { moveDocumentToSubject, moveNoteToSubject } from '@/lib/unassigned-content';

function id(formData: FormData, key: string): string | null {
  const parsed = uuidSchema.safeParse(String(formData.get(key) ?? ''));
  return parsed.success ? parsed.data : null;
}

function refresh(): void {
  revalidatePath('/subjects/unassigned');
  revalidatePath('/subjects');
  revalidatePath('/subjects/[id]', 'page');
}

export async function moveDocument(formData: FormData): Promise<void> {
  const documentId = id(formData, 'documentId');
  const subjectId = id(formData, 'subjectId');
  if (!documentId || !subjectId) return;

  const { userId, db } = await requireUser();
  await moveDocumentToSubject(userId, documentId as DocumentId, subjectId as SubjectId, db);
  refresh();
}

export async function moveNote(formData: FormData): Promise<void> {
  const noteId = id(formData, 'noteId');
  const subjectId = id(formData, 'subjectId');
  if (!noteId || !subjectId) return;

  const { userId, db } = await requireUser();
  await moveNoteToSubject(userId, noteId as NoteId, subjectId as SubjectId, db);
  refresh();
}

/** Removes the row and its stored file; only for documents without a subject. */
export async function deleteUnassignedDocument(formData: FormData): Promise<void> {
  const documentId = id(formData, 'documentId');
  if (!documentId) return;

  const { userId, db, supabase } = await requireUser();
  const document = await db.documents.findById(userId, documentId as DocumentId);
  if (!document || document.subjectId !== null) return;

  if (document.storagePath !== null) {
    const { error } = await supabase.storage.from('documents').remove([document.storagePath]);
    // Keep the row when the file stays, so it can be deleted again.
    if (error) return;
  }

  await db.documents.remove(userId, document.id);
  refresh();
}

export async function deleteNote(formData: FormData): Promise<void> {
  const noteId = id(formData, 'noteId');
  if (!noteId) return;

  const { userId, db } = await requireUser();
  await db.notes.remove(userId, noteId as NoteId);
  refresh();
}
