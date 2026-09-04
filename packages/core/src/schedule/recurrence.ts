import type {
  DateRange,
  Instant,
  IsoDate,
  Location,
  Modality,
  SubjectSchedule,
  TimeOfDay,
  TimeZone,
} from '@pulse/types';
import { addDays, isDateWithin, nextDateOnWeekday } from '../time/dates.js';
import { zonedTimeToInstant } from '../time/zone.js';

/**
 * A class occurrence derived from a recurring slot.
 *
 * This is not a stored session. Generating occurrences and persisting them are
 * separate steps so a schedule change can be previewed before it writes rows.
 */
export interface PlannedSession {
  subjectId: SubjectSchedule['subjectId'];
  subjectScheduleId: SubjectSchedule['id'];
  date: IsoDate;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  modality: Modality;
  meetingUrl: string | null;
  location: Location;
  startsAt: Instant;
  endsAt: Instant;
}

/** Narrows a schedule's own active range against the period it belongs to. */
function effectiveRange(schedule: SubjectSchedule, periodRange: DateRange): DateRange | null {
  const scheduleRange = schedule.activeRange;
  if (!scheduleRange) return periodRange;

  const start = scheduleRange.start > periodRange.start ? scheduleRange.start : periodRange.start;

  const ends = [scheduleRange.end, periodRange.end].filter((value): value is IsoDate => value !== null);
  const end = ends.length === 0 ? null : ends.reduce((a, b) => (a < b ? a : b));

  if (end !== null && start > end) return null;
  return { start, end };
}

/**
 * Expands one recurring slot into occurrences inside `window`.
 *
 * An open-ended schedule still needs a bounded window, otherwise there is no
 * last occurrence to stop at.
 */
export function expandSchedule(
  schedule: SubjectSchedule,
  periodRange: DateRange,
  window: { start: IsoDate; end: IsoDate },
  timeZone: TimeZone,
): PlannedSession[] {
  const range = effectiveRange(schedule, periodRange);
  if (!range) return [];

  const from = window.start > range.start ? window.start : range.start;
  const until = range.end !== null && range.end < window.end ? range.end : window.end;
  if (from > until) return [];

  const sessions: PlannedSession[] = [];
  let cursor = nextDateOnWeekday(from, schedule.weekday);

  while (cursor <= until) {
    if (isDateWithin(cursor, range.start, range.end)) {
      sessions.push({
        subjectId: schedule.subjectId,
        subjectScheduleId: schedule.id,
        date: cursor,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        modality: schedule.modality,
        meetingUrl: schedule.meetingUrl,
        location: schedule.location,
        startsAt: zonedTimeToInstant(cursor, schedule.startTime, timeZone),
        endsAt: zonedTimeToInstant(cursor, schedule.endTime, timeZone),
      });
    }
    cursor = addDays(cursor, 7);
  }

  return sessions;
}

/** Expands several slots and orders the result chronologically. */
export function expandSchedules(
  schedules: readonly SubjectSchedule[],
  periodRange: DateRange,
  window: { start: IsoDate; end: IsoDate },
  timeZone: TimeZone,
): PlannedSession[] {
  return schedules
    .flatMap((schedule) => expandSchedule(schedule, periodRange, window, timeZone))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
