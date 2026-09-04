import type {
  AcademicPeriodId,
  CampusInstanceId,
  ClassSessionId,
  SubjectId,
  SubjectScheduleId,
  UserId,
} from './ids.js';
import type { DateRange, Instant, IsoDate, TimeOfDay, TimeZone, Weekday } from './primitives.js';

/**
 * Class modality.
 *
 * `unconfirmed` is a real state, not a missing value: a hybrid subject often has
 * sessions whose modality is genuinely not announced yet, and Pulse has to show
 * that rather than guess.
 */
export type Modality = 'in_person' | 'virtual' | 'hybrid' | 'unconfirmed';

export type AcademicPeriodStatus = 'planned' | 'active' | 'archived';

export interface AcademicPeriod {
  id: AcademicPeriodId;
  userId: UserId;
  name: string;
  range: DateRange;
  status: AcademicPeriodStatus;
  /** Drives every schedule-to-instant conversion inside the period. */
  timeZone: TimeZone;
  createdAt: Instant;
  updatedAt: Instant;
}

/** Where an in-person class physically happens. */
export interface Location {
  campus: string | null;
  building: string | null;
  room: string | null;
}

export const EMPTY_LOCATION: Location = { campus: null, building: null, room: null };

export interface Subject {
  id: SubjectId;
  userId: UserId;
  academicPeriodId: AcademicPeriodId;
  campusInstanceId: CampusInstanceId | null;
  name: string;
  code: string | null;
  professorName: string | null;
  professorContact: string | null;
  /** Grade needed to pass, on the subject's own scale. */
  passingGrade: number | null;
  gradeScaleMax: number;
  defaultModality: Modality;
  defaultMeetingUrl: string | null;
  defaultLocation: Location;
  /** Minutes before an in-person class to fire the departure reminder. */
  travelBufferMinutes: number | null;
  color: string | null;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}

/** Recurring weekly slot. Concrete sessions are generated from this. */
export interface SubjectSchedule {
  id: SubjectScheduleId;
  subjectId: SubjectId;
  weekday: Weekday;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  modality: Modality;
  meetingUrl: string | null;
  location: Location;
  /** Defaults to the subject's period when null. */
  activeRange: DateRange | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export type ClassSessionStatus = 'scheduled' | 'completed' | 'cancelled';

/**
 * A single concrete class.
 *
 * Fields here override the schedule rather than mirroring it, so a one-off room
 * change or a virtual week does not require editing the recurring slot.
 */
export interface ClassSession {
  id: ClassSessionId;
  subjectId: SubjectId;
  /** Null when the session was added manually rather than generated. */
  subjectScheduleId: SubjectScheduleId | null;
  date: IsoDate;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  modality: Modality;
  status: ClassSessionStatus;
  meetingUrl: string | null;
  location: Location;
  /** Set when the session differs from its generating schedule. */
  changeNote: string | null;
  cancelledReason: string | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export type AttendanceStatus = 'attended' | 'partial' | 'missed' | 'cancelled';

export interface Attendance {
  classSessionId: ClassSessionId;
  status: AttendanceStatus;
  note: string | null;
  recordedAt: Instant;
}
