import type {
  AcademicPeriod,
  AssessmentId,
  AcademicPeriodId,
  CampusConnection,
  CampusConnectionId,
  CampusInstance,
  CampusInstanceId,
  DocumentId,
  DocumentRecord,
  InboxItem,
  InboxItemId,
  Note,
  NoteId,
  Reminder,
  ReminderId,
  Attendance,
  ClassSession,
  ClassSessionId,
  Location,
  Profile,
  Subject,
  SubjectId,
  SubjectSchedule,
  SubjectScheduleId,
  Task,
  TaskId,
  TimeOfDay,
  University,
  UniversityId,
  UserId,
  Weekday,
} from '@pulse/types';
import type {
  AcademicPeriodRow,
  CampusConnectionRow,
  DocumentRow,
  InboxItemRow,
  NoteRow,
  ReminderRow,
  CampusInstanceRow,
  AttendanceRow,
  ClassSessionRow,
  ProfileRow,
  SubjectRow,
  SubjectScheduleRow,
  TaskRow,
  UniversityRow,
} from './rows';

/**
 * Row to domain mapping.
 *
 * Kept pure and away from queries so the fiddly parts stay testable: a Postgres
 * time column arrives as HH:MM:SS, and a location is three flat columns that the
 * domain sees as one object.
 */

/** Postgres returns 08:00:00; the domain uses 08:00. */
export function toTimeOfDay(value: string): TimeOfDay {
  return value.slice(0, 5);
}

export function fromTimeOfDay(value: TimeOfDay): string {
  return value.length === 5 ? `${value}:00` : value;
}

function toLocation(campus: string | null, building: string | null, room: string | null): Location {
  return { campus, building, room };
}

