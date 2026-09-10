'use server';

import { buildRecoveryPlan, deriveRecoveryStatus } from '@pulse/core';
import type {
  Attendance,
  AttendanceStatus,
  ClassMarkerKind,
  ClassMarkerId,
  ClassSessionId,
  NoteId,
  RecoveryItemId,
} from '@pulse/types';
import { uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';

export interface ClassResult {
  error: string | null;
  saved: boolean;
}

const MARKER_KINDS: readonly ClassMarkerKind[] = [
  'note',
  'question',
  'important',
  'task',
  'missed',
];
const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'attended',
  'partial',
  'missed',
  'cancelled',
];

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

/**
 * Records a marker during class.
 *
 * The offset comes from the client because only the browser knows how long the
 * student has had the screen open; it is clamped so a bad value cannot land a
 * marker outside the session.
 */
export async function addMarker(_previous: ClassResult, formData: FormData): Promise<ClassResult> {
  const parsedId = uuidSchema.safeParse(text(formData, 'sessionId'));
  if (!parsedId.success) return { error: 'Clase no válida', saved: false };

  const kind = text(formData, 'kind') as ClassMarkerKind;
  if (!MARKER_KINDS.includes(kind)) return { error: 'Marcador no válido', saved: false };

  const rawOffset = Number(text(formData, 'offsetSeconds'));
  const offset = Number.isFinite(rawOffset)
    ? Math.max(0, Math.min(Math.round(rawOffset), 86_400))
    : 0;

  const note = text(formData, 'note');

  const { userId, db } = await requireUser();
  const sessionId = parsedId.data as ClassSessionId;

  const session = await db.sessions.findById(userId, sessionId);
  if (!session) return { error: 'Clase no encontrada', saved: false };

  try {
    await db.markers.create(
      userId,
      sessionId,
      kind,
      offset,
      note.length > 0 ? note.slice(0, 500) : null,
    );
  } catch {
    return { error: 'No se pudo guardar el marcador', saved: false };
  }

  revalidatePath('/sessions/[id]', 'page');
  return { error: null, saved: true };
}

export async function removeMarker(formData: FormData): Promise<void> {
  const parsedId = uuidSchema.safeParse(String(formData.get('markerId') ?? ''));
  const parsedSession = uuidSchema.safeParse(String(formData.get('sessionId') ?? ''));
  if (!parsedId.success || !parsedSession.success) return;

  const { userId, db } = await requireUser();
  await db.markers.remove(userId, parsedId.data as ClassMarkerId);

  revalidatePath('/sessions/[id]', 'page');
}

/**
 * Records attendance and opens a recovery plan when one is warranted.
 *
 * A missed class becomes a plan rather than disappearing, which is the rule the
 * specification is most explicit about. The plan is only created once, so
 * correcting the status does not pile up duplicates.
 */
export async function recordAttendance(
  _previous: ClassResult,
  formData: FormData,
): Promise<ClassResult> {
  const parsedId = uuidSchema.safeParse(text(formData, 'sessionId'));
  if (!parsedId.success) return { error: 'Clase no válida', saved: false };

  const status = text(formData, 'status') as AttendanceStatus;
  if (!ATTENDANCE_STATUSES.includes(status)) return { error: 'Estado no válido', saved: false };

  const { userId, db } = await requireUser();
  const sessionId = parsedId.data as ClassSessionId;

  const session = await db.sessions.findById(userId, sessionId);
  if (!session) return { error: 'Clase no encontrada', saved: false };

  const note = text(formData, 'note');
  const attendance: Attendance = {
    classSessionId: sessionId,
    status,
    note: note.length > 0 ? note.slice(0, 300) : null,
    recordedAt: new Date().toISOString(),
  };

  try {
    await db.attendance.record(userId, attendance);

    const draft = buildRecoveryPlan(session, attendance);
    const existing = await db.recovery.findBySession(userId, sessionId);

    if (draft && !existing) {
      await db.recovery.create(userId, sessionId, draft.items);
    } else if (!draft && existing && existing.status === 'pending') {
      // The student corrected the record to a class they did attend. An
      // untouched plan is no longer warranted; one with progress on it is the
      // student's own work and stays.
      await db.recovery.remove(userId, existing.id);
    }
  } catch {
    return { error: 'No se pudo guardar la asistencia', saved: false };
  }

  revalidatePath('/sessions/[id]', 'page');
  return { error: null, saved: true };
}

/** Ticks a recovery step and keeps the plan status in step with its items. */
export async function toggleRecoveryItem(formData: FormData): Promise<void> {
  const parsedItem = uuidSchema.safeParse(String(formData.get('itemId') ?? ''));
  const parsedSession = uuidSchema.safeParse(String(formData.get('sessionId') ?? ''));
  if (!parsedItem.success || !parsedSession.success) return;

  const { userId, db } = await requireUser();
  const sessionId = parsedSession.data as ClassSessionId;

  const plan = await db.recovery.findBySession(userId, sessionId);
  if (!plan) return;

  const items = await db.recovery.listItems(userId, plan.id);
  const target = items.find((item) => item.id === parsedItem.data);
  if (!target) return;

  await db.recovery.setItemDone(userId, parsedItem.data as RecoveryItemId, !target.done);

  const updated = items.map((item) =>
    item.id === target.id ? { done: !item.done } : { done: item.done },
  );
  const status = deriveRecoveryStatus(updated);
  if (status !== plan.status) {
    await db.recovery.setStatus(userId, plan.id, status);
  }

  revalidatePath('/sessions/[id]', 'page');
}

/**
 * Saves the note written during the class.
 *
 * One note per session, rewritten in place, so reopening the class continues
 * the same page instead of starting a new one every time.
 */
export async function saveSessionNote(
  _previous: ClassResult,
  formData: FormData,
): Promise<ClassResult> {
  const parsedId = uuidSchema.safeParse(text(formData, 'sessionId'));
  if (!parsedId.success) return { error: 'Clase no válida', saved: false };

  const body = text(formData, 'body').slice(0, 20_000);

  const { userId, db } = await requireUser();
  const sessionId = parsedId.data as ClassSessionId;

  const session = await db.sessions.findById(userId, sessionId);
  if (!session) return { error: 'Clase no encontrada', saved: false };

  const existing = await db.notes.findBySession(userId, sessionId);

  try {
    if (existing) {
      if (body.length === 0) {
        await db.notes.remove(userId, existing.id as NoteId);
      } else {
        await db.notes.updateBody(userId, existing.id as NoteId, body);
      }
    } else if (body.length > 0) {
      await db.notes.create(userId, {
        subjectId: session.subjectId,
        classSessionId: sessionId,
        title: null,
        body,
        markers: [],
      });
    }
  } catch {
    return { error: 'No se pudieron guardar los apuntes', saved: false };
  }

  revalidatePath('/sessions/[id]', 'page');
  return { error: null, saved: true };
}
