import { describe, expect, it } from 'vitest';
import {
  instantToZonedDate,
  instantToZonedTime,
  isValidTimeZone,
  zonedTimeToInstant,
} from './zone';

const TEGUCIGALPA = 'America/Tegucigalpa';
const NEW_YORK = 'America/New_York';

describe('zonedTimeToInstant', () => {
  it('applies a fixed offset for a zone without DST', () => {
    // Honduras stays at UTC-6 all year.
    expect(zonedTimeToInstant('2026-03-04', '08:00', TEGUCIGALPA)).toBe('2026-03-04T14:00:00.000Z');
    expect(zonedTimeToInstant('2026-08-04', '08:00', TEGUCIGALPA)).toBe('2026-08-04T14:00:00.000Z');
  });

  it('uses the correct offset on each side of a DST change', () => {
    // New York moves to DST on 2026-03-08.
    expect(zonedTimeToInstant('2026-03-07', '08:00', NEW_YORK)).toBe('2026-03-07T13:00:00.000Z');
    expect(zonedTimeToInstant('2026-03-09', '08:00', NEW_YORK)).toBe('2026-03-09T12:00:00.000Z');
  });

  it('resolves a wall-clock time skipped by the spring-forward gap', () => {
    // 02:30 never occurs on 2026-03-08; it must not silently land a day away.
    const instant = zonedTimeToInstant('2026-03-08', '02:30', NEW_YORK);
    expect(instantToZonedDate(instant, NEW_YORK)).toBe('2026-03-08');
  });

  it('round-trips a normal time through the same zone', () => {
    const instant = zonedTimeToInstant('2026-09-15', '17:45', TEGUCIGALPA);
    expect(instantToZonedDate(instant, TEGUCIGALPA)).toBe('2026-09-15');
    expect(instantToZonedTime(instant, TEGUCIGALPA)).toBe('17:45');
  });

  it('keeps a late-evening class on its own local date', () => {
    // 20:00 in Tegucigalpa is 02:00 UTC the next day.
    const instant = zonedTimeToInstant('2026-09-15', '20:00', TEGUCIGALPA);
    expect(instant).toBe('2026-09-16T02:00:00.000Z');
    expect(instantToZonedDate(instant, TEGUCIGALPA)).toBe('2026-09-15');
  });
});

describe('isValidTimeZone', () => {
  it('accepts real zones and rejects invented ones', () => {
    expect(isValidTimeZone(TEGUCIGALPA)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
