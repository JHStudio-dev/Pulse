import type { IsoDate } from '@pulse/types';
import type { RequiredGrade } from '../grades/calculate.js';

/**
 * Academic risk.
 *
 * Deterministic by design: the spec rules out a black-box score. Each signal is
 * returned with the number behind it so the interface can say "2 overdue tasks
 * and an exam in 4 days" instead of just "high risk".
 */

export type RiskSignalCode =
  | 'overdue_tasks'
  | 'assessment_soon'
  | 'below_passing'
  | 'target_unreachable'
  | 'missed_sessions'
  | 'unrecovered_sessions';

export interface RiskSignal {
  code: RiskSignalCode;
  points: number;
  value?: number;
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface AcademicRisk {
  score: number;
  level: RiskLevel;
  signals: RiskSignal[];
}

export interface RiskInput {
  today: IsoDate;
  overdueTaskCount: number;
  /** Days until the next assessment, or null when none is scheduled. */
  daysToNextAssessment: number | null;
  /** Current standing as a percentage of graded work, when known. */
  gradedPercentage: number | null;
  /** Passing mark on the same percentage scale. */
  passingPercentage: number | null;
  requiredGrade: RequiredGrade | null;
  missedSessionCount: number;
  unrecoveredSessionCount: number;
}

const LEVEL_THRESHOLDS: ReadonlyArray<[RiskLevel, number]> = [
  ['high', 60],
  ['medium', 35],
  ['low', 15],
];

function levelFor(score: number): RiskLevel {
  for (const [level, threshold] of LEVEL_THRESHOLDS) {
    if (score >= threshold) return level;
  }
  return 'none';
}

export function calculateAcademicRisk(input: RiskInput): AcademicRisk {
  const signals: RiskSignal[] = [];

  if (input.overdueTaskCount > 0) {
    signals.push({
      code: 'overdue_tasks',
      points: Math.min(12 + input.overdueTaskCount * 12, 40),
      value: input.overdueTaskCount,
    });
  }

  if (input.daysToNextAssessment !== null && input.daysToNextAssessment <= 7) {
    signals.push({
      code: 'assessment_soon',
      points: Math.max(18 - input.daysToNextAssessment * 2, 6),
      value: input.daysToNextAssessment,
    });
  }

  if (input.gradedPercentage !== null && input.passingPercentage !== null) {
    const gap = input.passingPercentage - input.gradedPercentage;
    if (gap > 0) {
      signals.push({
        code: 'below_passing',
        points: Math.min(20 + Math.round(gap), 40),
        value: Math.round(gap * 100) / 100,
      });
    }
  }

  // Dominant on its own: no combination of remaining work reaches the target,
  // so this alone has to clear the high threshold.
  if (input.requiredGrade?.status === 'unreachable') {
    signals.push({ code: 'target_unreachable', points: 60 });
  }

  if (input.missedSessionCount > 0) {
    signals.push({
      code: 'missed_sessions',
      points: Math.min(input.missedSessionCount * 5, 20),
      value: input.missedSessionCount,
    });
  }

  if (input.unrecoveredSessionCount > 0) {
    signals.push({
      code: 'unrecovered_sessions',
      points: Math.min(input.unrecoveredSessionCount * 6, 24),
      value: input.unrecoveredSessionCount,
    });
  }

  const score = Math.min(
    signals.reduce((total, signal) => total + signal.points, 0),
    100,
  );

  return { score, level: levelFor(score), signals };
}

/** Strongest signals first, for interfaces that show only the top reasons. */
export function topRiskSignals(risk: AcademicRisk, limit = 2): RiskSignal[] {
  return [...risk.signals].sort((a, b) => b.points - a.points).slice(0, limit);
}
