import { describe, expect, it } from 'vitest';
import { makeSchedule } from '../testing/factories.js';
import { expandSchedule, expandSchedules } from './recurrence.js';

const PERIOD = { start: '2026-03-01', end: '2026-06-30' };
const TZ = 'America/Tegucigalpa';

describe('expandSchedule', () => {
  it('produces one occurrence per week on the scheduled weekday', () => {
    const sessions = expandSchedule(
      makeSchedule({ weekday: 1 }),
      PERIOD,
      { start: '2026-03-01', end: '2026-03-31' },
      TZ,
    );

    expect(sessions.map((s) => s.date)).toEqual([
      '2026-03-02',
      '2026-03-09',
      '2026-03-16',
      '2026-03-23',
      '2026-03-30',
    ]);
  });

  it('resolves start and end instants in the period timezone', () => {
    const [first] = expandSchedule(
      makeSchedule({ startTime: '08:00', endTime: '09:30' }),
      PERIOD,
      { start: '2026-03-01', end: '2026-03-03' },
      TZ,
    );

    expect(first?.startsAt).toBe('2026-03-02T14:00:00.000Z');
    expect(first?.endsAt).toBe('2026-03-02T15:30:00.000Z');
  });

  it('clips to the schedule active range when it is narrower than the period', () => {
    const sessions = expandSchedule(
      makeSchedule({ activeRange: { start: '2026-03-10', end: '2026-03-20' } }),
      PERIOD,
      { start: '2026-03-01', end: '2026-03-31' },
      TZ,
    );

    expect(sessions.map((s) => s.date)).toEqual(['2026-03-16']);
  });

  it('returns nothing when the active range falls outside the period', () => {
    const sessions = expandSchedule(
      makeSchedule({ activeRange: { start: '2026-08-01', end: '2026-08-31' } }),
      PERIOD,
      { start: '2026-03-01', end: '2026-03-31' },
      TZ,
    );

    expect(sessions).toEqual([]);
  });

  it('honours an open-ended period by stopping at the window end', () => {
    const sessions = expandSchedule(
      makeSchedule({ weekday: 3 }),
      { start: '2026-03-01', end: null },
      { start: '2026-03-01', end: '2026-03-18' },
      TZ,
    );

    expect(sessions.map((s) => s.date)).toEqual(['2026-03-04', '2026-03-11', '2026-03-18']);
  });

  it('includes an occurrence landing exactly on the window end', () => {
    const sessions = expandSchedule(
      makeSchedule({ weekday: 1 }),
      PERIOD,
      { start: '2026-03-01', end: '2026-03-09' },
      TZ,
    );

    expect(sessions.map((s) => s.date)).toEqual(['2026-03-02', '2026-03-09']);
  });
});

describe('expandSchedules', () => {
  it('merges slots in chronological order', () => {
    const monday = makeSchedule({
      id: 'a' as never,
      weekday: 1,
      startTime: '10:00',
      endTime: '11:00',
    });
    const wednesday = makeSchedule({
      id: 'b' as never,
      weekday: 3,
      startTime: '08:00',
      endTime: '09:00',
    });

    const sessions = expandSchedules(
      [wednesday, monday],
      PERIOD,
      { start: '2026-03-01', end: '2026-03-07' },
      TZ,
    );

    expect(sessions.map((s) => `${s.date} ${s.startTime}`)).toEqual([
      '2026-03-02 10:00',
      '2026-03-04 08:00',
    ]);
  });
});
