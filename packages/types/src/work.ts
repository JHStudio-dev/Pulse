import type {
  AssessmentId,
  ClassSessionId,
  GradeCategoryId,
  GradeId,
  SubjectId,
  TaskId,
  TaskItemId,
  UserId,
} from './ids';
import type { Instant, IsoDate } from './primitives';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'submitted' | 'overdue';

export type TaskDifficulty = 'easy' | 'medium' | 'hard';

export interface Task {
  id: TaskId;
  userId: UserId;
  subjectId: SubjectId | null;
  title: string;
  description: string | null;
  assignedDate: IsoDate | null;
  dueDate: IsoDate | null;
  /** Optional deadline time. Null means end of the due date. */
  dueTime: string | null;
  status: TaskStatus;
  difficulty: TaskDifficulty | null;
  /** 0-100. */
  progress: number;
  estimatedMinutes: number | null;
  /** Share of the subject grade, when known. */
  academicWeight: number | null;
  createdAt: Instant;
  updatedAt: Instant;
}

export interface TaskItem {
  id: TaskItemId;
  taskId: TaskId;
  title: string;
  done: boolean;
  position: number;
}

export type AssessmentType =
  'exam' | 'midterm' | 'quiz' | 'project' | 'presentation' | 'lab' | 'graded_task' | 'final';

export interface Assessment {
  id: AssessmentId;
  userId: UserId;
  subjectId: SubjectId;
  gradeCategoryId: GradeCategoryId | null;
  classSessionId: ClassSessionId | null;
  title: string;
  type: AssessmentType;
  date: IsoDate | null;
  /** Points this assessment contributes to the subject total. */
  maxPoints: number | null;
  createdAt: Instant;
  updatedAt: Instant;
}

/** Weighted bucket, e.g. "Exams 40%". */
export interface GradeCategory {
  id: GradeCategoryId;
  subjectId: SubjectId;
  name: string;
  /** Percentage of the final grade. */
  weight: number;
  createdAt: Instant;
}

export interface Grade {
  id: GradeId;
  assessmentId: AssessmentId;
  pointsEarned: number;
  pointsPossible: number;
  recordedAt: Instant;
}
