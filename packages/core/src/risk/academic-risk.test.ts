import { describe, expect, it } from 'vitest';
import { calculateAcademicRisk, topRiskSignals, type RiskInput } from './academic-risk.js';

const baseline: RiskInput = {
  today: '2026-03-10',
  overdueTaskCount: 0,
  daysToNextAssessment: null,
  gradedPercentage: null,
  passingPercentage: null,
  requiredGrade: null,
  missedSessionCount: 0,
  unrecoveredSessionCount: 0,
};

const codes = (input: Partial<RiskInput>) =>
  calculateAcademicRisk({ ...baseline, ...input }).signals.map((signal) => signal.code);

describe('calculateAcademicRisk', () => {
  it('reports no risk when nothing is wrong', () => {
    const risk = calculateAcademicRisk(baseline);

    expect(risk.score).toBe(0);
    expect(risk.level).toBe('none');
    expect(risk.signals).toEqual([]);
  });

  it('counts overdue tasks and keeps the number for display', () => {
    const risk = calculateAcademicRisk({ ...baseline, overdueTaskCount: 2 });
    const signal = risk.signals.find((entry) => entry.code === 'overdue_tasks');

    expect(signal?.value).toBe(2);
    expect(risk.level).toBe('medium');
  });

  it('weighs a nearer assessment more heavily', () => {
    const soon = calculateAcademicRisk({ ...baseline, daysToNextAssessment: 1 });
    const later = calculateAcademicRisk({ ...baseline, daysToNextAssessment: 6 });

    expect(soon.score).toBeGreaterThan(later.score);
  });

  it('ignores an assessment further out than a week', () => {
    expect(codes({ daysToNextAssessment: 14 })).toEqual([]);
  });

  it('flags a standing below the passing mark', () => {
    const risk = calculateAcademicRisk({
      ...baseline,
      gradedPercentage: 48,
      passingPercentage: 60,
    });
    const signal = risk.signals.find((entry) => entry.code === 'below_passing');

    expect(signal?.value).toBe(12);
  });

  it('stays quiet when the standing is above the passing mark', () => {
    expect(codes({ gradedPercentage: 80, passingPercentage: 60 })).toEqual([]);
  });

  it('treats an unreachable target as high risk on its own', () => {
    const risk = calculateAcademicRisk({
      ...baseline,
      requiredGrade: { status: 'unreachable', pointsNeeded: 50, pointsRemaining: 30 },
    });

    expect(risk.signals.map((signal) => signal.code)).toContain('target_unreachable');
    expect(risk.level).toBe('high');
  });

  it('does not flag a reachable target', () => {
    expect(
      codes({
        requiredGrade: {
          status: 'reachable',
          pointsNeeded: 20,
          pointsRemaining: 40,
          percentageNeeded: 50,
        },
      }),
    ).toEqual([]);
  });

  it('counts missed and unrecovered sessions separately', () => {
    const signals = codes({ missedSessionCount: 2, unrecoveredSessionCount: 1 });

    expect(signals).toContain('missed_sessions');
    expect(signals).toContain('unrecovered_sessions');
  });

  it('caps the score at 100', () => {
    const risk = calculateAcademicRisk({
      ...baseline,
      overdueTaskCount: 10,
      daysToNextAssessment: 0,
      gradedPercentage: 10,
      passingPercentage: 60,
      requiredGrade: { status: 'unreachable', pointsNeeded: 90, pointsRemaining: 10 },
      missedSessionCount: 8,
      unrecoveredSessionCount: 8,
    });

    expect(risk.score).toBe(100);
    expect(risk.level).toBe('high');
  });
});

describe('topRiskSignals', () => {
  it('returns the strongest signals first', () => {
    const risk = calculateAcademicRisk({
      ...baseline,
      overdueTaskCount: 3,
      missedSessionCount: 1,
      daysToNextAssessment: 6,
    });

    const top = topRiskSignals(risk, 2);
    expect(top).toHaveLength(2);
    expect(top[0]!.points).toBeGreaterThanOrEqual(top[1]!.points);
  });
});
