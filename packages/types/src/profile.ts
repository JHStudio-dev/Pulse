import type { UserId } from './ids';
import type { Instant, TimeZone } from './primitives';
import type { QuietHours } from './reminders';

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
