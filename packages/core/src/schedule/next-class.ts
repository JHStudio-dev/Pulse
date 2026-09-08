import type { ClassSession, Instant, Subject, TimeZone } from '@pulse/types';
import { zonedTimeToDate } from '../time/zone';

/** Everything the dashboard needs to render the next class correctly. */
export interface UpcomingClass {
  session: ClassSession;
  startsAt: Instant;
  endsAt: Instant;
  minutesUntilStart: number;
  /** When to leave, for in-person classes with a travel buffer. */
  departAt: Instant | null;
  /** True once the class has started but not finished. */
  inProgress: boolean;
}

function sessionInstants(session: ClassSession, timeZone: TimeZone): [Date, Date] {
  return [
    zonedTimeToDate(session.date, session.startTime, timeZone),
    zonedTimeToDate(session.date, session.endTime, timeZone),
  ];
}

/**
 * Cancelled sessions are excluded: the student should see the next class they
 * actually have, not one that was called off.
 */
export function findNextClass(
  sessions: readonly ClassSession[],
  subjectsById: ReadonlyMap<Subject['id'], Subject>,
  now: Date,
  timeZone: TimeZone,
): UpcomingClass | null {
  let best: UpcomingClass | null = null;

  for (const session of sessions) {
    if (session.status === 'cancelled') continue;

    const [startsAt, endsAt] = sessionInstants(session, timeZone);
    if (endsAt.getTime() <= now.getTime()) continue;

    const subject = subjectsById.get(session.subjectId);
    const buffer = session.modality === 'in_person' ? (subject?.travelBufferMinutes ?? null) : null;

    const candidate: UpcomingClass = {
      session,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      minutesUntilStart: Math.round((startsAt.getTime() - now.getTime()) / 60_000),
      departAt:
        buffer === null ? null : new Date(startsAt.getTime() - buffer * 60_000).toISOString(),
      inProgress: startsAt.getTime() <= now.getTime(),
    };

    if (!best || candidate.startsAt < best.startsAt) {
      best = candidate;
    }
  }

  return best;
}

/** Sessions falling on one local date, ordered by start time. */
export function sessionsOnDate(sessions: readonly ClassSession[], date: string): ClassSession[] {
  return sessions
    .filter((session) => session.date === date)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/**
 * A hybrid subject can reach its class day without a confirmed modality, which
 * the dashboard has to surface rather than guess at.
 */
export function needsModalityConfirmation(
  session: ClassSession,
  now: Date,
  timeZone: TimeZone,
  withinHours = 48,
): boolean {
  if (session.modality !== 'unconfirmed') return false;
  if (session.status === 'cancelled') return false;

  const [startsAt] = sessionInstants(session, timeZone);
  const hoursAway = (startsAt.getTime() - now.getTime()) / 3_600_000;
  return hoursAway >= 0 && hoursAway <= withinHours;
}
