import type { CampusConnectionId, CampusInstanceId, UniversityId, UserId } from './ids.js';
import type { Instant } from './primitives.js';

/**
 * Institution layer.
 *
 * UJCV and UNAH are data, not code paths. Anything that differs between
 * institutions belongs in configuration or a connector, never in a branch on
 * university name.
 */

/** Campus platform a connector can target. */
export type CampusPlatform = 'chamilo' | 'moodle' | 'manual';

export interface University {
  id: UniversityId;
  name: string;
  abbreviation: string;
  countryCode: string;
  createdAt: Instant;
}

export interface CampusInstance {
  id: CampusInstanceId;
  universityId: UniversityId;
  name: string;
  platform: CampusPlatform;
  baseUrl: string;
  /** Per-instance connector settings. Shape depends on the platform. */
  settings: Record<string, unknown>;
  createdAt: Instant;
}

export type CampusConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'needs_reauth'
  | 'error';

export interface CampusConnection {
  id: CampusConnectionId;
  userId: UserId;
  campusInstanceId: CampusInstanceId;
  status: CampusConnectionStatus;
  lastSyncedAt: Instant | null;
  lastError: string | null;
  createdAt: Instant;
  updatedAt: Instant;
}
