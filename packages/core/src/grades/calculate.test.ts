import { describe, expect, it } from 'vitest';
import type { Assessment, AssessmentId, Grade, GradeId, SubjectId, UserId } from '@pulse/types';
import {
  calculateRequiredGrade,
  simulateFinalPoints,
  summarizeGrades,
  weightsAreComplete,
  type GradedAssessment,
} from './calculate';

const NOW = '2026-03-01T00:00:00.000Z';

function assessment(id: string, maxPoints: number | null): Assessment {
  return {
    id: id as AssessmentId,
    userId: 'user-1' as UserId,
    subjectId: 'subject-1' as SubjectId,
    gradeCategoryId: null,
    classSessionId: null,
    title: id,
    type: 'exam',
    date: null,
    maxPoints,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function grade(assessmentId: string, earned: number, possible: number): Grade {
  return {
    id: `grade-${assessmentId}` as GradeId,
    assessmentId: assessmentId as AssessmentId,
    pointsEarned: earned,
    pointsPossible: possible,
    recordedAt: NOW,
  };
}

function entry(id: string, maxPoints: number | null, earned?: number): GradedAssessment {
  return {
    assessment: assessment(id, maxPoints),
    grade: earned === undefined ? null : grade(id, earned, maxPoints ?? 0),
  };
}

describe('summarizeGrades', () => {
  it('reports no grades before anything is recorded', () => {
    expect(summarizeGrades([entry('a', 30)]).status).toBe('no_grades');
  });

  it('totals earned, graded and remaining points', () => {
    const summary = summarizeGrades([entry('a', 30, 24), entry('b', 30), entry('c', 40)]);

    expect(summary.status).toBe('known');
    if (summary.status === 'no_grades') throw new Error('expected a computed summary');
    expect(summary.pointsEarned).toBe(24);
    expect(summary.pointsGraded).toBe(30);
    expect(summary.pointsRemaining).toBe(70);
    expect(summary.gradedPercentage).toBe(80);
  });

  it('marks the summary partial when an assessment has no total', () => {
    const summary = summarizeGrades([entry('a', 30, 24), entry('b', null)]);

    expect(summary.status).toBe('partial');
    if (summary.status === 'no_grades') throw new Error('expected a computed summary');
    expect(summary.assessmentsWithUnknownTotal).toBe(1);
  });
});

describe('calculateRequiredGrade', () => {
  it('reports the points still needed and the share of what is left', () => {
    const result = calculateRequiredGrade([entry('a', 30, 18), entry('b', 70)], 60);

    expect(result.status).toBe('reachable');
    if (result.status !== 'reachable') return;
    expect(result.pointsNeeded).toBe(42);
    expect(result.pointsRemaining).toBe(70);
    expect(result.percentageNeeded).toBeCloseTo(60);
  });

  it('reports the target as secured once enough points are banked', () => {
    const result = calculateRequiredGrade([entry('a', 70, 65), entry('b', 30)], 60);
    expect(result.status).toBe('secured');
  });

  it('reports unreachable when perfect remaining work still falls short', () => {
    const result = calculateRequiredGrade([entry('a', 70, 10), entry('b', 30)], 60);

    expect(result.status).toBe('unreachable');
    if (result.status !== 'unreachable') return;
    expect(result.pointsNeeded).toBe(50);
    expect(result.pointsRemaining).toBe(30);
  });

  it('refuses to answer when an assessment total is unknown', () => {
    const result = calculateRequiredGrade([entry('a', 30, 18), entry('b', null)], 60);

    expect(result.status).toBe('unknown');
    if (result.status !== 'unknown') return;
    expect(result.reason).toBe('unknown_totals');
  });

  it('refuses to answer with no assessments at all', () => {
    const result = calculateRequiredGrade([], 60);
    expect(result.status).toBe('unknown');
    if (result.status !== 'unknown') return;
    expect(result.reason).toBe('no_assessments');
  });

  it('reports nothing remaining when the target is missed and all work is graded', () => {
    const result = calculateRequiredGrade([entry('a', 100, 40)], 60);

    expect(result.status).toBe('unknown');
    if (result.status !== 'unknown') return;
    expect(result.reason).toBe('nothing_remaining');
  });

  it('handles a target before any grade exists', () => {
    const result = calculateRequiredGrade([entry('a', 100)], 60);

    expect(result.status).toBe('reachable');
    if (result.status !== 'reachable') return;
    expect(result.pointsNeeded).toBe(60);
    expect(result.pointsRemaining).toBe(100);
  });
});

describe('simulateFinalPoints', () => {
  it('projects the total from an assumed score on remaining work', () => {
    expect(simulateFinalPoints([entry('a', 30, 24), entry('b', 70)], 80)).toBe(80);
  });

  it('returns null when a total is unknown', () => {
    expect(simulateFinalPoints([entry('a', 30, 24), entry('b', null)], 80)).toBeNull();
  });
});

describe('weightsAreComplete', () => {
  it('requires the weights to total 100', () => {
    expect(weightsAreComplete([40, 35, 25])).toBe(true);
    expect(weightsAreComplete([40, 35])).toBe(false);
    expect(weightsAreComplete([])).toBe(false);
  });
});
