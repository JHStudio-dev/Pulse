'use server';

import type { InboxItemId, SubjectId } from '@pulse/types';
import { createTaskSchema, uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';

export interface InboxResult {
  error: string | null;
  saved: boolean;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function optionalSubject(value: string): SubjectId | null {
  return uuidSchema.safeParse(value).success ? (value as SubjectId) : null;
}

function refresh(): void {
  revalidatePath('/inbox');
  revalidatePath('/', 'layout');
}

/** Edits the captured text or files it under a subject. */
export async function updateInboxItem(
  _previous: InboxResult,
  formData: FormData,
): Promise<InboxResult> {
  const parsedId = uuidSchema.safeParse(text(formData, 'itemId'));
  if (!parsedId.success) return { error: 'Elemento no válido', saved: false };

  const rawText = text(formData, 'rawText');
  if (rawText.length === 0) return { error: 'El texto no puede quedar vacío', saved: false };
  if (rawText.length > 500) return { error: 'Máximo 500 caracteres', saved: false };

  const { userId, db } = await requireUser();

  try {
    await db.inbox.update(userId, parsedId.data as InboxItemId, {
      rawText,
      subjectId: optionalSubject(text(formData, 'subjectId')),
    });
  } catch {
    return { error: 'No se pudo guardar. Inténtalo de nuevo.', saved: false };
  }

  refresh();
  return { error: null, saved: true };
}

/**
 * Turns a captured note into a task.
 *
 * The title is whatever the student confirms in the form, not a guess made from
 * the raw text: no parsing exists yet, and inventing one would be a suggestion
 * Pulse cannot stand behind. The item is closed as `converted` rather than
 * deleted, so the original wording survives.
 */
export async function convertToTask(
  _previous: InboxResult,
  formData: FormData,
): Promise<InboxResult> {
  const parsedId = uuidSchema.safeParse(text(formData, 'itemId'));
  if (!parsedId.success) return { error: 'Elemento no válido', saved: false };

  const dueDate = text(formData, 'dueDate');

  const parsed = createTaskSchema.safeParse({
    subjectId: optionalSubject(text(formData, 'subjectId')),
    title: text(formData, 'title'),
    dueDate: dueDate.length > 0 ? dueDate : null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos', saved: false };
  }

  const { userId, db } = await requireUser();
  const itemId = parsedId.data as InboxItemId;

  const item = await db.inbox.findById(userId, itemId);
  if (!item) return { error: 'Elemento no encontrado', saved: false };

  try {
    await db.tasks.create(userId, {
      ...parsed.data,
      subjectId: parsed.data.subjectId as SubjectId | null,
    });
    await db.inbox.close(userId, itemId, 'converted');
  } catch {
    return { error: 'No se pudo convertir. Inténtalo de nuevo.', saved: false };
  }

  revalidatePath('/tasks');
  revalidatePath('/calendar');
  refresh();
  return { error: null, saved: true };
}

/** Marks an item handled without creating anything from it. */
export async function discardInboxItem(formData: FormData): Promise<void> {
  const parsedId = uuidSchema.safeParse(String(formData.get('itemId') ?? ''));
  if (!parsedId.success) return;

  const { userId, db } = await requireUser();
  await db.inbox.close(userId, parsedId.data as InboxItemId, 'discarded');

  refresh();
}

export async function deleteInboxItem(formData: FormData): Promise<void> {
  const parsedId = uuidSchema.safeParse(String(formData.get('itemId') ?? ''));
  if (!parsedId.success) return;

  const { userId, db } = await requireUser();
  await db.inbox.remove(userId, parsedId.data as InboxItemId);

  refresh();
}
