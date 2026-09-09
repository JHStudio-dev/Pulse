'use server';

import { createSubjectSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';

export interface SubjectResult {
  error: string | null;
}

function optional(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

/**
 * Creates a subject inside the active period.
 *
 * The period and campus ids come from the student's own records rather than the
 * form, so a subject cannot be attached to a period or institution that is not
 * theirs. Only the typed fields go through validation.
 */
export async function createSubject(
  _previous: SubjectResult,
  formData: FormData,
): Promise<SubjectResult> {
  const { userId, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) {
    return { error: 'Primero configura tu período académico' };
  }

  const connection = await db.campusConnections.findByUser(userId);
  const meetingUrl = optional(formData, 'defaultMeetingUrl');

  const parsed = createSubjectSchema
    .omit({ academicPeriodId: true, campusInstanceId: true })
    .safeParse({
      name: optional(formData, 'name'),
      code: optional(formData, 'code'),
      professorName: optional(formData, 'professorName'),
      professorContact: '',
      defaultModality: optional(formData, 'defaultModality') || 'unconfirmed',
      defaultMeetingUrl: meetingUrl.length > 0 ? meetingUrl : null,
      defaultLocation: {
        campus: optional(formData, 'campus'),
        building: optional(formData, 'building'),
        room: optional(formData, 'room'),
      },
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos de la materia' };
  }

  try {
    await db.subjects.create(userId, {
      ...parsed.data,
      academicPeriodId: period.id,
      campusInstanceId: connection?.campusInstanceId ?? null,
      archivedAt: null,
    });
  } catch {
    return { error: 'No se pudo guardar la materia. Inténtalo de nuevo.' };
  }

  revalidatePath('/subjects');
  revalidatePath('/');
  return { error: null };
}
