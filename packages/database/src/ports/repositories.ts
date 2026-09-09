import type {
  AcademicPeriod,
  AcademicPeriodId,
  CampusInstance,
  Attendance,
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
  profiles: ProfileRepository;
  academicPeriods: AcademicPeriodRepository;
  subjects: SubjectRepository;
  subjectSchedules: SubjectScheduleRepository;
  classSessions: ClassSessionRepository;
  attendance: AttendanceRepository;
  tasks: TaskRepository;
}
