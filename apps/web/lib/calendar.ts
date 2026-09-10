import { addDays, weekdayOf } from '@pulse/core';
import type { IsoDate, Weekday } from '@pulse/types';

/**
 * Month grid helpers.
 *
 * All arithmetic runs on `YYYY-MM-DD` strings in UTC. Reading these dates in
 * local time would shift the day for anyone west of Greenwich and land classes
 * on the wrong square.
 */

/** A month key, `YYYY-MM`. */
export type MonthKey = string;

export function monthKeyOf(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

export function startOfMonth(month: MonthKey): IsoDate {
  return `${month}-01`;
}

export function endOfMonth(month: MonthKey): IsoDate {
  const [year, monthNumber] = month.split('-').map(Number);
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(year!, monthNumber!, 0));
  return last.toISOString().slice(0, 10);
}

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, monthNumber! - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

export function formatMonth(month: MonthKey): string {
  const parsed = new Date(`${startOfMonth(month)}T00:00:00Z`);
  const label = new Intl.DateTimeFormat('es', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export interface GridDay {
  date: IsoDate;
  inMonth: boolean;
}

/**
 * Six weeks starting on Monday.
 *
 * A fixed height stops the grid from resizing between months, which is
 * distracting when stepping through the period.
 */
export function buildMonthGrid(month: MonthKey): GridDay[][] {
  const first = startOfMonth(month);
  const offset = (weekdayOf(first) as Weekday) - 1;
  let cursor = addDays(first, -offset);

  const weeks: GridDay[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const days: GridDay[] = [];
    for (let day = 0; day < 7; day += 1) {
      days.push({ date: cursor, inMonth: cursor.startsWith(month) });
      cursor = addDays(cursor, 1);
    }
    weeks.push(days);
  }
  return weeks;
}

export const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Clamps a month to the period so navigation cannot leave it. */
export function clampMonth(month: MonthKey, start: IsoDate, end: IsoDate | null): MonthKey {
  const first = monthKeyOf(start);
  if (month < first) return first;
  if (end !== null) {
    const last = monthKeyOf(end);
    if (month > last) return last;
  }
  return month;
}
