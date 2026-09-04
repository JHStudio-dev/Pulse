import { describe, expect, it } from 'vitest';
import type { Task, TaskId, UserId } from '@pulse/types';
import { isOverdue, resolveTaskPriority, sortTasksByPriority } from './priority.js';

const TODAY = '2026-03-10';
const NOW = '2026-03-01T00:00:00.000Z';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1' as TaskId,
    userId: 'user-1' as UserId,
    subjectId: null,
    title: 'Informe de laboratorio',
    description: null,
    assignedDate: null,
    dueDate: null,
    dueTime: null,
    status: 'pending',
    difficulty: null,
    progress: 0,
    estimatedMinutes: null,
    academicWeight: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const codes = (task: Task, daysToNextAssessment: number | null = null) =>
  resolveTaskPriority(task, { today: TODAY, daysToNextAssessment }).factors.map((f) => f.code);

describe('resolveTaskPriority', () => {
  it('scores completed work at zero', () => {
    const done = makeTask({ status: 'done', dueDate: '2026-03-01' });
    const priority = resolveTaskPriority(done, { today: TODAY });

    expect(priority.score).toBe(0);
    expect(priority.factors).toEqual([]);
  });

  it('treats submitted work as finished too', () => {
    const submitted = makeTask({ status: 'submitted', dueDate: '2026-03-01' });
    expect(resolveTaskPriority(submitted, { today: TODAY }).score).toBe(0);
  });

  it('raises an overdue task and records how late it is', () => {
    const priority = resolveTaskPriority(makeTask({ dueDate: '2026-03-07' }), { today: TODAY });
    const overdue = priority.factors.find((factor) => factor.code === 'overdue');

    expect(overdue?.value).toBe(3);
    expect(priority.level).toBe('high');
  });

  it('scores a task due today above one due later this week', () => {
    const dueToday = resolveTaskPriority(makeTask({ dueDate: TODAY }), { today: TODAY });
    const dueLater = resolveTaskPriority(makeTask({ dueDate: '2026-03-15' }), { today: TODAY });

    expect(dueToday.score).toBeGreaterThan(dueLater.score);
  });

  it('ignores a due date far in the future', () => {
    expect(codes(makeTask({ dueDate: '2026-06-01' }))).toEqual([]);
  });

  it('adds weight and difficulty factors', () => {
    const task = makeTask({ dueDate: TODAY, academicWeight: 30, difficulty: 'hard' });
    expect(codes(task)).toContain('heavy_weight');
    expect(codes(task)).toContain('high_difficulty');
  });

  it('flags barely started work only when the deadline is close', () => {
    expect(codes(makeTask({ dueDate: '2026-03-11', progress: 5 }))).toContain('barely_started');
    expect(codes(makeTask({ dueDate: '2026-03-16', progress: 5 }))).not.toContain('barely_started');
  });

  it('accounts for a nearby assessment in the same subject', () => {
    expect(codes(makeTask({ dueDate: TODAY }), 2)).toContain('assessment_nearby');
    expect(codes(makeTask({ dueDate: TODAY }), 20)).not.toContain('assessment_nearby');
  });

  it('caps the score at 100', () => {
    const task = makeTask({
      dueDate: '2026-01-01',
      academicWeight: 100,
      difficulty: 'hard',
      progress: 0,
    });
    expect(resolveTaskPriority(task, { today: TODAY, daysToNextAssessment: 1 }).score).toBe(100);
  });
});

describe('sortTasksByPriority', () => {
  it('puts the most urgent task first and finished work last', () => {
    const sorted = sortTasksByPriority(
      [
        makeTask({ id: 'later' as TaskId, dueDate: '2026-03-20' }),
        makeTask({ id: 'done' as TaskId, status: 'done', dueDate: '2026-03-01' }),
        makeTask({ id: 'overdue' as TaskId, dueDate: '2026-03-05' }),
      ],
      { today: TODAY },
    );

    expect(sorted.map((entry) => entry.task.id)).toEqual(['overdue', 'later', 'done']);
  });

  it('breaks ties on the earlier due date', () => {
    const sorted = sortTasksByPriority(
      [
        makeTask({ id: 'second' as TaskId, dueDate: '2026-03-12' }),
        makeTask({ id: 'first' as TaskId, dueDate: '2026-03-11' }),
      ],
      { today: TODAY },
    );

    expect(sorted[0]?.task.id).toBe('first');
  });
});

describe('isOverdue', () => {
  it('only counts unfinished work past its due date', () => {
    expect(isOverdue(makeTask({ dueDate: '2026-03-09' }), TODAY)).toBe(true);
    expect(isOverdue(makeTask({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(makeTask({ dueDate: '2026-03-09', status: 'submitted' }), TODAY)).toBe(false);
    expect(isOverdue(makeTask({ dueDate: null }), TODAY)).toBe(false);
  });
});
