import type { ClassSessionId, DocumentId, InboxItemId, NoteId, SubjectId, UserId } from './ids.js';
import type { Instant } from './primitives.js';

export type DocumentSource = 'upload' | 'link' | 'campus_sync';

export interface DocumentRecord {
  id: DocumentId;
  userId: UserId;
  subjectId: SubjectId | null;
  classSessionId: ClassSessionId | null;
  title: string;
  source: DocumentSource;
  /** Supabase Storage path. Null for link-only documents. */
  storagePath: string | null;
  externalUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Content hash used to detect campus files replaced in place. */
  contentHash: string | null;
  /** Set when this document supersedes an earlier version. */
  replacesDocumentId: DocumentId | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export type NoteMarker = 'question' | 'important' | 'exam' | 'task' | 'missed';

export interface Note {
  id: NoteId;
  userId: UserId;
  subjectId: SubjectId | null;
  classSessionId: ClassSessionId | null;
  title: string | null;
  body: string;
  markers: NoteMarker[];
  createdAt: Instant;
  updatedAt: Instant;
}

export type InboxItemStatus = 'unprocessed' | 'converted' | 'discarded';

/** Raw capture that has not been classified into a task, note or event yet. */
export interface InboxItem {
  id: InboxItemId;
  userId: UserId;
  rawText: string;
  status: InboxItemStatus;
  createdAt: Instant;
  processedAt: Instant | null;
}
