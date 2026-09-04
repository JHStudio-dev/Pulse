/**
 * Date and time primitives.
 *
 * Pulse separates recurring schedules from concrete sessions. A schedule repeats
 * at a local wall-clock time; a session happens at a real instant. Mixing the two
 * breaks as soon as a period crosses a DST boundary, so they use distinct types.
 */

/** Calendar date with no time or zone. Format: `YYYY-MM-DD`. */
export type IsoDate = string;

/** Local wall-clock time with no date or zone. Format: `HH:mm` (24h). */
export type TimeOfDay = string;

/** Absolute point in time, always stored UTC. Format: ISO 8601. */
export type Instant = string;

/** IANA timezone identifier, e.g. `America/Tegucigalpa`. */
export type TimeZone = string;

/** ISO 8601 weekday: 1 = Monday through 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Half-open local time range. `end` is exclusive. */
export interface TimeRange {
  start: TimeOfDay;
  end: TimeOfDay;
}

/** Half-open date range. An absent `end` means open-ended. */
export interface DateRange {
  start: IsoDate;
  end: IsoDate | null;
}
