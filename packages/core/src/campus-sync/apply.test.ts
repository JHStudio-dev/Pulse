import { describe, expect, it } from 'vitest';
import type { DocumentId, TaskId } from '@pulse/types';
import { campusItemNeedsApply, isCampusItemDismissed } from './apply';

const TASK = 'task-1' as TaskId;
const DOCUMENT = 'document-1' as DocumentId;
const DISMISSED = '2026-10-20T10:00:00.000Z';

function assignment(appliedTaskId: TaskId | null, dismissedAt: string | null = null) {
  return { kind: 'assignment' as const, appliedTaskId, appliedDocumentId: null, dismissedAt };
}

describe('applying campus items', () => {
  it('applies new and changed assignments', () => {
    expect(campusItemNeedsApply(assignment(null), 'new')).toBe(true);
    expect(campusItemNeedsApply(assignment(TASK), 'changed')).toBe(true);
  });

  it('leaves an unchanged assignment alone while its task exists', () => {
    expect(campusItemNeedsApply(assignment(TASK), 'unchanged')).toBe(false);
  });

  it('restores a task that disappeared without the student deciding it', () => {
    expect(campusItemNeedsApply(assignment(null), 'unchanged')).toBe(true);
  });

  it('never recreates a task the student deleted, even when the campus changes it', () => {
    expect(campusItemNeedsApply(assignment(null, DISMISSED), 'unchanged')).toBe(false);
    expect(campusItemNeedsApply(assignment(null, DISMISSED), 'changed')).toBe(false);
  });

  it('keeps updating a task whose deletion never completed', () => {
    expect(isCampusItemDismissed(assignment(TASK, DISMISSED))).toBe(false);
    expect(campusItemNeedsApply(assignment(TASK, DISMISSED), 'changed')).toBe(true);
  });

  it('treats documents by their own target only', () => {
    const document = { kind: 'document' as const, appliedTaskId: null, dismissedAt: null };
    expect(campusItemNeedsApply({ ...document, appliedDocumentId: DOCUMENT }, 'unchanged')).toBe(
      false,
    );
    expect(campusItemNeedsApply({ ...document, appliedDocumentId: null }, 'unchanged')).toBe(true);
  });

  it('only applies announcements and events when they change', () => {
    const announcement = {
      kind: 'announcement' as const,
      appliedTaskId: null,
      appliedDocumentId: null,
      dismissedAt: null,
    };
    expect(campusItemNeedsApply(announcement, 'unchanged')).toBe(false);
    expect(campusItemNeedsApply(announcement, 'changed')).toBe(true);
  });
});
