import type {
  AcademicPeriod,
  AcademicPeriodId,
  CampusConnection,
  CampusInstance,
  CampusInstanceId,
  DocumentId,
  DocumentRecord,
  InboxItem,
  InboxItemId,
  Note,
  NoteId,
  RecoveryItem,
  RecoveryItemId,
  RecoveryItemKind,
  RecoveryPlan,
  RecoveryPlanId,
  Reminder,
  ReminderId,
  Attendance,
  ClassMarker,
  ClassMarkerId,
  ClassMarkerKind,
  ClassSession,
  ClassSessionId,
  IsoDate,
  Profile,
  Subject,
  SubjectId,
  SubjectSchedule,
  Task,
  TaskId,
  University,
  UniversityId,
  UserId,
} from '@pulse/types';

/**
 * Data access ports.
 *
 * These describe what Pulse needs from storage without naming a provider.
 * Supabase implements them today; a direct PostgreSQL layer could implement the
 * same contract later without touching domain or interface code.
 */

/** Shared reference data. Readable by any signed in user, written by nobody. */
export interface InstitutionRepository {
  listUniversities(): Promise<University[]>;
  listCampusInstances(universityId: UniversityId): Promise<CampusInstance[]>;
}

/**
 * The student's campus. A connection is created on selection with status
 * disconnected: it records which campus they belong to, and says nothing about
 * synchronization, which does not exist yet.
 */
export interface CampusConnectionRepository {
  findByUser(userId: UserId): Promise<CampusConnection | null>;
  selectCampus(userId: UserId, campusInstanceId: CampusInstanceId): Promise<CampusConnection>;
}

export interface ProfileRepository {
  findByUserId(userId: UserId): Promise<Profile | null>;
  update(userId: UserId, changes: Partial<Omit<Profile, 'userId'>>): Promise<Profile>;
}

