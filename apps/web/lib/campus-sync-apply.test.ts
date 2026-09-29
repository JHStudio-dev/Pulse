import { describe, expect, it } from 'vitest';

function parseCampusDueAt(value: string | null): { dueDate: string | null; dueTime: string | null } {
  if (!value) return { dueDate: null, dueTime: null };
  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!match) return { dueDate: null, dueTime: null };
  return { dueDate: match[1] ?? null, dueTime: match[2] ?? null };
}

describe('campus sync apply date parsing', () => {
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
});
