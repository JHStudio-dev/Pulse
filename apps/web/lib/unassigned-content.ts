import type {
  AcademicPeriodRepository,
  DocumentRepository,
  NoteRepository,
  SubjectRepository,
} from '@pulse/database';
import type { DocumentId, NoteId, SubjectId, UserId } from '@pulse/types';

/**
 * Documents and notes that have no subject.
 *
 * They appear when a subject is deleted (its uploads and notes are kept) or
 * when a note is captured without one. Moving them is limited to subjects of
 * the active period, the only ones the student can see and work in.
 */

export interface UnassignedContentRepositories {
  periods: Pick<AcademicPeriodRepository, 'findActive'>;
  subjects: Pick<SubjectRepository, 'findById'>;
  documents: Pick<DocumentRepository, 'findById' | 'update'>;
  notes: Pick<NoteRepository, 'moveToSubject'>;
}

export type MoveOutcome = 'moved' | 'invalid_subject' | 'not_found';

async function canReceive(
  userId: UserId,
  subjectId: SubjectId,
  repositories: Pick<UnassignedContentRepositories, 'periods' | 'subjects'>,
): Promise<boolean> {
  const [period, subject] = await Promise.all([
    repositories.periods.findActive(userId),
    repositories.subjects.findById(userId, subjectId),
  ]);

  return period !== null && subject !== null && subject.academicPeriodId === period.id;
}

export async function moveDocumentToSubject(
  userId: UserId,
  documentId: DocumentId,
  subjectId: SubjectId,
  repositories: UnassignedContentRepositories,
): Promise<MoveOutcome> {
  if (!(await canReceive(userId, subjectId, repositories))) return 'invalid_subject';

  const document = await repositories.documents.findById(userId, documentId);
  if (!document) return 'not_found';

  await repositories.documents.update(userId, documentId, { subjectId });
  return 'moved';
}

export async function moveNoteToSubject(
  userId: UserId,
  noteId: NoteId,
  subjectId: SubjectId,
  repositories: UnassignedContentRepositories,
): Promise<MoveOutcome> {
  if (!(await canReceive(userId, subjectId, repositories))) return 'invalid_subject';

  try {
    await repositories.notes.moveToSubject(userId, noteId, subjectId);
  } catch {
    return 'not_found';
  }

  return 'moved';
}

/** First line of a note, for lists where the note has no title. */
export function noteHeadline(note: { title: string | null; body: string }, maxLength = 80): string {
  const source = note.title?.trim() || note.body.trim().split('\n')[0]?.trim() || 'Nota sin texto';
  return source.length > maxLength ? `${source.slice(0, maxLength - 1).trimEnd()}…` : source;
}
