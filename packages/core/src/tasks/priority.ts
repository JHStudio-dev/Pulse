import type { IsoDate, Task } from '@pulse/types';
import { daysBetween } from '../time/dates.js';

/**
 * Task priority.
 *
 * The spec requires the ranking to explain itself rather than expose a bare
 * score. Factors carry codes and numbers only; wording and translation belong
 * to the interface, not to domain logic.
 */

export type PriorityFactorCode =
  | 'overdue'
  | 'due_today'
  | 'due_soon'
  | 'heavy_weight'
  | 'high_difficulty'
  | 'barely_started'
  | 'assessment_nearby';

export interface PriorityFactor {
  code: PriorityFactorCode;
  /** Contribution to the score, always positive. */
  points: number;
  /** Supporting number, e.g. days overdue or weight percentage. */
  value?: number;
}

export type PriorityLevel = 'low' | 'normal' | 'high' | 'critical';

export interface TaskPriority {
  score: number;
  level: PriorityLevel;
  factors: PriorityFactor[];
}

export interface PriorityContext {
  today: IsoDate;
  /** Days until the nearest assessment for the same subject, when one exists. */
  daysToNextAssessment?: number | null;
}

const LEVEL_THRESHOLDS: ReadonlyArray<[PriorityLevel, number]> = [
  ['critical', 70],
  ['high', 45],
  ['normal', 20],
];

function levelFor(score: number): PriorityLevel {
  for (const [level, threshold] of LEVEL_THRESHOLDS) {
    if (score >= threshold) return level;
  }
  return 'low';
}

/**
 * Scores one task. Finished work always scores zero so it cannot occupy the
 * top of a list the student is meant to act on.
 */
export function resolveTaskPriority(task: Task, context: PriorityContext): TaskPriority {
  if (task.status === 'done' || task.status === 'submitted') {
    return { score: 0, level: 'low', factors: [] };
  }

  const factors: PriorityFactor[] = [];

  if (task.dueDate) {
    const daysLeft = daysBetween(context.today, task.dueDate);

    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);
      factors.push({
        code: 'overdue',
        points: Math.min(40 + daysOverdue * 5, 60),
        value: daysOverdue,
      });
    } else if (daysLeft === 0) {
      factors.push({ code: 'due_today', points: 35 });
    } else if (daysLeft <= 7) {
      factors.push({ code: 'due_soon', points: Math.round(30 - daysLeft * 3), value: daysLeft });
    }
  }

  if (task.academicWeight !== null && task.academicWeight >= 15) {
    factors.push({
      code: 'heavy_weight',
      points: Math.min(Math.round(task.academicWeight / 2), 20),
      value: task.academicWeight,
    });
  }

  if (task.difficulty === 'hard') {
    factors.push({ code: 'high_difficulty', points: 8 });
  }

  // Only counts once the deadline is close enough for low progress to matter.
  if (task.progress <= 20 && task.dueDate !== null) {
    const daysLeft = daysBetween(context.today, task.dueDate);
    if (daysLeft <= 3) {
      factors.push({ code: 'barely_started', points: 10, value: task.progress });
    }
  }

  const daysToAssessment = context.daysToNextAssessment;
  if (daysToAssessment !== null && daysToAssessment !== undefined && daysToAssessment <= 7) {
    factors.push({
      code: 'assessment_nearby',
      points: Math.max(12 - daysToAssessment, 4),
      value: daysToAssessment,
    });
  }

  const score = Math.min(
    factors.reduce((total, factor) => total + factor.points, 0),
    100,
  );

  return { score, level: levelFor(score), factors };
}

function isFinished(task: Task): boolean {
  return task.status === 'done' || task.status === 'submitted';
}

/**
 * Highest priority first; ties fall back to the earlier due date.
 *
 * Finished work sorts last regardless of its due date, so a task completed long
 * ago cannot sit above one the student still has to do.
 */
export function sortTasksByPriority(
  tasks: readonly Task[],
  context: PriorityContext,
): Array<{ task: Task; priority: TaskPriority }> {
  return tasks
    .map((task) => ({ task, priority: resolveTaskPriority(task, context) }))
    .sort((a, b) => {
      const finishedGap = Number(isFinished(a.task)) - Number(isFinished(b.task));
      if (finishedGap !== 0) return finishedGap;
      if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score;
      if (a.task.dueDate && b.task.dueDate) return a.task.dueDate.localeCompare(b.task.dueDate);
      if (a.task.dueDate) return -1;
      if (b.task.dueDate) return 1;
      return 0;
    });
}

/** A task is overdue when its due date has passed and it was never submitted. */
export function isOverdue(task: Task, today: IsoDate): boolean {
  if (task.status === 'done' || task.status === 'submitted') return false;
  return task.dueDate !== null && task.dueDate < today;
}