export interface AcademicPeriodRepository {
  listByUser(userId: UserId): Promise<AcademicPeriod[]>;
  findActive(userId: UserId): Promise<AcademicPeriod | null>;
  findById(userId: UserId, id: AcademicPeriodId): Promise<AcademicPeriod | null>;
  create(
    userId: UserId,
    input: Omit<AcademicPeriod, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<AcademicPeriod>;
  update(
    userId: UserId,
    id: AcademicPeriodId,
    changes: Partial<Omit<AcademicPeriod, 'id' | 'userId'>>,
  ): Promise<AcademicPeriod>;
}

export interface SubjectRepository {
  listByPeriod(userId: UserId, periodId: AcademicPeriodId): Promise<Subject[]>;
  findById(userId: UserId, id: SubjectId): Promise<Subject | null>;
  create(
    userId: UserId,
    input: Omit<Subject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Subject>;
  update(
    userId: UserId,
    id: SubjectId,
    changes: Partial<Omit<Subject, 'id' | 'userId'>>,
  ): Promise<Subject>;
  archive(userId: UserId, id: SubjectId): Promise<void>;
}

export interface SubjectScheduleRepository {
  listBySubject(userId: UserId, subjectId: SubjectId): Promise<SubjectSchedule[]>;
  listByPeriod(userId: UserId, periodId: AcademicPeriodId): Promise<SubjectSchedule[]>;
  create(
    userId: UserId,
    input: Omit<SubjectSchedule, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SubjectSchedule>;
  remove(userId: UserId, id: SubjectSchedule['id']): Promise<void>;
}

export interface ClassSessionRepository {
  listInRange(userId: UserId, from: IsoDate, to: IsoDate): Promise<ClassSession[]>;
  listBySubject(userId: UserId, subjectId: SubjectId): Promise<ClassSession[]>;
  findById(userId: UserId, id: ClassSessionId): Promise<ClassSession | null>;
  /** Used when generating a period's sessions from its schedules. */
  createMany(
    userId: UserId,
    sessions: ReadonlyArray<Omit<ClassSession, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ClassSession[]>;
  update(
    userId: UserId,
    id: ClassSessionId,
    changes: Partial<Omit<ClassSession, 'id'>>,
  ): Promise<ClassSession>;
}

export interface AttendanceRepository {
  findBySession(userId: UserId, sessionId: ClassSessionId): Promise<Attendance | null>;
  record(userId: UserId, attendance: Attendance): Promise<Attendance>;
}

/** Files a student uploads. The bucket is private; access goes through signed URLs. */
export interface DocumentRepository {
  listBySubject(userId: UserId, subjectId: SubjectId): Promise<DocumentRecord[]>;
  findById(userId: UserId, id: DocumentId): Promise<DocumentRecord | null>;
  create(
    userId: UserId,
    input: Omit<DocumentRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<DocumentRecord>;
  remove(userId: UserId, id: DocumentId): Promise<void>;
  createSignedUrl(userId: UserId, id: DocumentId, expiresInSeconds: number): Promise<string>;
}

/**
 * Raw capture. The text is stored exactly as written and never rewritten, so a
 * later parser can work from the original wording.
 */
export interface InboxRepository {
  listByUser(userId: UserId): Promise<InboxItem[]>;
  findById(userId: UserId, id: InboxItemId): Promise<InboxItem | null>;
  capture(userId: UserId, rawText: string, subjectId: SubjectId | null): Promise<InboxItem>;
  update(
    userId: UserId,
    id: InboxItemId,
    changes: { rawText?: string; subjectId?: SubjectId | null },
  ): Promise<InboxItem>;
  close(userId: UserId, id: InboxItemId, status: 'converted' | 'discarded'): Promise<InboxItem>;
  remove(userId: UserId, id: InboxItemId): Promise<void>;
}

export interface NoteRepository {
  listBySubject(userId: UserId, subjectId: SubjectId): Promise<Note[]>;
  create(
    userId: UserId,
    input: Omit<Note, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Note>;
  remove(userId: UserId, id: NoteId): Promise<void>;
}

/**
 * Reminder rules. Scheduling only: resolving when one fires and delivering it
 * are separate concerns, so a channel can be added without touching this.
 */
export interface ReminderRepository {
  listByUser(userId: UserId): Promise<Reminder[]>;
  createForTask(userId: UserId, taskId: TaskId, offsetMinutes: number): Promise<Reminder>;
  createForSession(
    userId: UserId,
    sessionId: ClassSessionId,
    offsetMinutes: number,
  ): Promise<Reminder>;
  remove(userId: UserId, id: ReminderId): Promise<void>;
}

/** Points the student flagged while a class was running. */
export interface ClassMarkerRepository {
  listBySession(userId: UserId, sessionId: ClassSessionId): Promise<ClassMarker[]>;
  create(
    userId: UserId,
    sessionId: ClassSessionId,
    kind: ClassMarkerKind,
    offsetSeconds: number,
    note: string | null,
  ): Promise<ClassMarker>;
  remove(userId: UserId, id: ClassMarkerId): Promise<void>;
}

/** Recovery plans for missed classes, with their checklist. */
export interface RecoveryRepository {
  findBySession(userId: UserId, sessionId: ClassSessionId): Promise<RecoveryPlan | null>;
  listByUser(userId: UserId): Promise<RecoveryPlan[]>;
  listItems(userId: UserId, planId: RecoveryPlanId): Promise<RecoveryItem[]>;
  create(
    userId: UserId,
    sessionId: ClassSessionId,
    items: ReadonlyArray<{ kind: RecoveryItemKind; position: number }>,
  ): Promise<RecoveryPlan>;
  setItemDone(userId: UserId, itemId: RecoveryItemId, done: boolean): Promise<void>;
  setStatus(
    userId: UserId,
    planId: RecoveryPlanId,
    status: RecoveryPlan['status'],
  ): Promise<RecoveryPlan>;
  remove(userId: UserId, planId: RecoveryPlanId): Promise<void>;
}

export interface TaskRepository {
  listByUser(userId: UserId): Promise<Task[]>;
  listBySubject(userId: UserId, subjectId: SubjectId): Promise<Task[]>;
  findById(userId: UserId, id: TaskId): Promise<Task | null>;
  create(
    userId: UserId,
    input: Omit<Task, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Task>;
  update(userId: UserId, id: TaskId, changes: Partial<Omit<Task, 'id' | 'userId'>>): Promise<Task>;
  remove(userId: UserId, id: TaskId): Promise<void>;
}

/** Everything the application layer is allowed to reach storage through. */
export interface PulseDatabase {
  institutions: InstitutionRepository;
  campusConnections: CampusConnectionRepository;
  profiles: ProfileRepository;
  academicPeriods: AcademicPeriodRepository;
  subjects: SubjectRepository;
  subjectSchedules: SubjectScheduleRepository;
  classSessions: ClassSessionRepository;
  attendance: AttendanceRepository;
  markers: ClassMarkerRepository;
  recovery: RecoveryRepository;
  tasks: TaskRepository;
  documents: DocumentRepository;
  inbox: InboxRepository;
  notes: NoteRepository;
  reminders: ReminderRepository;
}
