import type {
  CampusConnectionId,
  CampusSyncDiffState,
  CampusSyncItemId,
  DocumentId,
  TaskId,
  CampusSubjectLink,
  CampusSubjectLinkId,
  CampusSyncItem,
  CampusSyncItemInput,
  CampusSyncRun,
  CampusSyncRunId,
  CampusSyncSummary,
  SubjectId,
  UserId,
} from '@pulse/types';
import { DatabaseError } from '../ports/errors';
import type { CampusSyncRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toCampusSubjectLink, toCampusSyncItem, toCampusSyncRun } from './mappers';
import type { CampusSubjectLinkRow, CampusSyncItemRow, CampusSyncRunRow } from './rows';

const SUBJECT_LINKS = 'campus_subject_links';
const RUNS = 'campus_sync_runs';
const ITEMS = 'campus_sync_items';

function summaryRow(summary: CampusSyncSummary) {
  return {
    discovered_count: summary.discoveredCount,
    new_count: summary.newCount,
    changed_count: summary.changedCount,
    unchanged_count: summary.unchangedCount,
    ignored_count: summary.ignoredCount,
  };
}

/** Keeps each id list well inside request URL limits. */
const ID_BATCH = 100;

const EMPTY_SUMMARY: CampusSyncSummary = {
  discoveredCount: 0,
  newCount: 0,
  changedCount: 0,
  unchangedCount: 0,
  ignoredCount: 0,
};

