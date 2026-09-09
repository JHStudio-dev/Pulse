'use server';

import { createAcademicPeriodSchema } from '@pulse/validation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/session';

export interface PeriodResult {
  error: string | null;
  saved: boolean;
}

/**
 * Updates the active period.
 *
 * Status is deliberately not editable here. Archiving a period changes what
 * every other screen shows, so it needs its own deliberate action rather than
 * riding along in a settings form.
 */
export async function updatePeriod(
  _previous: PeriodResult,
  formData: FormData,
): Promise<PeriodResult> {
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
    return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos', saved: false };
  }

  const { userId, db } = await requireUser();

  const active = await db.periods.findActive(userId);
  if (!active) {
    return { error: 'No hay un período activo', saved: false };
  }

  try {
    await db.periods.update(userId, active.id, {
      name: parsed.data.name,
      range: parsed.data.range,
      timeZone: parsed.data.timeZone,
    });
  } catch {
    return { error: 'No se pudo guardar el período. Inténtalo de nuevo.', saved: false };
  }

  revalidatePath('/', 'layout');
  return { error: null, saved: true };
}
