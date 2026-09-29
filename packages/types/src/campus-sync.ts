import type {
  CampusConnectionId,
  CampusSubjectLinkId,
  CampusSyncItemId,
  CampusSyncRunId,
  DocumentId,
  SubjectId,
  TaskId,
  UserId,
} from './ids';
import type { Instant } from './primitives';

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
  appliedAt: Instant | null;
  appliedTaskId: TaskId | null;
  appliedDocumentId: DocumentId | null;
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

export interface CampusSyncCourseSnapshot {
  externalId: string;
  sessionId?: string;
  title?: string;
  code?: string;
  section?: string;
  teacher?: string;
  sourceUrl?: string;
}

export interface CampusSyncDocumentSnapshot {
  externalId: string;
  courseExternalId: string;
  name: string;
  kind: 'file' | 'folder';
  path?: string;
  size?: string;
  updatedAt?: string;
  sourceUrl: string;
}

export interface CampusSyncAssignmentSnapshot {
  externalId: string;
  courseExternalId: string;
  title: string;
  description?: string;
  dueAt?: string;
  sourceUrl: string;
  submissionUrl?: string;
  hasSubmission?: boolean;
}

export interface CampusSyncAnnouncementSnapshot {
  externalId: string;
  courseExternalId: string;
  title: string;
  author?: string;
  content?: string;
  updatedAt?: string;
  sourceUrl: string;
}

export interface CampusSyncEventSnapshot {
  externalId?: string;
  courseExternalId: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  sourceType: CampusSyncEventSource;
  sourceExternalId?: string;
  sourceUrl?: string;
}

export interface CampusSyncSnapshot {
  course: CampusSyncCourseSnapshot;
  documents: CampusSyncDocumentSnapshot[];
  assignments: CampusSyncAssignmentSnapshot[];
  announcements: CampusSyncAnnouncementSnapshot[];
  events: CampusSyncEventSnapshot[];
}
