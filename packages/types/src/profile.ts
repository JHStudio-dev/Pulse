import type { UserId } from './ids.js';
import type { Instant, TimeZone } from './primitives.js';
import type { QuietHours } from './reminders.js';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface Profile {
  userId: UserId;
  displayName: string | null;
  timeZone: TimeZone;
  locale: string;
  theme: ThemePreference;
  quietHours: QuietHours;
  createdAt: Instant;
  updatedAt: Instant;
}
