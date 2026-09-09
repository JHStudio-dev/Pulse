'use server';

import type { CampusInstanceId } from '@pulse/types';
import { createAcademicPeriodSchema, uuidSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';

export interface OnboardingResult {
  error: string | null;
}

/**
 * Creates the student's first academic period.
 *
 * The period is created active: a student setting Pulse up is starting the term
 * they are in, and a planned period would leave every screen empty.
 */
export async function createFirstPeriod(
  _previous: OnboardingResult,
  formData: FormData,
): Promise<OnboardingResult> {
  const endDate = String(formData.get('endDate') ?? '').trim();

  const parsed = createAcademicPeriodSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    range: {
      start: String(formData.get('startDate') ?? ''),
      end: endDate.length > 0 ? endDate : null,
    },
    timeZone: String(formData.get('timeZone') ?? ''),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos del período' };
  }

  const campus = uuidSchema.safeParse(String(formData.get('campusInstanceId') ?? '').trim());
  if (!campus.success) {
    return { error: 'Elige tu universidad' };
  }

  const { userId, db } = await requireUser();

  try {
    await db.campusConnections.selectCampus(userId, campus.data as CampusInstanceId);
    await db.periods.create(userId, {
      name: parsed.data.name,
      range: parsed.data.range,
      status: 'active',
      timeZone: parsed.data.timeZone,
    });
  } catch {
    return { error: 'No se pudo guardar el período. Inténtalo de nuevo.' };
  }

  revalidatePath('/', 'layout');
  redirect('/subjects');
}
