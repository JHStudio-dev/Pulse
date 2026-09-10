'use server';

import { offsetFromInstant, sessionStartsAt, taskDueAt, zonedTimeToDate } from '@pulse/core';
import type { ClassSessionId, ReminderId, TaskId } from '@pulse/types';
import { uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';

export interface ReminderResult {
  error: string | null;
  saved: boolean;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function refresh(): void {
  revalidatePath('/', 'layout');
}

/**
 * Reads the requested offset.
 *
 * A preset arrives as minutes. A custom moment arrives as a local date and time
 * and is converted against the target, because the schema stores an offset
 * rather than an instant.
 */
function resolveOffset(formData: FormData, targetAt: Date, timeZone: string): number | string {
  const preset = text(formData, 'offsetMinutes');

  if (preset !== 'custom') {
    const minutes = Number(preset);
    if (!Number.isFinite(minutes) || minutes < 0) return 'Elige cuándo avisarte';
    return minutes;
  }

  const date = text(formData, 'customDate');
  const time = text(formData, 'customTime');
  if (date.length === 0 || time.length === 0) return 'Indica fecha y hora';

  // The form gives a wall clock; the student's timezone turns it into an instant.
  const chosen = zonedTimeToDate(date, time, timeZone);

  const offset = offsetFromInstant(targetAt, chosen);
  if (offset === null) return 'El aviso debe ser antes de la fecha límite';
  return offset;
}

export async function createTaskReminder(
  _previous: ReminderResult,
  formData: FormData,
): Promise<ReminderResult> {
  const parsedId = uuidSchema.safeParse(text(formData, 'taskId'));
  if (!parsedId.success) return { error: 'Tarea no válida', saved: false };

  const { userId, db } = await requireUser();
  const period = await db.periods.findActive(userId);
  if (!period) return { error: 'No hay período activo', saved: false };

  // Loaded through the caller's session, so another student's task is not found.
  const task = await db.tasks.findById(userId, parsedId.data as TaskId);
  if (!task) return { error: 'Tarea no encontrada', saved: false };

  const targetAt = taskDueAt(task, period.timeZone);
  if (targetAt === null) {
    return { error: 'La tarea necesita una fecha límite', saved: false };
  }
  if (targetAt.getTime() <= Date.now()) {
    return { error: 'Esa fecha límite ya pasó', saved: false };
  }

  const offset = resolveOffset(formData, targetAt, period.timeZone);
  if (typeof offset === 'string') return { error: offset, saved: false };

  try {
    await db.reminders.createForTask(userId, task.id, offset);
  } catch {
    return { error: 'No se pudo crear el recordatorio', saved: false };
  }

  refresh();
  return { error: null, saved: true };
}

export async function createSessionReminder(
  _previous: ReminderResult,
  formData: FormData,
): Promise<ReminderResult> {
  const parsedId = uuidSchema.safeParse(text(formData, 'sessionId'));
  if (!parsedId.success) return { error: 'Clase no válida', saved: false };

  const { userId, db } = await requireUser();
  const period = await db.periods.findActive(userId);
  if (!period) return { error: 'No hay período activo', saved: false };

  const session = await db.sessions.findById(userId, parsedId.data as ClassSessionId);
  if (!session) return { error: 'Clase no encontrada', saved: false };
  if (session.status === 'cancelled') {
    return { error: 'Esa clase está cancelada', saved: false };
  }

  const targetAt = sessionStartsAt(session, period.timeZone);
  if (targetAt.getTime() <= Date.now()) {
    return { error: 'Esa clase ya empezó', saved: false };
  }

  const offset = resolveOffset(formData, targetAt, period.timeZone);
  if (typeof offset === 'string') return { error: offset, saved: false };

  try {
    await db.reminders.createForSession(userId, session.id, offset);
  } catch {
    return { error: 'No se pudo crear el recordatorio', saved: false };
  }

  refresh();
  return { error: null, saved: true };
}

export async function deleteReminder(formData: FormData): Promise<void> {
  const parsedId = uuidSchema.safeParse(String(formData.get('reminderId') ?? ''));
  if (!parsedId.success) return;

  const { userId, db } = await requireUser();
  await db.reminders.remove(userId, parsedId.data as ReminderId);

  refresh();
}
