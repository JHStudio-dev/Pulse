import { describe, expect, it } from 'vitest';
import type { CampusSyncItem, CampusSyncItemId, CampusSyncRunId, Subject } from '@pulse/types';
import {
  buildCampusAnnouncements,
  buildCampusChanges,
  buildCampusEvents,
  campusEventDate,
  campusEventTime,
  withoutStaleAgendaEvents,
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
    dismissedAt: null,
    removedAt: null,
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

describe('campus removals in activity', () => {
  it('reports an item the campus stopped listing as removed', () => {
    const [entry] = buildCampusChanges(
      [
        item({
          kind: 'assignment',
          payload: { title: 'Ensayo final' },
          lastChangeKind: 'changed',
          lastChangedAt: '2026-10-01T18:00:00.000Z',
          removedAt: '2026-10-05T09:00:00.000Z',
        }),
      ],
      subject,
    );

    expect(entry).toMatchObject({ change: 'removed', changedAt: '2026-10-05T09:00:00.000Z' });
  });

  it('keeps a removed announcement visible and says so', () => {
    const [entry] = buildCampusAnnouncements(
      [item({ payload: { title: 'Cambio de aula' }, removedAt: '2026-10-05T09:00:00.000Z' })],
      subject,
    );

    expect(entry).toMatchObject({ title: 'Cambio de aula', removed: true });
  });
});

describe('stale agenda events', () => {
  function agenda(id: string, run: string, startsAt: string, seenAt: string): CampusSyncItem {
    return item({
      id: id as CampusSyncItemId,
      kind: 'event',
      lastSyncRunId: run as CampusSyncRunId,
      lastSeenAt: seenAt,
      payload: { title: 'Examen parcial', startsAt, allDay: false, sourceType: 'agenda' },
    });
  }

  const TODAY = '2026-10-10';

  it('hides an upcoming event the latest agenda read no longer lists', () => {
    const moved = [
      agenda('old', 'run-1', '2026-10-20T08:00:00', '2026-10-01T12:00:00.000Z'),
      agenda('new', 'run-2', '2026-10-22T08:00:00', '2026-10-08T12:00:00.000Z'),
    ];

    expect(withoutStaleAgendaEvents(moved, TODAY).map((entry) => entry.id)).toEqual(['new']);
  });

  it('keeps past events as history', () => {
    const items = [
      agenda('past', 'run-1', '2026-09-20T08:00:00', '2026-09-15T12:00:00.000Z'),
      agenda('current', 'run-2', '2026-10-22T08:00:00', '2026-10-08T12:00:00.000Z'),
    ];

    expect(withoutStaleAgendaEvents(items, TODAY).map((entry) => entry.id)).toEqual([
      'past',
      'current',
    ]);
  });

  it('keeps everything when the latest sync did not read the agenda', () => {
    const items = [
      agenda('a', 'run-1', '2026-10-20T08:00:00', '2026-10-01T12:00:00.000Z'),
      item({
        id: 'doc' as CampusSyncItemId,
        kind: 'document',
        lastSyncRunId: 'run-2' as CampusSyncRunId,
        lastSeenAt: '2026-10-08T12:00:00.000Z',
      }),
    ];

    expect(withoutStaleAgendaEvents(items, TODAY).map((entry) => entry.id)).toEqual(['a', 'doc']);
  });

  it('leaves assignment deadlines and other items alone', () => {
    const items = [
      agenda('new', 'run-2', '2026-10-22T08:00:00', '2026-10-08T12:00:00.000Z'),
      item({
        id: 'deadline' as CampusSyncItemId,
        kind: 'event',
        lastSyncRunId: 'run-1' as CampusSyncRunId,
        payload: { title: 'Entrega', startsAt: '2026-10-25T23:59:00', sourceType: 'assignment' },
      }),
    ];

    expect(withoutStaleAgendaEvents(items, TODAY).map((entry) => entry.id)).toEqual([
      'new',
      'deadline',
    ]);
  });
});
