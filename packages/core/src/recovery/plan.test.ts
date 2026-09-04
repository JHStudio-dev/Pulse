import { describe, expect, it } from 'vitest';
import type {
  Attendance,
  AttendanceStatus,
  RecoveryPlan,
  RecoveryPlanId,
  UserId,
} from '@pulse/types';
import { makeSession } from '../testing/factories.js';
import {
  buildRecoveryPlan,
  countUnrecovered,
  deriveRecoveryStatus,
  needsRecovery,
} from './plan.js';

const NOW = '2026-03-02T16:00:00.000Z';

function attendance(status: AttendanceStatus): Attendance {
  return {
    classSessionId: makeSession().id,
    status,
    note: null,
    recordedAt: NOW,
  };
}

describe('needsRecovery', () => {
  it('covers missed and partial attendance only', () => {
    expect(needsRecovery(attendance('missed'))).toBe(true);
    expect(needsRecovery(attendance('partial'))).toBe(true);
    expect(needsRecovery(attendance('attended'))).toBe(false);
    expect(needsRecovery(attendance('cancelled'))).toBe(false);
    expect(needsRecovery(null)).toBe(false);
  });
});

describe('buildRecoveryPlan', () => {
  it('builds the full step list for a missed class', () => {
    const plan = buildRecoveryPlan(makeSession(), attendance('missed'));

    expect(plan?.items.map((item) => item.kind)).toEqual([
      'review_material',
      'get_notes',
      'confirm_topics',
      'check_new_dates',
      'practice',
      'ask_question',
    ]);
  });

  it('builds a shorter list when the student was partially present', () => {
    const plan = buildRecoveryPlan(makeSession(), attendance('partial'));

    expect(plan?.items.map((item) => item.kind)).toEqual([
      'review_material',
      'get_notes',
      'confirm_topics',
      'check_new_dates',
    ]);
  });

  it('numbers the steps from zero in order', () => {
    const plan = buildRecoveryPlan(makeSession(), attendance('missed'));
    expect(plan?.items.map((item) => item.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('creates nothing for an attended class', () => {
    expect(buildRecoveryPlan(makeSession(), attendance('attended'))).toBeNull();
  });

  it('creates nothing when the class itself was cancelled', () => {
    const cancelled = makeSession({ status: 'cancelled' });
    expect(buildRecoveryPlan(cancelled, attendance('missed'))).toBeNull();
  });
});

describe('deriveRecoveryStatus', () => {
  it('moves from pending through recovering to recovered', () => {
    expect(deriveRecoveryStatus([{ done: false }, { done: false }])).toBe('pending');
    expect(deriveRecoveryStatus([{ done: true }, { done: false }])).toBe('recovering');
    expect(deriveRecoveryStatus([{ done: true }, { done: true }])).toBe('recovered');
  });

  it('treats an empty plan as pending', () => {
    expect(deriveRecoveryStatus([])).toBe('pending');
  });
});

describe('countUnrecovered', () => {
  it('counts every plan that is not finished', () => {
    const plan = (status: RecoveryPlan['status']): RecoveryPlan => ({
      id: 'plan' as RecoveryPlanId,
      userId: 'user-1' as UserId,
      classSessionId: makeSession().id,
      status,
      createdAt: NOW,
      completedAt: null,
    });

    expect(countUnrecovered([plan('pending'), plan('recovering'), plan('recovered')])).toBe(2);
  });
});
