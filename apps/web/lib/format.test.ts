import { describe, expect, it } from 'vitest';
import { daysBetweenDates, relativeDueLabel } from './format';

describe('relative due labels', () => {
  const today = '2026-10-23';

  it('dates an overdue task instead of only calling it late', () => {
    expect(relativeDueLabel({ dueDate: '2026-10-20', dueTime: null }, today, true)).toMatch(
      /^Atrasada desde /,
    );
  });

  it('shows the deadline time for today and tomorrow', () => {
    expect(relativeDueLabel({ dueDate: today, dueTime: '23:45' }, today, false)).toBe(
      'Hoy · 23:45',
    );
    expect(relativeDueLabel({ dueDate: '2026-10-24', dueTime: null }, today, false)).toBe('Mañana');
  });

  it('counts days further out', () => {
    expect(relativeDueLabel({ dueDate: '2026-10-26', dueTime: '08:00' }, today, false)).toBe(
      'En 3 días',
    );
  });

  it('counts calendar days across a month boundary', () => {
    expect(daysBetweenDates('2026-10-30', '2026-11-02')).toBe(3);
  });
});
