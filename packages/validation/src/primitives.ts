import { z } from 'zod';

/**
 * Shared field schemas.
 *
 * These validate input arriving from users and campus connectors. Rows already
 * read back from our own database are trusted and not re-parsed.
 */

export const isoDateSchema = z.iso.date();

/** `HH:mm`, rejecting the seconds form so stored times stay comparable as text. */
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

export const instantSchema = z.iso.datetime({ offset: true });

export const timeZoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Unknown timezone');

export const weekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

export const uuidSchema = z.uuid();

export const httpUrlSchema = z.url({ protocol: /^https?$/ });

/** Trimmed, non-empty, length-capped text. */
export const shortText = (max = 200) => z.string().trim().min(1).max(max);

export const optionalShortText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();

export const longText = (max = 20_000) => z.string().trim().max(max);

/** End must be strictly after start on the same day. */
export const timeRangeSchema = z
  .object({ start: timeOfDaySchema, end: timeOfDaySchema })
  .refine((range) => range.start < range.end, {
    message: 'End time must be after start time',
    path: ['end'],
  });

export const dateRangeSchema = z
  .object({ start: isoDateSchema, end: isoDateSchema.nullable() })
  .refine((range) => range.end === null || range.start <= range.end, {
    message: 'End date must not precede start date',
    path: ['end'],
  });
