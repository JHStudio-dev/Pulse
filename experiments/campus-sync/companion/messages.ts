import type { CampusSection, CampusSnapshot, CourseTarget } from '../src/companion-state.ts';

export type CompanionRequest =
  | { type: 'pulse:inspect' }
  | { type: 'pulse:sync-course' }
  | { type: 'pulse:sync-all-courses' }
  | { type: 'pulse:sync-courses'; courses: CourseTarget[] };

export type SyncCourseResponse =
  | { ok: true; snapshot: CampusSnapshot; unread: CampusSection[] }
  | { ok: false; error: string };

/** Batch runs report progress through storage, so the popup may close meanwhile. */
export type StartSyncResponse = { ok: true } | { ok: false; error: string };

export function isCompanionRequest(value: unknown): value is CompanionRequest {
  if (!value || typeof value !== 'object') return false;

  const message = value as { type?: unknown; courses?: unknown };

  switch (message.type) {
    case 'pulse:inspect':
    case 'pulse:sync-course':
    case 'pulse:sync-all-courses':
      return true;
    case 'pulse:sync-courses':
      return Array.isArray(message.courses);
    default:
      return false;
  }
}
