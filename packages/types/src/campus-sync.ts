import type {
  CampusConnectionId,
  CampusSubjectLinkId,
  CampusSyncItemId,
  CampusSyncRunId,
  SubjectId,
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
}

export interface CampusSyncItemInput {
  kind: CampusSyncItemKind;
  externalId: string;
  sourceUrl: string | null;
  contentHash: string;
  payload: JsonObject;
}
