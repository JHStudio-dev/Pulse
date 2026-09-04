import type { Assessment, AssessmentId, Grade } from '@pulse/types';

/**
 * Grade calculation.
 *
 * The spec is explicit that Pulse must not show false precision. Whenever a
 * weight or an assessment total is missing, these functions report that the
 * figure is incomplete instead of returning a number that looks authoritative.
 */

export interface GradedAssessment {
  assessment: Assessment;
  grade: Grade | null;
}

export type GradeSummary =
  | {
      status: 'no_grades';
      pointsEarned: 0;
      pointsGraded: 0;
    }
  | {
      status: 'known' | 'partial';
      /** Points obtained so far. */
      pointsEarned: number;
      /** Points available in the work already graded. */
      pointsGraded: number;
      /** Points still available in ungraded assessments with a known total. */
      pointsRemaining: number;
      /** Ungraded assessments whose total is unknown. */
      assessmentsWithUnknownTotal: number;
      /** Percentage of the graded work earned so far. */
      gradedPercentage: number;
    };

export function summarizeGrades(entries: readonly GradedAssessment[]): GradeSummary {
  let pointsEarned = 0;
  let pointsGraded = 0;
  let pointsRemaining = 0;
  let assessmentsWithUnknownTotal = 0;

  for (const { assessment, grade } of entries) {
    if (grade) {
      pointsEarned += grade.pointsEarned;
      pointsGraded += grade.pointsPossible;
      continue;
    }
    if (assessment.maxPoints === null) {
      assessmentsWithUnknownTotal += 1;
    } else {
      pointsRemaining += assessment.maxPoints;
    }
  }

  if (pointsGraded === 0) {
    return { status: 'no_grades', pointsEarned: 0, pointsGraded: 0 };
  }

  return {
    status: assessmentsWithUnknownTotal > 0 ? 'partial' : 'known',
    pointsEarned,
    pointsGraded,
    pointsRemaining,
    assessmentsWithUnknownTotal,
    gradedPercentage: (pointsEarned / pointsGraded) * 100,
  };
}

export type RequiredGrade =
  | {
      /** Enough points are already banked to pass regardless of what is left. */
      status: 'secured';
    }
  | {
      /** The target is still reachable; `pointsNeeded` come from remaining work. */
      status: 'reachable';
      pointsNeeded: number;
      pointsRemaining: number;
      /** Share of the remaining points required, 0-100. */
      percentageNeeded: number;
    }
  | {
      /** Even a perfect score on everything left falls short. */
      status: 'unreachable';
      pointsNeeded: number;
      pointsRemaining: number;
    }
  | {
      /** Not enough information to answer honestly. */
      status: 'unknown';
      reason: 'no_assessments' | 'unknown_totals' | 'nothing_remaining';
    };

/**
 * Points still needed on ungraded work to finish at `targetPoints`.
 *
 * An assessment with no total makes the answer unknowable, so it is reported
 * rather than silently dropped from the denominator.
 */
export function calculateRequiredGrade(
  entries: readonly GradedAssessment[],
  targetPoints: number,
): RequiredGrade {
  if (entries.length === 0) {
    return { status: 'unknown', reason: 'no_assessments' };
  }

  const summary = summarizeGrades(entries);
  const pointsEarned = summary.status === 'no_grades' ? 0 : summary.pointsEarned;

  const unknownTotals =
    summary.status === 'no_grades'
      ? entries.filter((entry) => !entry.grade && entry.assessment.maxPoints === null).length
      : summary.assessmentsWithUnknownTotal;

  if (unknownTotals > 0) {
    return { status: 'unknown', reason: 'unknown_totals' };
  }

  const pointsRemaining =
    summary.status === 'no_grades'
      ? entries.reduce((total, entry) => total + (entry.assessment.maxPoints ?? 0), 0)
      : summary.pointsRemaining;

  const pointsNeeded = targetPoints - pointsEarned;

  if (pointsNeeded <= 0) {
    return { status: 'secured' };
  }
  if (pointsRemaining === 0) {
    return { status: 'unknown', reason: 'nothing_remaining' };
  }
  if (pointsNeeded > pointsRemaining) {
    return { status: 'unreachable', pointsNeeded, pointsRemaining };
  }

  return {
    status: 'reachable',
    pointsNeeded,
    pointsRemaining,
    percentageNeeded: (pointsNeeded / pointsRemaining) * 100,
  };
}

/** Projects the final standing if remaining work scores `assumedPercentage`. */
export function simulateFinalPoints(
  entries: readonly GradedAssessment[],
  assumedPercentage: number,
): number | null {
  const summary = summarizeGrades(entries);
  if (summary.status === 'no_grades') {
    const total = entries.reduce((sum, entry) => sum + (entry.assessment.maxPoints ?? 0), 0);
    const unknown = entries.some((entry) => entry.assessment.maxPoints === null);
    return unknown ? null : total * (assumedPercentage / 100);
  }
  if (summary.assessmentsWithUnknownTotal > 0) return null;

  return summary.pointsEarned + summary.pointsRemaining * (assumedPercentage / 100);
}

/** Weights must total 100 before a weighted average means anything. */
export function weightsAreComplete(weights: readonly number[]): boolean {
  if (weights.length === 0) return false;
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return Math.abs(total - 100) < 0.01;
}

export function indexGradesByAssessment(grades: readonly Grade[]): Map<AssessmentId, Grade> {
  return new Map(grades.map((grade) => [grade.assessmentId, grade]));
}
