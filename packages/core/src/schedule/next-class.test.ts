import { describe, expect, it } from 'vitest';
import type { Subject, SubjectId } from '@pulse/types';
import { makeSession, makeSubject } from '../testing/factories';
import { findNextClass, needsModalityConfirmation, sessionsOnDate } from './next-class';

const TZ = 'America/Tegucigalpa';
const subjects = (subject: Subject): ReadonlyMap<SubjectId, Subject> =>
  new Map([[subject.id, subject]]);

describe('findNextClass', () => {
  it('returns the earliest session that has not finished', () => {
    const now = new Date('2026-03-02T13:00:00.000Z'); // 07:00 local
    const next = findNextClass(
      [
        makeSession({
          id: 'later' as never,
          date: '2026-03-02',
          startTime: '14:00',
          endTime: '15:00',
        }),
        makeSession({
          id: 'sooner' as never,
          date: '2026-03-02',
          startTime: '08:00',
          endTime: '09:30',
        }),
      ],
      subjects(makeSubject()),
      now,
      TZ,
    );

    expect(next?.session.id).toBe('sooner');
    expect(next?.minutesUntilStart).toBe(60);
    expect(next?.inProgress).toBe(false);
  });

  it('keeps a class that is currently running', () => {
    const now = new Date('2026-03-02T14:30:00.000Z'); // 08:30 local, mid-class
    const next = findNextClass([makeSession()], subjects(makeSubject()), now, TZ);

    expect(next?.inProgress).toBe(true);
    expect(next?.minutesUntilStart).toBe(-30);
  });

  it('skips a session that already ended', () => {
    const now = new Date('2026-03-02T16:00:00.000Z'); // 10:00 local, after class
    expect(findNextClass([makeSession()], subjects(makeSubject()), now, TZ)).toBeNull();
  });

  it('ignores cancelled sessions', () => {
    const now = new Date('2026-03-02T13:00:00.000Z');
    const next = findNextClass(
      [
        makeSession({ id: 'cancelled' as never, status: 'cancelled', startTime: '08:00' }),
        makeSession({ id: 'live' as never, startTime: '11:00', endTime: '12:00' }),
      ],
      subjects(makeSubject()),
      now,
      TZ,
    );

    expect(next?.session.id).toBe('live');
  });

  it('offsets departure by the travel buffer for in-person classes', () => {
    const now = new Date('2026-03-02T13:00:00.000Z');
    const next = findNextClass(
      [makeSession({ modality: 'in_person' })],
      subjects(makeSubject({ travelBufferMinutes: 25 })),
      now,
      TZ,
    );

    expect(next?.startsAt).toBe('2026-03-02T14:00:00.000Z');
    expect(next?.departAt).toBe('2026-03-02T13:35:00.000Z');
  });

  it('gives a virtual class no departure time even when a buffer is set', () => {
    const now = new Date('2026-03-02T13:00:00.000Z');
    const next = findNextClass(
      [makeSession({ modality: 'virtual' })],
      subjects(makeSubject({ travelBufferMinutes: 25 })),
      now,
      TZ,
    );

    expect(next?.departAt).toBeNull();
  });
});

describe('sessionsOnDate', () => {
  it('filters to the date and orders by start time', () => {
    const result = sessionsOnDate(
      [
        makeSession({ id: 'b' as never, date: '2026-03-02', startTime: '14:00' }),
        makeSession({ id: 'a' as never, date: '2026-03-02', startTime: '08:00' }),
        makeSession({ id: 'other' as never, date: '2026-03-03', startTime: '09:00' }),
      ],
      '2026-03-02',
    );

    expect(result.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('needsModalityConfirmation', () => {
  it('flags an unconfirmed session inside the window', () => {
    const now = new Date('2026-03-01T14:00:00.000Z');
    const session = makeSession({ date: '2026-03-02', modality: 'unconfirmed' });
    expect(needsModalityConfirmation(session, now, TZ)).toBe(true);
  });

  it('stays quiet while the session is still far away', () => {
    const now = new Date('2026-02-20T14:00:00.000Z');
    const session = makeSession({ date: '2026-03-02', modality: 'unconfirmed' });
    expect(needsModalityConfirmation(session, now, TZ)).toBe(false);
  });

  it('ignores sessions with a confirmed modality', () => {
    const now = new Date('2026-03-01T14:00:00.000Z');
    const session = makeSession({ date: '2026-03-02', modality: 'virtual' });
    expect(needsModalityConfirmation(session, now, TZ)).toBe(false);
  });
});
