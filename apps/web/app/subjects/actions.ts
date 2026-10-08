'use server';

import type { SubjectId, UserId } from '@pulse/types';
import { createSubjectSchema, uuidSchema } from '@pulse/validation';
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


export async function restoreSubject(formData: FormData): Promise<void> {
  const subject = uuidSchema.safeParse(String(formData.get('subjectId') ?? ''));
  if (!subject.success) return;

  const { userId, db } = await requireUser();
  await db.subjects.restore(userId, subject.data as SubjectId);

  revalidatePath('/subjects');
  revalidatePath('/subjects/archived');
  revalidatePath('/');
}


async function removeSubjectWithTasks(
  userId: UserId,
  db: Awaited<ReturnType<typeof requireUser>>['db'],
  subjectId: SubjectId,
): Promise<void> {
  const tasks = await db.tasks.listBySubject(userId, subjectId);
  await Promise.all(tasks.map((task) => db.tasks.remove(userId, task.id)));
  await db.subjects.remove(userId, subjectId);
}

function refreshSubjectViews(): void {
  revalidatePath('/subjects');
  revalidatePath('/subjects/archived');
  revalidatePath('/tasks');
  revalidatePath('/');
}

export async function deleteSubjectPermanently(formData: FormData): Promise<void> {
  const subject = uuidSchema.safeParse(String(formData.get('subjectId') ?? ''));
  if (!subject.success) return;

  const { userId, db } = await requireUser();
  const subjectId = subject.data as SubjectId;
  const owned = await db.subjects.findById(userId, subjectId);

  if (!owned || owned.archivedAt === null) return;

  await removeSubjectWithTasks(userId, db, subjectId);
  refreshSubjectViews();
}

export async function deleteAllSubjectsInActivePeriod(): Promise<void> {
  const { userId, db } = await requireUser();
  const period = await db.periods.findActive(userId);
  if (!period) return;

  const [active, archived] = await Promise.all([
    db.subjects.listByPeriod(userId, period.id),
    db.subjects.listArchivedByPeriod(userId, period.id),
  ]);

  const subjects = new Map([...active, ...archived].map((subject) => [subject.id, subject]));

  for (const subject of subjects.values()) {
    await removeSubjectWithTasks(userId, db, subject.id);
  }

  refreshSubjectViews();
}