export function createCampusSyncRepository(client: PulseSupabaseClient): CampusSyncRepository {
  return {
    async listSubjectLinks(userId: UserId): Promise<CampusSubjectLink[]> {
      const { data, error } = await client
        .from(SUBJECT_LINKS)
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) throw translateError(error);
      return (data as CampusSubjectLinkRow[]).map(toCampusSubjectLink);
    },

    async findSubjectLink(
      userId: UserId,
      campusConnectionId: CampusConnectionId,
      externalCourseId: string,
      externalSessionId: string | null,
    ): Promise<CampusSubjectLink | null> {
      let query = client
        .from(SUBJECT_LINKS)
        .select('*')
        .eq('user_id', userId)
        .eq('campus_connection_id', campusConnectionId)
        .eq('external_course_id', externalCourseId);

      query =
        externalSessionId === null
          ? query.is('external_session_id', null)
          : query.eq('external_session_id', externalSessionId);

      const { data, error } = await query.maybeSingle();
      if (error) throw translateError(error);
      return data ? toCampusSubjectLink(data as CampusSubjectLinkRow) : null;
    },

    async upsertSubjectLink(
      userId: UserId,
      input: {
        campusConnectionId: CampusConnectionId;
        subjectId: SubjectId;
        externalCourseId: string;
        externalSessionId: string | null;
      },
    ): Promise<CampusSubjectLink> {
      const existing = await this.findSubjectLink(
        userId,
        input.campusConnectionId,
        input.externalCourseId,
        input.externalSessionId,
      );

      if (existing) {
        const { data, error } = await client
          .from(SUBJECT_LINKS)
          .update({ subject_id: input.subjectId })
          .eq('user_id', userId)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw translateError(error);
        return toCampusSubjectLink(data as CampusSubjectLinkRow);
      }

      const { data, error } = await client
        .from(SUBJECT_LINKS)
        .insert({
          user_id: userId,
          campus_connection_id: input.campusConnectionId,
          subject_id: input.subjectId,
          external_course_id: input.externalCourseId,
          external_session_id: input.externalSessionId,
        })
        .select()
        .single();

      if (error) throw translateError(error);
      return toCampusSubjectLink(data as CampusSubjectLinkRow);
    },

    async updateSubjectLink(
      userId: UserId,
      id: CampusSubjectLinkId,
      changes: { subjectId: SubjectId; externalSessionId: string | null },
    ): Promise<CampusSubjectLink> {
      const { data, error } = await client
        .from(SUBJECT_LINKS)
        .update({ subject_id: changes.subjectId, external_session_id: changes.externalSessionId })
        .eq('user_id', userId)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Campus subject link ${id} not found`);
      return toCampusSubjectLink(data as CampusSubjectLinkRow);
    },

    async startRun(userId: UserId, subjectLinkId: CampusSubjectLinkId): Promise<CampusSyncRun> {
      const { data, error } = await client
        .from(RUNS)
        .insert({ user_id: userId, subject_link_id: subjectLinkId })
        .select()
        .single();

      if (error) throw translateError(error);
      return toCampusSyncRun(data as CampusSyncRunRow);
    },

    async listItems(userId: UserId, subjectLinkId: CampusSubjectLinkId): Promise<CampusSyncItem[]> {
      const { data, error } = await client
        .from(ITEMS)
        .select('*')
        .eq('user_id', userId)
        .eq('campus_subject_link_id', subjectLinkId)
        .order('kind')
        .order('external_id');

      if (error) throw translateError(error);
      return (data as CampusSyncItemRow[]).map(toCampusSyncItem);
    },

    async dismissAppliedTasks(userId: UserId, taskIds: readonly TaskId[]): Promise<void> {
      for (let start = 0; start < taskIds.length; start += ID_BATCH) {
        const { error } = await client
          .from(ITEMS)
          .update({ dismissed_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('kind', 'assignment')
          .in('applied_task_id', taskIds.slice(start, start + ID_BATCH));

        if (error) throw translateError(error);
      }
    },

    async listDismissedItems(userId: UserId): Promise<CampusSyncItem[]> {
      const { data, error } = await client
        .from(ITEMS)
        .select('*')
        .eq('user_id', userId)
        .not('dismissed_at', 'is', null)
        .is('applied_task_id', null)
        .order('dismissed_at', { ascending: false });

      if (error) throw translateError(error);
      return (data as CampusSyncItemRow[]).map(toCampusSyncItem);
    },

    async restoreDismissedItem(userId: UserId, itemId: CampusSyncItemId): Promise<CampusSyncItem> {
      const { data, error } = await client
        .from(ITEMS)
        .update({ dismissed_at: null })
        .eq('user_id', userId)
        .eq('id', itemId)
        .not('dismissed_at', 'is', null)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Dismissed campus item ${itemId} not found`);
      return toCampusSyncItem(data as CampusSyncItemRow);
    },

    async listAppliedTasks(
      userId: UserId,
    ): Promise<Array<{ taskId: TaskId; sourceUrl: string | null }>> {
      const { data, error } = await client
        .from(ITEMS)
        .select('applied_task_id, source_url')
        .eq('user_id', userId)
        .not('applied_task_id', 'is', null);

      if (error) throw translateError(error);
      return (data as Array<{ applied_task_id: string; source_url: string | null }>).map((row) => ({
        taskId: row.applied_task_id as TaskId,
        sourceUrl: row.source_url,
      }));
    },

    async upsertItem(
      userId: UserId,
      subjectLinkId: CampusSubjectLinkId,
      runId: CampusSyncRunId,
      item: CampusSyncItemInput,
      state: CampusSyncDiffState,
    ): Promise<CampusSyncItem> {
      const now = new Date().toISOString();
      const change =
        state === 'unchanged'
          ? {}
          : {
              last_change_kind: state,
              last_changed_at: now,
            };

      const { data, error } = await client
        .from(ITEMS)
        .upsert(
          {
            user_id: userId,
            campus_subject_link_id: subjectLinkId,
            last_sync_run_id: runId,
            kind: item.kind,
            external_id: item.externalId,
            source_url: item.sourceUrl,
            content_hash: item.contentHash,
            payload: item.payload,
            last_seen_at: now,
            ...change,
          },
          { onConflict: 'user_id,campus_subject_link_id,kind,external_id' },
        )
        .select()
        .single();

      if (error) throw translateError(error);
      return toCampusSyncItem(data as CampusSyncItemRow);
    },

    async markTaskApplied(
      userId: UserId,
      itemId: CampusSyncItemId,
      taskId: TaskId,
    ): Promise<CampusSyncItem> {
      const { data, error } = await client
        .from(ITEMS)
        .update({
          applied_task_id: taskId,
          applied_document_id: null,
          applied_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', itemId)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Campus sync item ${itemId} not found`);
      return toCampusSyncItem(data as CampusSyncItemRow);
    },

    async markDocumentApplied(
      userId: UserId,
      itemId: CampusSyncItemId,
      documentId: DocumentId,
    ): Promise<CampusSyncItem> {
      const { data, error } = await client
        .from(ITEMS)
        .update({
          applied_task_id: null,
          applied_document_id: documentId,
          applied_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', itemId)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Campus sync item ${itemId} not found`);
      return toCampusSyncItem(data as CampusSyncItemRow);
    },

    async completeRun(
      userId: UserId,
      runId: CampusSyncRunId,
      summary: CampusSyncSummary,
    ): Promise<CampusSyncRun> {
      const { data, error } = await client
        .from(RUNS)
        .update({
          ...summaryRow(summary),
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('user_id', userId)
        .eq('id', runId)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Campus sync run ${runId} not found`);
      return toCampusSyncRun(data as CampusSyncRunRow);
    },

    async failRun(
      userId: UserId,
      runId: CampusSyncRunId,
      errorMessage: string,
      summary: CampusSyncSummary = EMPTY_SUMMARY,
    ): Promise<CampusSyncRun> {
      const { data, error } = await client
        .from(RUNS)
        .update({
          ...summaryRow(summary),
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq('user_id', userId)
        .eq('id', runId)
        .select()
        .maybeSingle();

      if (error) throw translateError(error);
      if (!data) throw new DatabaseError('not_found', `Campus sync run ${runId} not found`);
      return toCampusSyncRun(data as CampusSyncRunRow);
    },
  };
}
