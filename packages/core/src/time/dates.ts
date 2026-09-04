import type { IsoDate, Weekday } from '@pulse/types';

/** Calendar arithmetic on `YYYY-MM-DD` strings, independent of any timezone. */

const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toUtcDate(value) !== null;
}

function toUtcDate(date: IsoDate): Date | null {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Rejects overflow like 2026-02-30, which Date.UTC would roll forward.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function requireUtcDate(date: IsoDate): Date {
  const parsed = toUtcDate(date);
  if (!parsed) throw new Error(`Invalid date: ${date}`);
  return parsed;
}

export function formatIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const parsed = requireUtcDate(date);
  return formatIsoDate(new Date(parsed.getTime() + days * MS_PER_DAY));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((requireUtcDate(to).getTime() - requireUtcDate(from).getTime()) / MS_PER_DAY);
}

/** ISO weekday, 1 = Monday through 7 = Sunday. */
export function weekdayOf(date: IsoDate): Weekday {
  const day = requireUtcDate(date).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

export function compareIsoDates(left: IsoDate, right: IsoDate): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Inclusive on both ends. */
export function isDateWithin(date: IsoDate, start: IsoDate, end: IsoDate | null): boolean {
  if (date < start) return false;
  return end === null || date <= end;
}

/** First date on or after `from` that falls on `weekday`. */
export function nextDateOnWeekday(from: IsoDate, weekday: Weekday): IsoDate {
  const shift = (weekday - weekdayOf(from) + 7) % 7;
  return addDays(from, shift);
}
