import type { CampusSyncDiffState, CampusSyncItem } from '@pulse/types';

type ApplyState = Pick<
  CampusSyncItem,
  'kind' | 'appliedTaskId' | 'appliedDocumentId' | 'dismissedAt'
>;

/**
 * A campus assignment the student removed on purpose.
 *
 * Both halves matter: the decision was recorded and the task is actually gone.
 * A recorded decision whose task still exists means the deletion never
 * completed, so the item keeps updating that task.
 */
export function isCampusItemDismissed(
  item: Pick<ApplyState, 'dismissedAt' | 'appliedTaskId'>,
): boolean {
  return item.dismissedAt !== null && item.appliedTaskId === null;
}

/**
 * Whether a synced item should be written into Pulse.
 *
 * New and changed items update their task or document. An unchanged item is
 * applied again only when its target is missing, which restores a task or
 * document that disappeared without the student asking. A dismissed task is
 * never recreated, whatever the campus does with it.
 */
export function campusItemNeedsApply(item: ApplyState, state: CampusSyncDiffState): boolean {
  if (item.kind === 'assignment' && isCampusItemDismissed(item)) return false;
  if (state !== 'unchanged') return true;
  if (item.kind === 'assignment') return item.appliedTaskId === null;
  if (item.kind === 'document') return item.appliedDocumentId === null;
  return false;
}
