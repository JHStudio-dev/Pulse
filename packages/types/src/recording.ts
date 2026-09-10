import type {
  AssessmentId,
  ClassSessionId,
  ClassSummaryId,
  ExtractedItemId,
  ModelUsageId,
  RecordingId,
  TaskId,
  TranscriptId,
  TranscriptSegmentId,
  UserId,
} from './ids';
import type { Instant, IsoDate } from './primitives';

/** Longest recording Pulse accepts, in seconds. Two hours. */
export const MAX_RECORDING_SECONDS = 7200;

/**
 * Where a recording is in the pipeline.
 *
 * `uploaded` means the file is stored and nothing has been asked of it yet.
 * Everything after `queued` happens outside the request that uploaded it.
 */
export type RecordingStatus =
  'uploaded' | 'queued' | 'transcribing' | 'analyzing' | 'ready' | 'failed';

/**
 * How a recording was produced.
 *
 * The three are not interchangeable downstream. `virtual_meeting` is a browser
 * surface the student picked and arrives as video; `in_person_audio` is
 * microphone audio with no video; `upload` is a file Pulse did not produce and
 * whose contents it cannot assume.
 */
export type RecordingCapture = 'virtual_meeting' | 'in_person_audio' | 'upload';

/**
 * Why the student may hold this audio.
 *
 * Pulse processes only recordings a student is allowed to record or use, so the
 * answer is stored per recording rather than assumed once per account.
 */
export type RecordingPermission = 'own_permission' | 'official_material';

export interface Recording {
  id: RecordingId;
  userId: UserId;
  classSessionId: ClassSessionId;
  captureMode: RecordingCapture;
  storagePath: string;
  /** What the capture actually produced, not what was asked for. */
  hasVideo: boolean;
  hasSystemAudio: boolean;
  hasMicrophone: boolean;
  /** Audio pulled out of a video recording. Null until extraction runs. */
  audioStoragePath: string | null;
  audioExtractedAt: Instant | null;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
  /** Reported by the browser, which is the only side that can read it cheaply. */
  durationSeconds: number | null;
  status: RecordingStatus;
  queuedAt: Instant | null;
  processingStartedAt: Instant | null;
  processedAt: Instant | null;
  attempts: number;
  failureReason: string | null;
  permission: RecordingPermission;
  permissionConfirmedAt: Instant;
  retain: boolean;
  deleteAfter: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface Transcript {
  id: TranscriptId;
  userId: UserId;
  recordingId: RecordingId;
  language: string | null;
  fullText: string | null;
  /** Free text, never an enum: the provider must be replaceable without a migration. */
  provider: string | null;
  model: string | null;
  processedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface TranscriptSegment {
  id: TranscriptSegmentId;
  userId: UserId;
  transcriptId: TranscriptId;
  position: number;
  startSeconds: number;
  endSeconds: number;
  speaker: string | null;
  content: string;
  createdAt: Instant;
}

export type ExtractedItemKind =
  'task' | 'date' | 'assessment' | 'resource' | 'important' | 'question';

/** An ambiguous sentence in class is not a deadline until the student says so. */
export type ExtractedItemStatus = 'detected' | 'confirmed' | 'dismissed';

export interface ExtractedItem {
  id: ExtractedItemId;
  userId: UserId;
  classSessionId: ClassSessionId;
  transcriptId: TranscriptId | null;
  transcriptSegmentId: TranscriptSegmentId | null;
  kind: ExtractedItemKind;
  status: ExtractedItemStatus;
  content: string;
  detectedDate: IsoDate | null;
  /** Zero to one, or null when the source does not report one. */
  confidence: number | null;
  /** Another source that says the same thing, such as a campus deadline. */
  corroboratedBy: string | null;
  confirmedTaskId: TaskId | null;
  confirmedAssessmentId: AssessmentId | null;
  reviewedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface ClassSummary {
  id: ClassSummaryId;
  userId: UserId;
  classSessionId: ClassSessionId;
  transcriptId: TranscriptId | null;
  version: number;
  headline: string | null;
  brief: string | null;
  detailed: string | null;
  topics: string[];
  keyConcepts: string[];
  provider: string | null;
  model: string | null;
  createdAt: Instant;
}

/** What `inputUnits` and `outputUnits` count for a given operation. */
export type ModelUsageUnit = 'tokens' | 'seconds';

export interface ModelUsage {
  id: ModelUsageId;
  userId: UserId;
  feature: string;
  provider: string;
  model: string;
  recordingId: RecordingId | null;
  unit: ModelUsageUnit;
  inputUnits: number | null;
  outputUnits: number | null;
  /** Millionths of a currency unit, so money never touches a float. */
  costMicros: number | null;
  succeeded: boolean;
  createdAt: Instant;
}
