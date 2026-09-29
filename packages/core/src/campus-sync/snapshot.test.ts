import { describe, expect, it } from 'vitest';
import { classifyCampusSyncItem } from './diff';
import { prepareCampusSyncSnapshot } from './snapshot';

const snapshot = {
  course: { externalId: 'ADM2011C1', sessionId: '0' },
  documents: [],
  assignments: [
    {
      externalId: '2074726',
      courseExternalId: 'ADM2011C1',
      title: 'Estudio de Caso 01',
      dueAt: '2026-10-12T23:45:00',
      sourceUrl: 'https://campus.example.test/work/2074726',
      hasSubmission: false,
    },
  ],
  announcements: [],
  events: [
    {
      courseExternalId: 'ADM2011C1',
      title: 'Entrega de tarea Estudio de Caso 01',
      startsAt: '2026-10-12T23:45:00',
      allDay: false,
      sourceType: 'assignment' as const,
      sourceExternalId: '2074726',
    },
  ],
};

describe('prepareCampusSyncSnapshot', () => {
  it('keeps campus identifiers stable across item kinds', () => {
    const items = prepareCampusSyncSnapshot(snapshot);

    expect(items).toHaveLength(2);
    expect(items[0]?.kind).toBe('assignment');
    expect(items[0]?.externalId).toBe('2074726');
    expect(items[1]?.externalId).toBe('assignment:2074726');
  });

  it('detects a changed assignment without changing its identity', () => {
    const before = prepareCampusSyncSnapshot(snapshot)[0];
    const after = prepareCampusSyncSnapshot({
      ...snapshot,
      assignments: [{ ...snapshot.assignments[0]!, dueAt: '2026-10-13T23:45:00' }],
    })[0];

    expect(before?.externalId).toBe(after?.externalId);
    expect(classifyCampusSyncItem({ contentHash: before!.contentHash }, after!)).toBe('changed');
  });
});
