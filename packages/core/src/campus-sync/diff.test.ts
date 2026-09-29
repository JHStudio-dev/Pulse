import { describe, expect, it } from 'vitest';
import type { CampusSyncItem } from '@pulse/types';
import {
  classifyCampusSyncItem,
  fingerprintCampusPayload,
  prepareCampusSyncItem,
} from './diff';

const assignment = {
  kind: 'assignment' as const,
  externalId: '2074726',
  sourceUrl: 'https://campus.example.test/work/2074726',
  payload: {
    title: 'Estudio de Caso 01',
    dueAt: '2026-10-12T23:45:00',
  },
};

describe('campus sync diff', () => {
  it('marks an unseen item as new', () => {
    const incoming = prepareCampusSyncItem(assignment);
    expect(classifyCampusSyncItem(null, incoming)).toBe('new');
  });

  it('marks the same fingerprint as unchanged', () => {
    const incoming = prepareCampusSyncItem(assignment);
    const existing = { contentHash: incoming.contentHash } as CampusSyncItem;

    expect(classifyCampusSyncItem(existing, incoming)).toBe('unchanged');
  });

  it('marks a changed payload as changed', () => {
    const before = prepareCampusSyncItem(assignment);
    const after = prepareCampusSyncItem({
      ...assignment,
      payload: { ...assignment.payload, dueAt: '2026-10-13T23:45:00' },
    });

    expect(classifyCampusSyncItem({ contentHash: before.contentHash } as CampusSyncItem, after)).toBe(
      'changed',
    );
  });

  it('does not depend on object key insertion order', () => {
    const left = fingerprintCampusPayload({
      ...assignment,
      payload: { title: 'Caso', dueAt: '2026-10-12T23:45:00' },
    });
    const right = fingerprintCampusPayload({
      ...assignment,
      payload: { dueAt: '2026-10-12T23:45:00', title: 'Caso' },
    });

    expect(left).toBe(right);
  });
});
