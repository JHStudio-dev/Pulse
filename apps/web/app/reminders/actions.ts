'use server';

import { offsetFromInstant, reminderFiresAt, sessionStartsAt, taskDueAt, zonedTimeToDate } from '@pulse/core';
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
  revalidatePath('/tasks');
  revalidatePath('/reminders');
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
    if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 525600) return 'Elige cuándo avisarte';
    return minutes;
  }

  const date = text(formData, 'customDate');
  const time = text(formData, 'customTime');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return 'Indica una fecha y hora válidas';
  }

  // The form gives a wall clock; the student's timezone turns it into an instant.
  const chosen = zonedTimeToDate(date, time, timeZone);
  if (Number.isNaN(chosen.getTime())) return 'Indica una fecha y hora válidas';

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
  if (task.status === 'done' || task.status === 'submitted') {
    return { error: 'La tarea ya está completada', saved: false };
  }

  const note = text(formData, 'message');
  if (note.length > 500) return { error: 'El mensaje admite hasta 500 caracteres', saved: false };

  let deadlineUpdate: { dueDate: string; dueTime: string | null } | null = null;
  if (task.dueDate === null) {
    const dueDate = text(formData, 'taskDueDate');
    const dueTime = text(formData, 'taskDueTime');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || (dueTime && !/^\d{2}:\d{2}$/.test(dueTime))) {
      return { error: 'Agrega una fecha límite válida para la tarea', saved: false };
    }
    const verifiedDate = new Date(`${dueDate}T12:00:00Z`);
    if (Number.isNaN(verifiedDate.getTime()) || verifiedDate.toISOString().slice(0, 10) !== dueDate) {
      return { error: 'La fecha límite no es válida', saved: false };
    }
    deadlineUpdate = { dueDate, dueTime: dueTime || null };
  }

  const targetAt = taskDueAt({ ...task, ...(deadlineUpdate ?? {}) }, period.timeZone);
  if (targetAt === null || Number.isNaN(targetAt.getTime())) {
    return { error: 'La tarea necesita una fecha límite', saved: false };
  }
  if (targetAt.getTime() <= Date.now()) {
    return { error: 'La fecha límite ya pasó', saved: false };
  }

  const offset = resolveOffset(formData, targetAt, period.timeZone);
  if (typeof offset === 'string') return { error: offset, saved: false };
  if (reminderFiresAt(targetAt, offset).getTime() <= Date.now()) {
    return { error: 'Ese recordatorio sería para un momento que ya pasó', saved: false };
  }

  const existing = await db.reminders.listByUser(userId);
  if (existing.some((item) =>
    item.enabled && item.target.kind === 'task' && item.target.taskId === task.id &&
    item.offsetMinutes === offset
  )) {
    return { error: 'Ya tienes un recordatorio para ese momento', saved: false };
  }

  if (deadlineUpdate) {
    try {
      await db.tasks.update(userId, task.id, deadlineUpdate);
    } catch {
      return { error: 'No se pudo establecer la fecha límite', saved: false };
    }
  }

  try {
    await db.reminders.createForTask(userId, task.id, offset, note || null);
  } catch {
    return {
      error: deadlineUpdate
        ? 'La fecha quedó guardada, pero no se pudo crear el recordatorio. Inténtalo de nuevo.'
        : 'No se pudo crear el recordatorio',
      saved: false,
    };
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

  const note = text(formData, 'message');
  if (note.length > 500) return { error: 'El mensaje admite hasta 500 caracteres', saved: false };

  const offset = resolveOffset(formData, targetAt, period.timeZone);
  if (typeof offset === 'string') return { error: offset, saved: false };
  if (reminderFiresAt(targetAt, offset).getTime() <= Date.now()) {
    return { error: 'Ese recordatorio sería para un momento que ya pasó', saved: false };
  }

  const existing = await db.reminders.listByUser(userId);
  if (existing.some((item) =>
    item.enabled && item.target.kind === 'class_session' && item.target.classSessionId === session.id &&
    item.offsetMinutes === offset
  )) {
    return { error: 'Ya tienes un recordatorio para ese momento', saved: false };
  }

  try {
    await db.reminders.createForSession(userId, session.id, offset, note || null);
  } catch {
    return { error: 'No se pudo crear el recordatorio', saved: false };
  }

  refresh();
  return { error: null, saved: true };
}

export async function updateReminder(
  _previous: ReminderResult,
  formData: FormData,
): Promise<ReminderResult> {
  const id = uuidSchema.safeParse(text(formData, 'reminderId'));
  if (!id.success) return { error: 'Recordatorio no válido', saved: false };

  const { userId, db } = await requireUser();
  const period = await db.periods.findActive(userId);
  if (!period) return { error: 'No hay período activo', saved: false };

  const reminder = (await db.reminders.listByUser(userId)).find((item) => item.id === id.data);
  if (!reminder || !reminder.enabled) {
    return { error: 'Recordatorio no encontrado', saved: false };
  }

  let targetAt: Date | null = null;
  if (reminder.target.kind === 'task' && reminder.target.taskId) {
    const task = await db.tasks.findById(userId, reminder.target.taskId);
    if (!task || task.status === 'done' || task.status === 'submitted') {
      return { error: 'La tarea ya no está pendiente', saved: false };
    }
    targetAt = taskDueAt(task, period.timeZone);
  }
  if (reminder.target.kind === 'class_session' && reminder.target.classSessionId) {
    const session = await db.sessions.findById(userId, reminder.target.classSessionId);
    if (!session || session.status === 'cancelled') {
      return { error: 'La clase ya no está disponible', saved: false };
    }
    targetAt = sessionStartsAt(session, period.timeZone);
  }

  if (!targetAt || targetAt.getTime() <= Date.now()) {
    return { error: 'La fecha de este recordatorio ya pasó', saved: false };
  }

  const message = text(formData, 'message');
  if (message.length > 500) return { error: 'El mensaje admite hasta 500 caracteres', saved: false };

  const offset = resolveOffset(formData, targetAt, period.timeZone);
  if (typeof offset === 'string') return { error: offset, saved: false };
  if (offset > 525600 || reminderFiresAt(targetAt, offset).getTime() <= Date.now()) {
    return { error: 'Elige un momento futuro antes de la fecha límite', saved: false };
  }

  const all = await db.reminders.listByUser(userId);
  if (all.some((item) =>
    item.id !== reminder.id &&
    item.enabled &&
    item.target.kind === reminder.target.kind &&
    item.target.taskId === reminder.target.taskId &&
    item.target.classSessionId === reminder.target.classSessionId &&
    item.offsetMinutes === offset
  )) {
    return { error: 'Ya tienes otro recordatorio para ese momento', saved: false };
  }

  try {
    await db.reminders.update(userId, reminder.id, {
      offsetMinutes: offset,
      message: message || null,
    });
  } catch {
    return { error: 'No se pudo actualizar el recordatorio', saved: false };
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
