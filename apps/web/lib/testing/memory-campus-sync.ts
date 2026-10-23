import type {
  AcademicPeriod,
  AcademicPeriodId,
  CampusConnection,
  CampusConnectionId,
  CampusInstanceId,
  CampusSubjectLink,
  CampusSubjectLinkId,
  CampusSyncItem,
  CampusSyncItemId,
  CampusSyncRun,
  CampusSyncRunId,
  DocumentId,
  DocumentRecord,
  Subject,
  SubjectId,
  SubjectSchedule,
  SubjectScheduleId,
  Task,
  TaskId,
  UserId,
} from '@pulse/types';
import type { TaskRepository } from '@pulse/database';
import type { CampusSyncIngestRepositories } from '../campus-sync-ingest';

/**
 * In-memory stand-ins for the repositories Campus Sync writes through.
 *
 * They mirror the parts of the database the sync relies on: owner scoping,
 * item upserts keyed by external id, and applied targets cleared when the
 * task or document behind them is deleted.
 */

const NOW = '2026-10-01T12:00:00.000Z';
let sequence = 0;

function nextId<T>(prefix: string): T {
  sequence += 1;
  return `${prefix}-${sequence}` as T;
}

function notFound(what: string): Error {
  return new Error(`${what} not found`);
}

export interface MemoryCampusSyncState {
  periods: AcademicPeriod[];
  subjects: Subject[];
  connections: CampusConnection[];
  links: CampusSubjectLink[];
  runs: CampusSyncRun[];
  items: CampusSyncItem[];
  tasks: Task[];
  documents: DocumentRecord[];
  schedules: Array<SubjectSchedule & { userId: UserId }>;
}

export const CAMPUS_INSTANCE = 'campus-ujcv' as CampusInstanceId;

