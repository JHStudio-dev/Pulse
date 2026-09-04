import type {
  ClassSession,
  ClassSessionId,
  Subject,
  SubjectId,
  SubjectSchedule,
  SubjectScheduleId,
} from '@pulse/types';
import { EMPTY_LOCATION } from '@pulse/types';

/** Minimal builders so tests state only the fields they care about. */

const NOW = '2026-03-01T00:00:00.000Z';

export function makeSchedule(overrides: Partial<SubjectSchedule> = {}): SubjectSchedule {
  return {
    id: 'schedule-1' as SubjectScheduleId,
    subjectId: 'subject-1' as SubjectId,
    weekday: 1,
    startTime: '08:00',
    endTime: '09:30',
    modality: 'in_person',
    meetingUrl: null,
    location: EMPTY_LOCATION,
    activeRange: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<ClassSession> = {}): ClassSession {
  return {
    id: 'session-1' as ClassSessionId,
    subjectId: 'subject-1' as SubjectId,
    subjectScheduleId: null,
    date: '2026-03-02',
    startTime: '08:00',
    endTime: '09:30',
    modality: 'in_person',
    status: 'scheduled',
    meetingUrl: null,
    location: EMPTY_LOCATION,
    changeNote: null,
    cancelledReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 'subject-1' as SubjectId,
    userId: 'user-1' as Subject['userId'],
    academicPeriodId: 'period-1' as Subject['academicPeriodId'],
    campusInstanceId: null,
    name: 'Física I',
    code: null,
    professorName: null,
    professorContact: null,
    passingGrade: 60,
    gradeScaleMax: 100,
    defaultModality: 'in_person',
    defaultMeetingUrl: null,
    defaultLocation: EMPTY_LOCATION,
    travelBufferMinutes: null,
    color: null,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
