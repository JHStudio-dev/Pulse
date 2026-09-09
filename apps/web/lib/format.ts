import type { Modality, SubjectSchedule, Weekday } from '@pulse/types';

/**
 * Presentation helpers.
 *
 * Domain code returns codes and numbers; the wording lives here.
 */

export const MODALITY_LABEL: Record<Modality, string> = {
  in_person: 'Presencial',
  virtual: 'Virtual',
  hybrid: 'Híbrida',
  unconfirmed: 'Sin confirmar',
};

const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
};

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

/** "Lun 08:00 · Mié 10:00", ordered by weekday. */
export function summarizeSchedules(schedules: readonly SubjectSchedule[]): string {
  return [...schedules]
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
    .map((slot) => `${WEEKDAY_SHORT[slot.weekday]} ${slot.startTime}`)
    .join(' · ');
}

/**
 * "mar 10 sep" from a plain calendar date.
 *
 * Formatted in UTC because an IsoDate carries no zone; reading it locally would
 * shift the day for anyone west of Greenwich.
 */
export function formatSessionDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}
