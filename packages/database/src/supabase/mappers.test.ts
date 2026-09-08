import { describe, expect, it } from 'vitest';
import type { UserId } from '@pulse/types';
import {
  fromClassSession,
  fromSubject,
  fromTimeOfDay,
  toClassSession,
  toSubject,
  toSubjectSchedule,
  toTask,
  toTimeOfDay,
} from './mappers';
import type { ClassSessionRow, SubjectRow, SubjectScheduleRow, TaskRow } from './rows';

const NOW = '2026-03-01T00:00:00.000Z';

describe('time mapping', () => {
  it('trims the seconds Postgres adds to a time column', () => {
    expect(toTimeOfDay('08:00:00')).toBe('08:00');
    expect(toTimeOfDay('17:45:00')).toBe('17:45');
  });

  it('leaves an already short time untouched', () => {
    expect(toTimeOfDay('08:00')).toBe('08:00');
  });

  it('restores seconds when writing back', () => {
    expect(fromTimeOfDay('08:00')).toBe('08:00:00');
    expect(fromTimeOfDay('08:00:00')).toBe('08:00:00');
  });
});

describe('toSubject', () => {
  const row: SubjectRow = {
    id: 'subject-1',
    user_id: 'user-1',
    academic_period_id: 'period-1',
    campus_instance_id: null,
    name: 'Fisica I',
    code: 'FIS-101',
    professor_name: null,
    professor_contact: null,
    passing_grade: 60,
    grade_scale_max: 100,
    default_modality: 'in_person',
    default_meeting_url: null,
    default_campus: 'Central',
    default_building: 'B',
    default_room: '204',
    travel_buffer_minutes: 25,
    color: null,
    archived_at: null,
    created_at: NOW,
    updated_at: NOW,
  };

  it('gathers the flat location columns into one object', () => {
    expect(toSubject(row).defaultLocation).toEqual({
      campus: 'Central',
      building: 'B',
      room: '204',
    });
  });

  it('round-trips through the write mapper', () => {
    const domain = toSubject(row);
    const written = fromSubject(domain);

    expect(written.default_campus).toBe('Central');
    expect(written.default_room).toBe('204');
    expect(written.name).toBe('Fisica I');
    expect(written.travel_buffer_minutes).toBe(25);
  });
});

describe('toSubjectSchedule', () => {
  const row: SubjectScheduleRow = {
    id: 'schedule-1',
    user_id: 'user-1',
    subject_id: 'subject-1',
    weekday: 3,
    start_time: '08:00:00',
    end_time: '09:30:00',
    modality: 'virtual',
    meeting_url: 'https://meet.example.test/abc',
    campus: null,
    building: null,
    room: null,
    active_from: null,
    active_until: null,
    created_at: NOW,
    updated_at: NOW,
  };

  it('treats a missing active_from as no active range', () => {
    expect(toSubjectSchedule(row).activeRange).toBeNull();
  });

  it('builds the range when a start is present', () => {
    const bounded = toSubjectSchedule({
      ...row,
      active_from: '2026-03-01',
      active_until: '2026-04-01',
    });

    expect(bounded.activeRange).toEqual({ start: '2026-03-01', end: '2026-04-01' });
  });

  it('allows an open-ended range', () => {
    const open = toSubjectSchedule({ ...row, active_from: '2026-03-01', active_until: null });
    expect(open.activeRange).toEqual({ start: '2026-03-01', end: null });
  });
});

describe('toClassSession', () => {
  const row: ClassSessionRow = {
    id: 'session-1',
    user_id: 'user-1',
    subject_id: 'subject-1',
    subject_schedule_id: 'schedule-1',
    session_date: '2026-03-04',
    start_time: '08:00:00',
    end_time: '09:30:00',
    modality: 'in_person',
    status: 'scheduled',
    meeting_url: null,
    campus: 'Central',
    building: 'B',
    room: '204',
    change_note: null,
    cancelled_reason: null,
    created_at: NOW,
    updated_at: NOW,
  };

  it('maps session_date onto the domain date field', () => {
    expect(toClassSession(row).date).toBe('2026-03-04');
  });

  it('round-trips back to row shape', () => {
    const written = fromClassSession(toClassSession(row), 'user-1' as UserId);

    expect(written.session_date).toBe('2026-03-04');
    expect(written.start_time).toBe('08:00:00');
    expect(written.room).toBe('204');
  });
});

describe('toTask', () => {
  const row: TaskRow = {
    id: 'task-1',
    user_id: 'user-1',
    subject_id: null,
    title: 'Informe',
    description: null,
    assigned_date: null,
    due_date: '2026-03-20',
    due_time: null,
    status: 'pending',
    difficulty: null,
    progress: 0,
    estimated_minutes: null,
    academic_weight: null,
    created_at: NOW,
    updated_at: NOW,
  };

  it('keeps a null due time null rather than trimming it', () => {
    expect(toTask(row).dueTime).toBeNull();
  });

  it('trims a present due time', () => {
    expect(toTask({ ...row, due_time: '23:59:00' }).dueTime).toBe('23:59');
  });
});
