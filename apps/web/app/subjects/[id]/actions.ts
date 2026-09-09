'use server';

import type { SubjectId, SubjectScheduleId } from '@pulse/types';
import { createSubjectScheduleSchema, uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';

export interface ScheduleResult {
  error: string | null;
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

/**
 * Adds a weekly slot to a subject.
 *
 * Ownership is checked by loading the subject through the caller's own session
 * first: row level security would reject a foreign write anyway, but failing
 * here gives a clear message instead of a driver error.
 */
export async function createSchedule(
  _previous: ScheduleResult,
  formData: FormData,
): Promise<ScheduleResult> {
  const subject = uuidSchema.safeParse(text(formData, 'subjectId'));
  if (!subject.success) return { error: 'Materia no válida' };

  const { userId, db } = await requireUser();
  const subjectId = subject.data as SubjectId;

  const owned = await db.subjects.findById(userId, subjectId);
  if (!owned) return { error: 'Materia no encontrada' };

  const meetingUrl = text(formData, 'meetingUrl');

  const parsed = createSubjectScheduleSchema.safeParse({
    subjectId,
    weekday: Number(text(formData, 'weekday')),
    startTime: text(formData, 'startTime'),
    endTime: text(formData, 'endTime'),
    modality: text(formData, 'modality') || owned.defaultModality,
    meetingUrl: meetingUrl.length > 0 ? meetingUrl : owned.defaultMeetingUrl,
    location: {
      campus: text(formData, 'campus') || owned.defaultLocation.campus || '',
      building: text(formData, 'building') || owned.defaultLocation.building || '',
      room: text(formData, 'room') || owned.defaultLocation.room || '',
    },
    activeRange: null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa el horario' };
  }

  try {
    await db.schedules.create(userId, { ...parsed.data, subjectId });
  } catch {
    return { error: 'No se pudo guardar el horario. Inténtalo de nuevo.' };
  }

  revalidatePath(`/subjects/${subjectId}`);
  return { error: null };
}

export async function deleteSchedule(formData: FormData): Promise<void> {
  const schedule = uuidSchema.safeParse(String(formData.get('scheduleId') ?? ''));
  const subject = uuidSchema.safeParse(String(formData.get('subjectId') ?? ''));
  if (!schedule.success || !subject.success) return;

  const { userId, db } = await requireUser();
  await db.schedules.remove(userId, schedule.data as SubjectScheduleId);

  revalidatePath(`/subjects/${subject.data}`);
}
