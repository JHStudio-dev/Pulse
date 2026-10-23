import { describe, expect, it } from 'vitest';
import type { CampusSyncSnapshot } from '@pulse/types';
import { campusSyncIngestRequestSchema } from '@pulse/validation';
import {
  buildIngestRequest,
  campusCourseKey,
  ingestErrorMessage,
  isScheduleDraftComplete,
  planCourseImport,
  type ScheduleDraft,
} from './campus-import';

function snapshot(externalId: string, title: string, sessionId = '0'): CampusSyncSnapshot {
  return {
    course: { externalId, sessionId, title, code: externalId },
    documents: [],
    assignments: [],
    announcements: [],
    events: [],
  };
}

const SUBJECTS = [
  { id: 'subject-adm', name: 'Administración I', code: 'ADM2011C1' },
  { id: 'subject-his', name: 'Historia de Honduras', code: null },
];

const DRAFT: ScheduleDraft = {
  weekdays: [3, 1],
  startTime: '18:00',
  endTime: '19:30',
  modality: 'virtual',
  meetingUrl: '  ',
};

function plan(
  course: CampusSyncSnapshot,
  overrides: Partial<Parameters<typeof planCourseImport>[1]> = {},
) {
  return planCourseImport(course, {
    connectionId: 'connection-1',
    subjects: SUBJECTS,
    links: [],
    usedSubjectIds: new Set(),
    ...overrides,
  });
}

describe('course keys', () => {
  it('separates sessions of the same course', () => {
    expect(campusCourseKey({ externalId: 'ADM', sessionId: '0' })).not.toBe(
      campusCourseKey({ externalId: 'ADM', sessionId: '7' }),
    );
  });
});

describe('planning a course import', () => {
  it('keeps the subject a course is already linked to', () => {
    expect(
      plan(snapshot('ADM2011C1', 'Administración I'), {
        links: [
          {
            campusConnectionId: 'connection-1',
            externalCourseId: 'ADM2011C1',
            externalSessionId: '0',
            subjectId: 'subject-his',
          },
        ],
      }),
    ).toEqual({ mode: 'link', subjectId: 'subject-his' });
  });

  it('leaves a course linked to an archived subject to the server', () => {
    expect(
      plan(snapshot('ADM2011C1', 'Administración I'), {
        links: [
          {
            campusConnectionId: 'connection-1',
            externalCourseId: 'ADM2011C1',
            externalSessionId: '0',
            subjectId: 'subject-archived',
          },
        ],
      }),
    ).toEqual({ mode: 'create' });
  });

  it('joins a subject with the same code', () => {
    expect(plan(snapshot('ADM2011C1', 'ADMINISTRACION I - SECCION C'))).toEqual({
      mode: 'link',
      subjectId: 'subject-adm',
    });
  });

  it('joins a subject with the same name when codes are missing', () => {
    expect(plan(snapshot('HIS101A1', 'historia de honduras'))).toEqual({
      mode: 'link',
      subjectId: 'subject-his',
    });
  });

  it('does not give two courses the same subject', () => {
    expect(
      plan(snapshot('ADM2011C1', 'Administración I', '7'), {
        usedSubjectIds: new Set(['subject-adm']),
      }),
    ).toEqual({ mode: 'create' });
  });

  it('creates a subject when nothing matches', () => {
    expect(plan(snapshot('MAT102B1', 'Geometría y Trigonometría'))).toEqual({ mode: 'create' });
  });
});

describe('ingest requests', () => {
  it('sends a confirmed schedule with the course it belongs to', () => {
    const geometry = snapshot('MAT102B1', 'Geometría y Trigonometría');
    const request = buildIngestRequest(geometry, { mode: 'create' }, DRAFT);
    const parsed = campusSyncIngestRequestSchema.parse(request);

    expect(parsed.snapshot.course.externalId).toBe('MAT102B1');
    expect(parsed.schedule).toEqual({
      weekdays: [1, 3],
      startTime: '18:00',
      endTime: '19:30',
      modality: 'virtual',
      meetingUrl: null,
      location: { campus: null, building: null, room: null },
    });
  });

  it('sends no schedule unless one was confirmed', () => {
    const request = buildIngestRequest(snapshot('MAT102B1', 'Geometría'), { mode: 'create' }, null);
    expect('schedule' in request).toBe(false);
  });

  it('links to the planned subject', () => {
    const request = buildIngestRequest(
      snapshot('ADM2011C1', 'Administración I'),
      { mode: 'link', subjectId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' },
      null,
    );

    expect(campusSyncIngestRequestSchema.parse(request)).toMatchObject({
      mode: 'link',
      subjectId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    });
  });

  it('rejects a schedule draft without days or with reversed times', () => {
    expect(isScheduleDraftComplete(DRAFT)).toBe(true);
    expect(isScheduleDraftComplete({ ...DRAFT, weekdays: [] })).toBe(false);
    expect(isScheduleDraftComplete({ ...DRAFT, startTime: '19:30', endTime: '18:00' })).toBe(false);
    expect(isScheduleDraftComplete({ ...DRAFT, endTime: '' })).toBe(false);
  });

  it('explains known ingest errors', () => {
    expect(ingestErrorMessage('subject_not_in_active_period')).toContain('período actual');
    expect(ingestErrorMessage('something_new')).toBe('No se pudo guardar esta materia.');
  });
});