export function toProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id as UserId,
    displayName: row.display_name,
    timeZone: row.time_zone,
    locale: row.locale,
    theme: row.theme,
    quietHours: {
      enabled: row.quiet_hours_enabled,
      start: row.quiet_hours_start ? toTimeOfDay(row.quiet_hours_start) : '22:00',
      end: row.quiet_hours_end ? toTimeOfDay(row.quiet_hours_end) : '07:00',
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAcademicPeriod(row: AcademicPeriodRow): AcademicPeriod {
  return {
    id: row.id as AcademicPeriodId,
    userId: row.user_id as UserId,
    name: row.name,
    range: { start: row.start_date, end: row.end_date },
    status: row.status,
    timeZone: row.time_zone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSubject(row: SubjectRow): Subject {
  return {
    id: row.id as SubjectId,
    userId: row.user_id as UserId,
    academicPeriodId: row.academic_period_id as AcademicPeriodId,
    campusInstanceId: row.campus_instance_id as Subject['campusInstanceId'],
    name: row.name,
    code: row.code,
    professorName: row.professor_name,
    professorContact: row.professor_contact,
    passingGrade: row.passing_grade,
    gradeScaleMax: row.grade_scale_max,
    defaultModality: row.default_modality,
    defaultMeetingUrl: row.default_meeting_url,
    defaultLocation: toLocation(row.default_campus, row.default_building, row.default_room),
    travelBufferMinutes: row.travel_buffer_minutes,
    color: row.color,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toSubjectSchedule(row: SubjectScheduleRow): SubjectSchedule {
  return {
    id: row.id as SubjectScheduleId,
    subjectId: row.subject_id as SubjectId,
    weekday: row.weekday as Weekday,
    startTime: toTimeOfDay(row.start_time),
    endTime: toTimeOfDay(row.end_time),
    modality: row.modality,
    meetingUrl: row.meeting_url,
    location: toLocation(row.campus, row.building, row.room),
    activeRange:
      row.active_from === null ? null : { start: row.active_from, end: row.active_until },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toClassSession(row: ClassSessionRow): ClassSession {
  return {
    id: row.id as ClassSessionId,
    subjectId: row.subject_id as SubjectId,
    subjectScheduleId: row.subject_schedule_id as ClassSession['subjectScheduleId'],
    date: row.session_date,
    startTime: toTimeOfDay(row.start_time),
    endTime: toTimeOfDay(row.end_time),
    modality: row.modality,
    status: row.status,
    meetingUrl: row.meeting_url,
    location: toLocation(row.campus, row.building, row.room),
    changeNote: row.change_note,
    cancelledReason: row.cancelled_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAttendance(row: AttendanceRow): Attendance {
  return {
    classSessionId: row.class_session_id as ClassSessionId,
    status: row.status,
    note: row.note,
    recordedAt: row.recorded_at,
  };
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id as TaskId,
    userId: row.user_id as UserId,
    subjectId: row.subject_id as Task['subjectId'],
    title: row.title,
    description: row.description,
    assignedDate: row.assigned_date,
    dueDate: row.due_date,
    dueTime: row.due_time === null ? null : toTimeOfDay(row.due_time),
    status: row.status,
    difficulty: row.difficulty,
    progress: row.progress,
    estimatedMinutes: row.estimated_minutes,
    academicWeight: row.academic_weight,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Domain to row for writes, flattening the location back into columns. */
export function fromSubject(
  subject: Omit<Subject, 'id' | 'createdAt' | 'updatedAt'>,
): Omit<SubjectRow, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: subject.userId,
    academic_period_id: subject.academicPeriodId,
    campus_instance_id: subject.campusInstanceId,
    name: subject.name,
    code: subject.code,
    professor_name: subject.professorName,
    professor_contact: subject.professorContact,
    passing_grade: subject.passingGrade,
    grade_scale_max: subject.gradeScaleMax,
    default_modality: subject.defaultModality,
    default_meeting_url: subject.defaultMeetingUrl,
    default_campus: subject.defaultLocation.campus,
    default_building: subject.defaultLocation.building,
    default_room: subject.defaultLocation.room,
    travel_buffer_minutes: subject.travelBufferMinutes,
    color: subject.color,
    archived_at: subject.archivedAt,
  };
}

export function fromClassSession(
  session: Omit<ClassSession, 'id' | 'createdAt' | 'updatedAt'>,
  userId: UserId,
): Omit<ClassSessionRow, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: userId,
    subject_id: session.subjectId,
    subject_schedule_id: session.subjectScheduleId,
    session_date: session.date,
    start_time: fromTimeOfDay(session.startTime),
    end_time: fromTimeOfDay(session.endTime),
    modality: session.modality,
    status: session.status,
    meeting_url: session.meetingUrl,
    campus: session.location.campus,
    building: session.location.building,
    room: session.location.room,
    change_note: session.changeNote,
    cancelled_reason: session.cancelledReason,
  };
}

export function toUniversity(row: UniversityRow): University {
  return {
    id: row.id as UniversityId,
    name: row.name,
    abbreviation: row.abbreviation,
    countryCode: row.country_code,
    createdAt: row.created_at,
  };
}

export function toCampusInstance(row: CampusInstanceRow): CampusInstance {
  return {
    id: row.id as CampusInstanceId,
    universityId: row.university_id as UniversityId,
    name: row.name,
    platform: row.platform,
    baseUrl: row.base_url,
    settings: row.settings,
    createdAt: row.created_at,
  };
}

export function toCampusConnection(row: CampusConnectionRow): CampusConnection {
  return {
    id: row.id as CampusConnectionId,
    userId: row.user_id as UserId,
    campusInstanceId: row.campus_instance_id as CampusInstanceId,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDocument(row: DocumentRow): DocumentRecord {
  return {
    id: row.id as DocumentId,
    userId: row.user_id as UserId,
    subjectId: row.subject_id as DocumentRecord['subjectId'],
    classSessionId: row.class_session_id as DocumentRecord['classSessionId'],
    title: row.title,
    source: row.source,
    storagePath: row.storage_path,
    externalUrl: row.external_url,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    contentHash: row.content_hash,
    replacesDocumentId: row.replaces_document_id as DocumentRecord['replacesDocumentId'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toInboxItem(row: InboxItemRow): InboxItem {
  return {
    id: row.id as InboxItemId,
    userId: row.user_id as UserId,
    rawText: row.raw_text,
    subjectId: row.subject_id as InboxItem['subjectId'],
    status: row.status,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

export function toNote(row: NoteRow): Note {
  return {
    id: row.id as NoteId,
    userId: row.user_id as UserId,
    subjectId: row.subject_id as Note['subjectId'],
    classSessionId: row.class_session_id as Note['classSessionId'],
    title: row.title,
    body: row.body,
    markers: row.markers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id as ReminderId,
    userId: row.user_id as UserId,
    target: {
      kind: row.target_kind,
      classSessionId: row.class_session_id as ClassSessionId | null,
      taskId: row.task_id as TaskId | null,
      assessmentId: row.assessment_id as AssessmentId | null,
    },
    kind: row.kind,
    offsetMinutes: row.offset_minutes,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}
