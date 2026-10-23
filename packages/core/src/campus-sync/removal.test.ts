import { describe, expect, it } from 'vitest';
import { confirmedCampusKinds } from './removal';

describe('campus removals', () => {
  it('confirms nothing when the reader did not say what it read', () => {
    expect(confirmedCampusKinds({})).toEqual([]);
    expect(confirmedCampusKinds({ readSections: [] })).toEqual([]);
  });

  it('confirms only the sections read in full', () => {
    expect(confirmedCampusKinds({ readSections: ['assignments', 'documents'] })).toEqual([
      'assignment',
      'document',
    ]);
  });

  it('never confirms agenda removals', () => {
    expect(confirmedCampusKinds({ readSections: ['events', 'announcements'] })).toEqual([
      'announcement',
    ]);
  });
});
