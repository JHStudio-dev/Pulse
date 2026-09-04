/**
 * Draft campus contract for the feasibility spike.
 *
 * This is deliberately separate from the production packages. Nothing here is
 * imported by the app: the spike exists to find out what each platform can
 * actually give us, and the real CampusConnector is only worth designing once
 * those answers exist.
 */

/** Integration mechanisms, in the priority order the repository rules set. */
export type Mechanism =
  | 'official_api'
  | 'lms_connector'
  | 'session_extension'
  | 'html_parsing'
  | 'browser_agent';

export const MECHANISM_PRIORITY: readonly Mechanism[] = [
  'official_api',
  'lms_connector',
  'session_extension',
  'html_parsing',
  'browser_agent',
];

/** The data the spike has to prove Pulse can obtain. */
export type Capability =
  | 'courses'
  | 'assignments'
  | 'due_dates'
  | 'materials'
  | 'file_download'
  | 'announcements';

export const REQUIRED_CAPABILITIES: readonly Capability[] = [
  'courses',
  'assignments',
  'due_dates',
  'materials',
  'file_download',
  'announcements',
];

/**
 * Outcome of probing one capability.
 *
 * `empty` and `unsupported` are kept apart on purpose: a course with no
 * announcements is not the same finding as a platform that cannot expose them.
 */
export type ProbeStatus = 'ok' | 'empty' | 'unauthorized' | 'unsupported' | 'error';

export interface ProbeResult {
  capability: Capability;
  status: ProbeStatus;
  mechanism: Mechanism;
  /** How many records came back, when the call succeeded. */
  count?: number;
  /** Short note, e.g. the endpoint used or the reason it failed. */
  detail?: string;
  /** One redacted sample, kept small, to show the shape that came back. */
  sample?: unknown;
}

// Normalized shapes ----------------------------------------------------------
//
// Every platform is mapped onto these so nothing downstream ever sees a Moodle
// or Chamilo field name.

export interface CampusCourse {
  externalId: string;
  name: string;
  code: string | null;
  url: string | null;
}

export interface CampusAssignment {
  externalId: string;
  courseExternalId: string;
  title: string;
  description: string | null;
  /** ISO date, or null when the platform exposes none. */
  dueDate: string | null;
  url: string | null;
}

export interface CampusMaterial {
  externalId: string;
  courseExternalId: string;
  title: string;
  /** Direct file URL when downloadable, otherwise a page link. */
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  downloadable: boolean;
}

export interface CampusAnnouncement {
  externalId: string;
  courseExternalId: string;
  title: string;
  body: string | null;
  publishedAt: string | null;
}

/**
 * What a real connector will have to implement.
 *
 * Written down now only so the probes can be checked against a single shape;
 * the production interface may differ once the spike reports back.
 */
export interface CampusProbe {
  readonly platform: string;
  readonly mechanism: Mechanism;
  getCourses(): Promise<CampusCourse[]>;
  getAssignments(courseId: string): Promise<CampusAssignment[]>;
  getMaterials(courseId: string): Promise<CampusMaterial[]>;
  getAnnouncements(courseId: string): Promise<CampusAnnouncement[]>;
  /** Confirms a file is reachable without writing it to disk. */
  checkFileAccess(url: string): Promise<{ ok: boolean; status: number; contentType: string | null }>;
}

/** Campus responses are untrusted input; nothing is used before it is checked. */
export function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  );
}

export function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number') return String(value);
  return null;
}

export function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Moodle timestamps are seconds since the epoch; 0 means "not set". */
export function epochSecondsToIsoDate(value: number | null): string | null {
  if (value === null || value <= 0) return null;
  return new Date(value * 1000).toISOString().slice(0, 10);
}
