import type {
  CampusSyncItem,
  DocumentId,
  DocumentRecord,
  SubjectId,
  Task,
  TaskId,
  UserId,
} from '@pulse/types';
import type {
  CampusSyncRepository,
  DocumentRepository,
  TaskRepository,
} from '@pulse/database';

function payloadString(item: CampusSyncItem, key: string): string | null {
  const value = item.payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function payloadBoolean(item: CampusSyncItem, key: string): boolean | null {
  const value = item.payload[key];
  return typeof value === 'boolean' ? value : null;
}

function parseCampusDueAt(value: string | null): { dueDate: string | null; dueTime: string | null } {
  if (!value) return { dueDate: null, dueTime: null };

  const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!match) return { dueDate: null, dueTime: null };

  return {
    dueDate: match[1] ?? null,
    dueTime: match[2] ?? null,
  };
}

function parseCampusSize(value: string | null): number | null {
  if (!value) return null;

  const match = value.trim().match(/^(\d+(?:\.\d+)?)(B|KB|KIB|MB|MIB|GB|GIB)$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const unit = match[2]!.toUpperCase();
  const multiplier =
    unit === 'B'
      ? 1
      : unit === 'KB'
        ? 1_000
        : unit === 'KIB'
          ? 1_024
          : unit === 'MB'
            ? 1_000_000
            : unit === 'MIB'
              ? 1_048_576
              : unit === 'GB'
                ? 1_000_000_000
                : 1_073_741_824;

  return Math.round(amount * multiplier);
}

function inferMimeType(url: string | null): string | null {
  if (!url) return null;

  try {
    const pathname = new URL(url).pathname.toLowerCase();

    if (pathname.endsWith('.pdf')) return 'application/pdf';
    if (pathname.endsWith('.doc')) return 'application/msword';
    if (pathname.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (pathname.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
    if (pathname.endsWith('.pptx')) {
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }
    if (pathname.endsWith('.xls')) return 'application/vnd.ms-excel';
    if (pathname.endsWith('.xlsx')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (pathname.endsWith('.txt')) return 'text/plain';
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  } catch {
    return null;
  }

  return null;
}

async function applyAssignment(
  userId: UserId,
  subjectId: SubjectId,
  item: CampusSyncItem,
  tasks: TaskRepository,
  campusSync: CampusSyncRepository,
): Promise<void> {
  const title = payloadString(item, 'title');
  if (!title) return;

  const description = payloadString(item, 'description');
  const due = parseCampusDueAt(payloadString(item, 'dueAt'));
  const hasSubmission = payloadBoolean(item, 'hasSubmission') === true;

  const changes: Partial<Omit<Task, 'id' | 'userId'>> = {
    subjectId,
    title,
    description,
    dueDate: due.dueDate,
    dueTime: due.dueTime,
  };

  if (item.appliedTaskId) {
    const existing = await tasks.findById(userId, item.appliedTaskId);
    if (existing) {
      await tasks.update(userId, existing.id, changes);
      return;
    }
  }

  const created = await tasks.create(userId, {
    subjectId,
    title,
    description,
    assignedDate: null,
    dueDate: due.dueDate,
    dueTime: due.dueTime,
    status: hasSubmission ? 'submitted' : 'pending',
    difficulty: null,
    progress: hasSubmission ? 100 : 0,
    estimatedMinutes: null,
    academicWeight: null,
  });

  await campusSync.markTaskApplied(userId, item.id, created.id as TaskId);
}

async function applyDocument(
  userId: UserId,
  subjectId: SubjectId,
  item: CampusSyncItem,
  documents: DocumentRepository,
  campusSync: CampusSyncRepository,
): Promise<void> {
  if (payloadString(item, 'kind') !== 'file') return;

  const title = payloadString(item, 'name');
  if (!title || !item.sourceUrl) return;

  const values: Partial<Omit<DocumentRecord, 'id' | 'userId'>> = {
    subjectId,
    classSessionId: null,
    title,
    source: 'campus_sync',
    storagePath: null,
    externalUrl: item.sourceUrl,
    mimeType: inferMimeType(item.sourceUrl),
    sizeBytes: parseCampusSize(payloadString(item, 'size')),
    contentHash: item.contentHash,
    replacesDocumentId: null,
  };

  if (item.appliedDocumentId) {
    const existing = await documents.findById(userId, item.appliedDocumentId);
    if (existing) {
      await documents.update(userId, existing.id, values);
      return;
    }
  }

  const created = await documents.create(
    userId,
    values as Omit<DocumentRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  );

  await campusSync.markDocumentApplied(userId, item.id, created.id as DocumentId);
}

export async function applyCampusSyncItem(
  userId: UserId,
  subjectId: SubjectId,
  item: CampusSyncItem,
  repositories: {
    tasks: TaskRepository;
    documents: DocumentRepository;
    campusSync: CampusSyncRepository;
  },
): Promise<void> {
  if (item.kind === 'assignment') {
    await applyAssignment(userId, subjectId, item, repositories.tasks, repositories.campusSync);
    return;
  }

  if (item.kind === 'document') {
    await applyDocument(userId, subjectId, item, repositories.documents, repositories.campusSync);
  }
}
