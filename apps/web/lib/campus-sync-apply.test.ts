import { describe, expect, it } from 'vitest';
import { parseCampusDueAt, parseCampusSize } from './campus-sync-apply';

describe('campus sync apply helpers', () => {
  it('splits a campus deadline into Pulse date and time', () => {
    expect(parseCampusDueAt('2026-10-12T23:45:00')).toEqual({
      dueDate: '2026-10-12',
      dueTime: '23:45',
    });
  });

  it('keeps date-only deadlines without inventing a time', () => {
    expect(parseCampusDueAt('2026-10-12')).toEqual({
      dueDate: '2026-10-12',
      dueTime: null,
    });
  });

  it('converts campus file sizes to bytes', () => {
    expect(parseCampusSize('5.8MB')).toBe(5_800_000);
    expect(parseCampusSize('12KiB')).toBe(12_288);
  });
});
