'use server';

import type { SubjectId, TaskId } from '@pulse/types';
import { createTaskSchema, updateTaskSchema, uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';

export interface TaskResult {
  error: string | null;
  saved: boolean;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function optionalId(value: string): SubjectId | null {
  return uuidSchema.safeParse(value).success ? (value as SubjectId) : null;
}

function refreshTaskViews(): void {
  revalidatePath('/tasks');
  revalidatePath('/');
}

/**
 * Quick capture: title, subject and due date only.
 *
 * Everything else keeps its default. Asking for difficulty or weight up front
 * would make adding a task slower than writing it on paper, which is the one
 * thing the specification says it must never be.
 */
export async function createTask(_previous: TaskResult, formData: FormData): Promise<TaskResult> {
  const dueDate = text(formData, 'dueDate');

  const parsed = createTaskSchema.safeParse({
    subjectId: optionalId(text(formData, 'subjectId')),
    title: text(formData, 'title'),
    dueDate: dueDate.length > 0 ? dueDate : null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos', saved: false };
  }

  const { userId, db } = await requireUser();

  try {
    // The schema validates shape; the branded id comes from the checked value.
    await db.tasks.create(userId, {
      ...parsed.data,
      subjectId: parsed.data.subjectId as SubjectId | null,
    });
  } catch {
    return { error: 'No se pudo guardar la tarea. Inténtalo de nuevo.', saved: false };
  }

  refreshTaskViews();
  return { error: null, saved: true };
}

/** Full edit, including the fields quick capture leaves out. */
export async function updateTask(_previous: TaskResult, formData: FormData): Promise<TaskResult> {
  const parsedId = uuidSchema.safeParse(text(formData, 'taskId'));
  if (!parsedId.success) return { error: 'Tarea no válida', saved: false };

  const dueDate = text(formData, 'dueDate');
  const dueTime = text(formData, 'dueTime');
  const description = text(formData, 'description');
  const difficulty = text(formData, 'difficulty');

  const parsed = updateTaskSchema.safeParse({
    subjectId: optionalId(text(formData, 'subjectId')),
    title: text(formData, 'title'),
    description: description.length > 0 ? description : null,
    dueDate: dueDate.length > 0 ? dueDate : null,
    dueTime: dueTime.length > 0 ? dueTime : null,
    status: text(formData, 'status') || 'pending',
    difficulty: difficulty.length > 0 ? difficulty : null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos', saved: false };
  }

  const { userId, db } = await requireUser();

  // The edit form always submits every field, so each one is written explicitly
  // rather than spreading a partial whose members are all optional.
  const changes = {
    subjectId: (parsed.data.subjectId ?? null) as SubjectId | null,
    title: parsed.data.title ?? '',
    description: parsed.data.description ?? null,
    dueDate: parsed.data.dueDate ?? null,
    dueTime: parsed.data.dueTime ?? null,
    status: parsed.data.status ?? 'pending',
    difficulty: parsed.data.difficulty ?? null,
  };

  try {
    await db.tasks.update(userId, parsedId.data as TaskId, changes);
  } catch {
    return { error: 'No se pudo guardar la tarea. Inténtalo de nuevo.', saved: false };
  }

  refreshTaskViews();
  return { error: null, saved: true };
}

/**
 * Toggles between done and pending.
 *
 * Progress follows the status so the two cannot disagree: a task marked done
 * with 40% progress would be a contradiction the interface then has to explain.
 */
export async function toggleTaskDone(formData: FormData): Promise<void> {
  const parsedId = uuidSchema.safeParse(String(formData.get('taskId') ?? ''));
  if (!parsedId.success) return;

  const { userId, db } = await requireUser();
  const id = parsedId.data as TaskId;

  const task = await db.tasks.findById(userId, id);
  if (!task) return;

  const done = task.status === 'done';
  await db.tasks.update(userId, id, {
    status: done ? 'pending' : 'done',
    progress: done ? 0 : 100,
  });

  refreshTaskViews();
}

export async function deleteTask(formData: FormData): Promise<void> {
  const parsedId = uuidSchema.safeParse(String(formData.get('taskId') ?? ''));
  if (!parsedId.success) return;

  const { userId, db } = await requireUser();
  await db.tasks.remove(userId, parsedId.data as TaskId);

  refreshTaskViews();
}