export function makePeriod(
  userId: UserId,
  overrides: Partial<AcademicPeriod> = {},
): AcademicPeriod {
  return {
    id: nextId<AcademicPeriodId>('period'),
    userId,
    name: 'II Periodo 2026',
    range: { start: '2026-09-01', end: '2026-12-15' },
    status: 'active',
    timeZone: 'America/Tegucigalpa',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeSubject(
  userId: UserId,
  academicPeriodId: AcademicPeriodId,
  overrides: Partial<Subject> = {},
): Subject {
  return {
    id: nextId<SubjectId>('subject'),
    userId,
    academicPeriodId,
    campusInstanceId: CAMPUS_INSTANCE,
    name: 'Materia',
    code: null,
    professorName: null,
    professorContact: null,
    passingGrade: null,
    gradeScaleMax: 100,
    defaultModality: 'unconfirmed',
    defaultMeetingUrl: null,
    defaultLocation: { campus: null, building: null, room: null },
    travelBufferMinutes: null,
    color: null,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export type MemoryCampusSyncRepositories = CampusSyncIngestRepositories & {
  tasks: CampusSyncIngestRepositories['tasks'] & Pick<TaskRepository, 'removeMany'>;
};

export function createMemoryCampusSync(): {
  state: MemoryCampusSyncState;
  repositories: MemoryCampusSyncRepositories;
  addStudent(userId: UserId): { period: AcademicPeriod; connection: CampusConnection };
  /** A task vanishing outside Pulse's own actions, as the foreign key sees it. */
  deleteTask(id: TaskId): void;
} {
  const state: MemoryCampusSyncState = {
    periods: [],
    subjects: [],
    connections: [],
    links: [],
    runs: [],
    items: [],
    tasks: [],
    documents: [],
    schedules: [],
  };

  const own = <T extends { userId: UserId }>(rows: T[], userId: UserId) =>
    rows.filter((row) => row.userId === userId);

  function detachTasks(ids: readonly TaskId[]): void {
    state.tasks = state.tasks.filter((task) => !ids.includes(task.id));
    for (const item of state.items) {
      if (item.appliedTaskId && ids.includes(item.appliedTaskId)) item.appliedTaskId = null;
    }
  }

  const repositories: MemoryCampusSyncRepositories = {
    periods: {
      async findActive(userId) {
        return own(state.periods, userId).find((period) => period.status === 'active') ?? null;
      },
    },

    connections: {
      async findByUser(userId) {
        return own(state.connections, userId)[0] ?? null;
      },
      async markSyncSuccess(userId, id) {
        const connection = own(state.connections, userId).find((row) => row.id === id);
        if (!connection) throw notFound('Connection');
        return Object.assign(connection, { lastSyncedAt: NOW, lastError: null });
      },
      async markSyncError(userId, id, errorMessage) {
        const connection = own(state.connections, userId).find((row) => row.id === id);
        if (!connection) throw notFound('Connection');
        return Object.assign(connection, { lastError: errorMessage });
      },
    },

    subjects: {
      async findById(userId, id) {
        return own(state.subjects, userId).find((subject) => subject.id === id) ?? null;
      },
      async create(userId, input) {
        const subject: Subject = {
          ...input,
          id: nextId<SubjectId>('subject'),
          userId,
          createdAt: NOW,
          updatedAt: NOW,
        };
        state.subjects.push(subject);
        return subject;
      },
      async update(userId, id, changes) {
        const subject = own(state.subjects, userId).find((row) => row.id === id);
        if (!subject) throw notFound('Subject');
        return Object.assign(subject, changes);
      },
      async restore(userId, id) {
        const subject = own(state.subjects, userId).find((row) => row.id === id);
        if (!subject) throw notFound('Subject');
        return Object.assign(subject, { archivedAt: null });
      },
    },

    schedules: {
      async listBySubject(userId, subjectId) {
        return own(state.schedules, userId).filter((slot) => slot.subjectId === subjectId);
      },
      async create(userId, input) {
        const slot = {
          ...input,
          id: nextId<SubjectScheduleId>('schedule'),
          userId,
          createdAt: NOW,
          updatedAt: NOW,
        };
        state.schedules.push(slot);
        return slot;
      },
    },

    tasks: {
      async removeMany(userId, ids) {
        detachTasks(
          own(state.tasks, userId)
            .filter((task) => ids.includes(task.id))
            .map((task) => task.id),
        );
      },
      async findById(userId, id) {
        return own(state.tasks, userId).find((task) => task.id === id) ?? null;
      },
      async create(userId, input) {
        const task: Task = {
          ...input,
          id: nextId<TaskId>('task'),
          userId,
          createdAt: NOW,
          updatedAt: NOW,
        };
        state.tasks.push(task);
        return task;
      },
      async update(userId, id, changes) {
        const task = own(state.tasks, userId).find((row) => row.id === id);
        if (!task) throw notFound('Task');
        return Object.assign(task, changes);
      },
    },

    documents: {
      async findById(userId, id) {
        return own(state.documents, userId).find((document) => document.id === id) ?? null;
      },
      async create(userId, input) {
        const document: DocumentRecord = {
          ...input,
          id: nextId<DocumentId>('document'),
          userId,
          createdAt: NOW,
          updatedAt: NOW,
        };
        state.documents.push(document);
        return document;
      },
      async update(userId, id, changes) {
        const document = own(state.documents, userId).find((row) => row.id === id);
        if (!document) throw notFound('Document');
        return Object.assign(document, changes);
      },
    },

    campusSync: {
      async listSubjectLinks(userId) {
        return own(state.links, userId);
      },
      async findSubjectLink(
        userId,
        campusConnectionId,
        academicPeriodId,
        externalCourseId,
        externalSessionId,
      ) {
        return (
          own(state.links, userId).find(
            (link) =>
              link.campusConnectionId === campusConnectionId &&
              link.academicPeriodId === academicPeriodId &&
              link.externalCourseId === externalCourseId &&
              link.externalSessionId === externalSessionId,
          ) ?? null
        );
      },
      async upsertSubjectLink(userId, input) {
        const existing = await this.findSubjectLink(
          userId,
          input.campusConnectionId,
          input.academicPeriodId,
          input.externalCourseId,
          input.externalSessionId,
        );
        if (existing) return Object.assign(existing, { subjectId: input.subjectId });

        const duplicate = own(state.links, userId).some(
          (link) =>
            link.campusConnectionId === input.campusConnectionId &&
            link.academicPeriodId === input.academicPeriodId &&
            link.externalCourseId === input.externalCourseId &&
            (link.externalSessionId ?? '') === (input.externalSessionId ?? ''),
        );
        if (duplicate) throw new Error('duplicate key value violates unique constraint');

        const link: CampusSubjectLink = {
          ...input,
          id: nextId<CampusSubjectLinkId>('link'),
          userId,
          createdAt: NOW,
          updatedAt: NOW,
        };
        state.links.push(link);
        return link;
      },
      async updateSubjectLink(userId, id, changes) {
        const link = own(state.links, userId).find((row) => row.id === id);
        if (!link) throw notFound('Link');
        return Object.assign(link, changes);
      },
      async startRun(userId, subjectLinkId) {
        const run: CampusSyncRun = {
          id: nextId<CampusSyncRunId>('run'),
          userId,
          subjectLinkId,
          status: 'running',
          startedAt: NOW,
          completedAt: null,
          errorMessage: null,
          discoveredCount: 0,
          newCount: 0,
          changedCount: 0,
          unchangedCount: 0,
          ignoredCount: 0,
        };
        state.runs.push(run);
        return run;
      },
      async listItems(userId, subjectLinkId) {
        return own(state.items, userId).filter((item) => item.subjectLinkId === subjectLinkId);
      },
      async dismissAppliedTasks(userId, taskIds) {
        for (const item of own(state.items, userId)) {
          if (
            item.kind === 'assignment' &&
            item.appliedTaskId &&
            taskIds.includes(item.appliedTaskId)
          ) {
            item.dismissedAt = NOW;
          }
        }
      },
      async listDismissedItems(userId) {
        return own(state.items, userId).filter(
          (item) => item.dismissedAt !== null && item.appliedTaskId === null,
        );
      },
      async restoreDismissedItem(userId, itemId) {
        const item = own(state.items, userId).find(
          (row) => row.id === itemId && row.dismissedAt !== null,
        );
        if (!item) throw notFound('Dismissed item');
        return Object.assign(item, { dismissedAt: null });
      },
      async listAppliedTargets(userId) {
        return own(state.items, userId).flatMap((item) =>
          item.appliedTaskId || item.appliedDocumentId
            ? [
                {
                  taskId: item.appliedTaskId,
                  documentId: item.appliedDocumentId,
                  sourceUrl: item.sourceUrl,
                  removedAt: item.removedAt,
                },
              ]
            : [],
        );
      },
      async upsertItem(userId, subjectLinkId, runId, input, diff) {
        const change = diff === 'unchanged' ? {} : { lastChangeKind: diff, lastChangedAt: NOW };
        const existing = own(state.items, userId).find(
          (item) =>
            item.subjectLinkId === subjectLinkId &&
            item.kind === input.kind &&
            item.externalId === input.externalId,
        );

        if (existing) {
          return Object.assign(existing, {
            lastSyncRunId: runId,
            sourceUrl: input.sourceUrl,
            contentHash: input.contentHash,
            payload: input.payload,
            lastSeenAt: NOW,
            removedAt: null,
            ...change,
          });
        }

        const item: CampusSyncItem = {
          id: nextId<CampusSyncItemId>('item'),
          userId,
          subjectLinkId,
          lastSyncRunId: runId,
          kind: input.kind,
          externalId: input.externalId,
          sourceUrl: input.sourceUrl,
          contentHash: input.contentHash,
          payload: input.payload,
          firstSeenAt: NOW,
          lastSeenAt: NOW,
          lastChangeKind: null,
          lastChangedAt: null,
          appliedAt: null,
          appliedTaskId: null,
          appliedDocumentId: null,
          dismissedAt: null,
          removedAt: null,
          ...change,
        };
        state.items.push(item);
        return item;
      },
      async markMissingItemsRemoved(userId, subjectLinkId, runId, kinds) {
        for (const item of own(state.items, userId)) {
          if (
            item.subjectLinkId === subjectLinkId &&
            kinds.includes(item.kind) &&
            item.lastSyncRunId !== runId &&
            item.removedAt === null
          ) {
            item.removedAt = NOW;
          }
        }
      },
      async markTaskApplied(userId, itemId, taskId) {
        const item = own(state.items, userId).find((row) => row.id === itemId);
        if (!item) throw notFound('Item');
        return Object.assign(item, {
          appliedTaskId: taskId,
          appliedDocumentId: null,
          appliedAt: NOW,
        });
      },
      async markDocumentApplied(userId, itemId, documentId) {
        const item = own(state.items, userId).find((row) => row.id === itemId);
        if (!item) throw notFound('Item');
        return Object.assign(item, {
          appliedTaskId: null,
          appliedDocumentId: documentId,
          appliedAt: NOW,
        });
      },
      async completeRun(userId, runId, summary) {
        const run = own(state.runs, userId).find((row) => row.id === runId);
        if (!run) throw notFound('Run');
        return Object.assign(run, summary, { status: 'completed' as const, completedAt: NOW });
      },
      async failRun(userId, runId, errorMessage, summary) {
        const run = own(state.runs, userId).find((row) => row.id === runId);
        if (!run) throw notFound('Run');
        return Object.assign(run, summary ?? {}, {
          status: 'failed' as const,
          completedAt: NOW,
          errorMessage,
        });
      },
    },
  };

  return {
    state,
    repositories,
    addStudent(userId) {
      const period = makePeriod(userId);
      const connection: CampusConnection = {
        id: nextId<CampusConnectionId>('connection'),
        userId,
        campusInstanceId: CAMPUS_INSTANCE,
        status: 'connected',
        lastSyncedAt: null,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW,
      };

      state.periods.push(period);
      state.connections.push(connection);
      return { period, connection };
    },
    deleteTask(id) {
      detachTasks([id]);
    },
  };
}
