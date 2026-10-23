import type {
  AcademicPeriodId,
  CampusConnectionId,
  CampusSubjectLinkId,
  CampusSyncItemId,
  CampusSyncRunId,
  DocumentId,
  SubjectId,
  TaskId,
  UserId,
} from './ids';
import type { Modality } from './academic';
import type { Instant, TimeOfDay, Weekday } from './primitives';

export type CampusSyncItemKind = 'document' | 'assignment' | 'announcement' | 'event';

export type CampusSyncRunStatus = 'running' | 'completed' | 'failed';

export type CampusSyncDiffState = 'new' | 'changed' | 'unchanged';

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface CampusSubjectLink {
  id: CampusSubjectLinkId;
  userId: UserId;
  campusConnectionId: CampusConnectionId;
  /** The subject's period; the same course in another period gets its own link. */
  academicPeriodId: AcademicPeriodId;
  subjectId: SubjectId;
  externalCourseId: string;
  externalSessionId: string | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface CampusSyncSummary {
  discoveredCount: number;
  newCount: number;
  changedCount: number;
  unchangedCount: number;
  ignoredCount: number;
}

export interface CampusSyncRun extends CampusSyncSummary {
  id: CampusSyncRunId;
  userId: UserId;
  subjectLinkId: CampusSubjectLinkId;
  status: CampusSyncRunStatus;
  startedAt: Instant;
  completedAt: Instant | null;
  errorMessage: string | null;
}

export interface CampusSyncItem {
  id: CampusSyncItemId;
  userId: UserId;
  subjectLinkId: CampusSubjectLinkId;
  lastSyncRunId: CampusSyncRunId;
  kind: CampusSyncItemKind;
  externalId: string;
  sourceUrl: string | null;
  contentHash: string;
  payload: JsonObject;
  firstSeenAt: Instant;
  lastSeenAt: Instant;
  lastChangeKind: Exclude<CampusSyncDiffState, 'unchanged'> | null;
  lastChangedAt: Instant | null;
  appliedAt: Instant | null;
  appliedTaskId: TaskId | null;
  appliedDocumentId: DocumentId | null;
  /** Set when the student deleted the task this assignment created. */
  dismissedAt: Instant | null;
}

export interface CampusSyncItemInput {
  kind: CampusSyncItemKind;
  externalId: string;
  sourceUrl: string | null;
  contentHash: string;
  payload: JsonObject;
}

export type CampusSyncItemDraft = Omit<CampusSyncItemInput, 'contentHash'>;

export type CampusSyncEventSource = 'agenda' | 'assignment';

// Snapshots arrive through validation, so optional fields may be explicitly undefined.
export interface CampusSyncCourseSnapshot {
  externalId: string;
  sessionId?: string | undefined;
  title?: string | undefined;
  code?: string | undefined;
  section?: string | undefined;
  teacher?: string | undefined;
  sourceUrl?: string | undefined;
  scheduleHints?: string[] | undefined;
  meetingUrls?: string[] | undefined;
}

export interface CampusSyncDocumentSnapshot {
  externalId: string;
  courseExternalId: string;
  name: string;
  kind: 'file' | 'folder';
  path?: string | undefined;
  size?: string | undefined;
  updatedAt?: string | undefined;
  sourceUrl: string;
}

export interface CampusSyncAssignmentSnapshot {
  externalId: string;
  courseExternalId: string;
  title: string;
  description?: string | undefined;
  dueAt?: string | undefined;
  sourceUrl: string;
  submissionUrl?: string | undefined;
  hasSubmission?: boolean | undefined;
}

export interface CampusSyncAnnouncementSnapshot {
  externalId: string;
  courseExternalId: string;
  title: string;
  author?: string | undefined;
  content?: string | undefined;
  updatedAt?: string | undefined;
  sourceUrl: string;
}

export interface CampusSyncEventSnapshot {
  externalId?: string | undefined;
  courseExternalId: string;
  title: string;
  description?: string | undefined;
  startsAt: string;
  endsAt?: string | undefined;
  allDay: boolean;
  sourceType: CampusSyncEventSource;
  sourceExternalId?: string | undefined;
  sourceUrl?: string | undefined;
}

export interface CampusSyncSnapshot {
  course: CampusSyncCourseSnapshot;
  documents: CampusSyncDocumentSnapshot[];
  assignments: CampusSyncAssignmentSnapshot[];
  announcements: CampusSyncAnnouncementSnapshot[];
  events: CampusSyncEventSnapshot[];
}

export type CampusScheduleConfidence = 'high' | 'medium';

export interface CampusScheduleSuggestion {
  weekdays: Weekday[];
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  modality: Modality;
  meetingUrl: string | null;
  confidence: CampusScheduleConfidence;
  evidence: string;
  source: 'campus_text' | 'agenda';
}
