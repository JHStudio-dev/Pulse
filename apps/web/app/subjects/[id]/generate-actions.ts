'use server';

import { expandSchedules } from '@pulse/core';
import type { SubjectId } from '@pulse/types';
import { uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';

export interface GenerateResult {
  error: string | null;
  created: number;
}

/**
 * Materialises class sessions for a subject across its period.
 *
 * Sessions that already exist on a date are left alone: regenerating must not
 * wipe a room change or a cancellation the student recorded by hand.
 */
export async function generateSessions(
  _previous: GenerateResult,
  formData: FormData,
): Promise<GenerateResult> {
  const parsedId = uuidSchema.safeParse(String(formData.get('subjectId') ?? ''));
  if (!parsedId.success) return { error: 'Materia no válida', created: 0 };

  const { userId, db } = await requireUser();
  const subjectId = parsedId.data as SubjectId;

  const subject = await db.subjects.findById(userId, subjectId);
  if (!subject) return { error: 'Materia no encontrada', created: 0 };

  const period = await db.periods.findById(userId, subject.academicPeriodId);
  if (!period) return { error: 'Período no encontrado', created: 0 };

  if (period.range.end === null) {
    return { error: 'El período necesita una fecha de fin para generar clases', created: 0 };
  }

  const schedules = await db.schedules.listBySubject(userId, subjectId);
  if (schedules.length === 0) {
    return { error: 'Agrega al menos un horario antes de generar clases', created: 0 };
  }

  const planned = expandSchedules(
    schedules,
    period.range,
    { start: period.range.start, end: period.range.end },
    period.timeZone,
  );

  const existing = await db.sessions.listBySubject(userId, subjectId);
  const taken = new Set(existing.map((session) => `${session.date} ${session.startTime}`));

  const missing = planned.filter((session) => !taken.has(`${session.date} ${session.startTime}`));

  if (missing.length === 0) {
    return { error: null, created: 0 };
  }

  try {
    await db.sessions.createMany(
      userId,
      missing.map((session) => ({
        subjectId: session.subjectId,
        subjectScheduleId: session.subjectScheduleId,
        date: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        modality: session.modality,
        status: 'scheduled' as const,
        meetingUrl: session.meetingUrl,
        location: session.location,
        changeNote: null,
        cancelledReason: null,
      })),
    );
  } catch {
    return { error: 'No se pudieron generar las clases. Inténtalo de nuevo.', created: 0 };
  }

  revalidatePath(`/subjects/${subjectId}`);
  return { error: null, created: missing.length };
}
