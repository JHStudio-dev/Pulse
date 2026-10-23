import { describe, expect, it } from 'vitest';
import type { DocumentId, DocumentRecord, Note, NoteId, Subject, UserId } from '@pulse/types';
import { makePeriod, makeSubject } from './testing/memory-campus-sync';
import {
  moveDocumentToSubject,
  moveNoteToSubject,
  noteHeadline,
  type UnassignedContentRepositories,
} from './unassigned-content';

const STUDENT = 'student-a' as UserId;
const OTHER_STUDENT = 'student-b' as UserId;

function world() {
  const current = makePeriod(STUDENT);
  const previous = makePeriod(STUDENT, { status: 'archived' });
  const subjects: Subject[] = [
    makeSubject(STUDENT, current.id, { name: 'Historia' }),
    makeSubject(STUDENT, previous.id, { name: 'Historia vieja' }),
    makeSubject(OTHER_STUDENT, makePeriod(OTHER_STUDENT).id, { name: 'Ajena' }),
  ];
  const documents = [
    { id: 'document-1' as DocumentId, userId: STUDENT, subjectId: null } as DocumentRecord,
  ];
  const notes = [{ id: 'note-1' as NoteId, userId: STUDENT, subjectId: null } as Note];

  const repositories: UnassignedContentRepositories = {
    periods: {
      async findActive(userId) {
        return userId === STUDENT ? current : null;
      },
    },
    subjects: {
      async findById(userId, id) {
        return subjects.find((subject) => subject.userId === userId && subject.id === id) ?? null;
      },
    },
    documents: {
      async findById(userId, id) {
        return documents.find((row) => row.userId === userId && row.id === id) ?? null;
      },
      async update(userId, id, changes) {
        const row = documents.find((document) => document.userId === userId && document.id === id)!;
        return Object.assign(row, changes);
      },
    },
    notes: {
      async moveToSubject(userId, id, subjectId) {
        const note = notes.find((row) => row.userId === userId && row.id === id);
        if (!note) throw new Error('not found');
        return Object.assign(note, { subjectId });
      },
    },
  };

  return { repositories, subjects, documents, notes };
}

describe('moving content without a subject', () => {
  it('moves a document into a subject of the active period', async () => {
    const w = world();
    const [current] = w.subjects;

    expect(
      await moveDocumentToSubject(STUDENT, w.documents[0]!.id, current!.id, w.repositories),
    ).toBe('moved');
    expect(w.documents[0]?.subjectId).toBe(current!.id);
  });

  it('moves a note into a subject of the active period', async () => {
    const w = world();
    const [current] = w.subjects;

    expect(await moveNoteToSubject(STUDENT, w.notes[0]!.id, current!.id, w.repositories)).toBe(
      'moved',
    );
    expect(w.notes[0]?.subjectId).toBe(current!.id);
  });

  it('refuses subjects from earlier periods', async () => {
    const w = world();
    const old = w.subjects[1]!;

    expect(await moveDocumentToSubject(STUDENT, w.documents[0]!.id, old.id, w.repositories)).toBe(
      'invalid_subject',
    );
    expect(w.documents[0]?.subjectId).toBeNull();
  });

  it('refuses another student’s subject and content', async () => {
    const w = world();
    const theirs = w.subjects[2]!;

    expect(await moveNoteToSubject(STUDENT, w.notes[0]!.id, theirs.id, w.repositories)).toBe(
      'invalid_subject',
    );
    expect(
      await moveDocumentToSubject(OTHER_STUDENT, w.documents[0]!.id, theirs.id, w.repositories),
    ).toBe('invalid_subject');
  });
});

describe('note headlines', () => {
  it('prefers the title, then the first line', () => {
    expect(noteHeadline({ title: 'Parcial', body: 'Temas 1 a 3' })).toBe('Parcial');
    expect(noteHeadline({ title: null, body: '\nTemas 1 a 3\nmás' })).toBe('Temas 1 a 3');
    expect(noteHeadline({ title: '  ', body: '' })).toBe('Nota sin texto');
  });

  it('shortens long lines', () => {
    expect(noteHeadline({ title: null, body: 'a'.repeat(100) }, 10)).toBe(`${'a'.repeat(9)}…`);
  });
});
