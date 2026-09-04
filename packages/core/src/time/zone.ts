import type { Instant, IsoDate, TimeOfDay, TimeZone } from '@pulse/types';

/**
 * Wall-clock to instant conversion.
 *
 * A schedule says "Monday 08:00" in the student's zone; an instant is a real
 * moment. Converting between them needs the zone offset *at that moment*, which
 * changes across DST. Honduras has no DST, but the pilot must not bake that in.
 */

const PARTS_FORMAT_CACHE = new Map<TimeZone, Intl.DateTimeFormat>();

function partsFormatter(timeZone: TimeZone): Intl.DateTimeFormat {
  let formatter = PARTS_FORMAT_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    PARTS_FORMAT_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

/** Reads the calendar fields an instant shows in a given zone. */
function zonedFields(date: Date, timeZone: TimeZone): number[] {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };
  return [read('year'), read('month'), read('day'), read('hour'), read('minute'), read('second')];
}

/** Offset in milliseconds that `timeZone` is ahead of UTC at `date`. */
export function zoneOffsetMs(date: Date, timeZone: TimeZone): number {
  const [year, month, day, hour, minute, second] = zonedFields(date, timeZone);
  const asUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  // Discard sub-second noise so the difference lands on a whole minute.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parseIsoDate(date: IsoDate): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid date: ${date}`);
  }
  return [year, month, day];
}

function parseTimeOfDay(time: TimeOfDay): [number, number] {
  const [hour, minute] = time.split(':').map(Number);
  if (hour === undefined || minute === undefined) {
    throw new Error(`Invalid time: ${time}`);
  }
  return [hour, minute];
}

/**
 * Converts a local date and time in `timeZone` to an absolute instant.
 *
 * The offset is resolved twice because the first guess uses the offset at the
 * naive UTC timestamp, which is wrong on the days a zone shifts.
 */
export function zonedTimeToDate(date: IsoDate, time: TimeOfDay, timeZone: TimeZone): Date {
  const [year, month, day] = parseIsoDate(date);
  const [hour, minute] = parseTimeOfDay(time);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  const firstOffset = zoneOffsetMs(new Date(naiveUtc), timeZone);
  const firstGuess = naiveUtc - firstOffset;

  const secondOffset = zoneOffsetMs(new Date(firstGuess), timeZone);
  if (secondOffset === firstOffset) {
    return new Date(firstGuess);
  }
  return new Date(naiveUtc - secondOffset);
}

export function zonedTimeToInstant(date: IsoDate, time: TimeOfDay, timeZone: TimeZone): Instant {
  return zonedTimeToDate(date, time, timeZone).toISOString();
}

/** The calendar date an instant falls on inside `timeZone`. */
export function instantToZonedDate(instant: Instant | Date, timeZone: TimeZone): IsoDate {
  const date = instant instanceof Date ? instant : new Date(instant);
  const [year, month, day] = zonedFields(date, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The wall-clock time an instant shows inside `timeZone`. */
export function instantToZonedTime(instant: Instant | Date, timeZone: TimeZone): TimeOfDay {
  const date = instant instanceof Date ? instant : new Date(instant);
  const fields = zonedFields(date, timeZone);
  return `${String(fields[3]).padStart(2, '0')}:${String(fields[4]).padStart(2, '0')}`;
}
