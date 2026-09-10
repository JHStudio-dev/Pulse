'use server';

import type { SubjectId } from '@pulse/types';
import { createTaskSchema, uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';

export interface CaptureResult {
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
  revalidatePath('/', 'layout');
}

/**
 * Files text without interpreting it.
 *
 * Nothing is parsed: "Programación - proyecto API viernes 11:59" is stored
 * verbatim. When a parser exists it will read this same text, so capturing must
 * not rewrite or split it now.
 */
export async function captureInbox(
  _previous: CaptureResult,
  formData: FormData,
): Promise<CaptureResult> {
  const rawText = text(formData, 'rawText');
  if (rawText.length === 0) return { error: 'Escribe algo', saved: false };
  if (rawText.length > 500) return { error: 'Máximo 500 caracteres', saved: false };

  const { userId, db } = await requireUser();

  try {
    await db.inbox.capture(userId, rawText, optionalSubject(text(formData, 'subjectId')));
  } catch {
    return { error: 'No se pudo guardar. Inténtalo de nuevo.', saved: false };
  }

  refresh();
  return { error: null, saved: true };
}

/** Quick task: title, subject and due date. Everything else keeps its default. */
export async function captureTask(
  _previous: CaptureResult,
  formData: FormData,
): Promise<CaptureResult> {
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

  try {
    await db.tasks.create(userId, {
      ...parsed.data,
      subjectId: parsed.data.subjectId as SubjectId | null,
    });
  } catch {
    return { error: 'No se pudo guardar la tarea. Inténtalo de nuevo.', saved: false };
  }

  refresh();
  return { error: null, saved: true };
}

/** Quick note attached to a subject. */
export async function captureNote(
  _previous: CaptureResult,
  formData: FormData,
): Promise<CaptureResult> {
  const body = text(formData, 'body');
  if (body.length === 0) return { error: 'Escribe la nota', saved: false };

  const title = text(formData, 'title');
  const { userId, db } = await requireUser();

  try {
    await db.notes.create(userId, {
      subjectId: optionalSubject(text(formData, 'subjectId')),
      classSessionId: null,
      title: title.length > 0 ? title.slice(0, 200) : null,
      body: body.slice(0, 50_000),
      markers: [],
    });
  } catch {
    return { error: 'No se pudo guardar la nota. Inténtalo de nuevo.', saved: false };
  }

  refresh();
  return { error: null, saved: true };
}
