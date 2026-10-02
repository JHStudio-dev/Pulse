import { describe, expect, it } from 'vitest';
import type { CampusSyncItem, Subject } from '@pulse/types';
import {
  buildCampusAnnouncements,
  buildCampusChanges,
  buildCampusEvents,
  campusEventDate,
  campusEventTime,
} from './campus-activity';

const subject = {
  id: 'subject-1',
  name: 'Administración I',
} as Subject;

function item(overrides: Partial<CampusSyncItem>): CampusSyncItem {
  return {
    id: 'item-1',
    userId: 'user-1',
    subjectLinkId: 'link-1',
    lastSyncRunId: 'run-1',
    kind: 'announcement',
    externalId: 'external-1',
    sourceUrl: 'https://campus.example/item',
    contentHash: 'hash',
    payload: {},
    firstSeenAt: '2026-09-30T12:00:00.000Z',
    lastSeenAt: '2026-09-30T12:00:00.000Z',
    lastChangeKind: null,
    lastChangedAt: null,
    appliedAt: null,
    appliedTaskId: null,
    appliedDocumentId: null,
    ...overrides,
  } as CampusSyncItem;
}

describe('campus activity', () => {
  it('builds a recent change entry when an item changed', () => {
    const [entry] = buildCampusChanges([
      item({
        kind: 'assignment',
        payload: { title: 'Ensayo final' },
        lastChangeKind: 'changed',
        lastChangedAt: '2026-10-01T18:00:00.000Z',
      }),
    ], subject);

    expect(entry?.change).toBe('changed');
    expect(entry?.title).toBe('Ensayo final');
    expect(entry?.subjectName).toBe('Administración I');
  });

  it('does not invent a change for legacy items without change metadata', () => {
    expect(buildCampusChanges([item({})], subject)).toEqual([]);
  });

  it('builds safe announcement text from campus html', () => {
    const [entry] = buildCampusAnnouncements([
      item({
        payload: {
          title: 'Bienvenida',
          author: 'Docente',
          content: '<p>Hola <strong>clase</strong> &amp; bienvenidos.</p>',
          updatedAt: '2026-10-01T09:00:00.000Z',
        },
      }),
    ], subject);

    expect(entry?.title).toBe('Bienvenida');
    expect(entry?.content).toBe('Hola clase & bienvenidos.');
    expect(entry?.subjectName).toBe('Administración I');
  });

  it('ignores events without a start date', () => {
    expect(buildCampusEvents([
      item({ kind: 'event', payload: { title: 'Sin fecha' } }),
    ], subject)).toEqual([]);
  });

  it('keeps event timing and all-day state', () => {
    const [entry] = buildCampusEvents([
      item({
        kind: 'event',
        payload: {
          title: 'Evaluación',
          startsAt: '2026-10-12T23:45:00',
          allDay: false,
          sourceType: 'agenda',
        },
      }),
    ], subject);

    expect(entry?.startsAt).toBe('2026-10-12T23:45:00');
    expect(entry?.allDay).toBe(false);
    expect(entry?.sourceType).toBe('agenda');
  });

  it('reads local campus date and time without shifting timezones', () => {
    const [event] = buildCampusEvents([
      item({
        kind: 'event',
        payload: {
          title: 'Evaluación',
          startsAt: '2026-10-12T23:45:00',
          allDay: false,
          sourceType: 'agenda',
        },
      }),
    ], subject);

    expect(event && campusEventDate(event)).toBe('2026-10-12');
    expect(event && campusEventTime(event)).toBe('23:45');
  });
});
