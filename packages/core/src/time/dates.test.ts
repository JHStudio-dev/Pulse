import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  isDateWithin,
  isIsoDate,
  nextDateOnWeekday,
  weekdayOf,
} from './dates';

describe('isIsoDate', () => {
  it('rejects dates that do not exist', () => {
    expect(isIsoDate('2026-03-04')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('04-03-2026')).toBe(false);
  });

  it('accepts a leap day only in a leap year', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween('2026-03-01', '2026-03-08')).toBe(7);
    expect(daysBetween('2026-03-08', '2026-03-01')).toBe(-7);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });
});

describe('weekdayOf', () => {
  it('returns 1 for Monday and 7 for Sunday', () => {
    expect(weekdayOf('2026-03-02')).toBe(1);
    expect(weekdayOf('2026-03-08')).toBe(7);
  });
});

describe('nextDateOnWeekday', () => {
  it('returns the same date when it already matches', () => {
    expect(nextDateOnWeekday('2026-03-02', 1)).toBe('2026-03-02');
  });

  it('advances to the coming weekday', () => {
    expect(nextDateOnWeekday('2026-03-02', 3)).toBe('2026-03-04');
    expect(nextDateOnWeekday('2026-03-05', 1)).toBe('2026-03-09');
  });
});

describe('isDateWithin', () => {
  it('includes both ends and treats a null end as open', () => {
    expect(isDateWithin('2026-03-04', '2026-03-01', '2026-03-31')).toBe(true);
    expect(isDateWithin('2026-03-01', '2026-03-01', '2026-03-31')).toBe(true);
    expect(isDateWithin('2026-03-31', '2026-03-01', '2026-03-31')).toBe(true);
    expect(isDateWithin('2026-04-01', '2026-03-01', '2026-03-31')).toBe(false);
    expect(isDateWithin('2030-01-01', '2026-03-01', null)).toBe(true);
  });
});
