import type {
  CampusSyncEventSnapshot,
  CampusSyncItemDraft,
  CampusSyncItemInput,
  CampusSyncSnapshot,
  JsonObject,
  JsonValue,
} from '@pulse/types';
import { prepareCampusSyncItem } from './diff';

function jsonObject(entries: Record<string, JsonValue | undefined>): JsonObject {
  const result: JsonObject = {};

  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) result[key] = value;
  }

  return result;
}

function eventExternalId(event: CampusSyncEventSnapshot): string {
  if (event.externalId) return event.externalId;
  if (event.sourceExternalId) return `${event.sourceType}:${event.sourceExternalId}`;

  return [
    event.sourceType,
    event.sourceUrl ?? '',
    event.startsAt,
    event.title,
  ].join(':');
}

export function prepareCampusSyncSnapshot(snapshot: CampusSyncSnapshot): CampusSyncItemInput[] {
  const drafts: CampusSyncItemDraft[] = [
    ...snapshot.documents.map((document) => ({
      kind: 'document' as const,
      externalId: document.externalId,
      sourceUrl: document.sourceUrl,
      payload: jsonObject({
        courseExternalId: document.courseExternalId,
        name: document.name,
        kind: document.kind,
        path: document.path,
        size: document.size,
        updatedAt: document.updatedAt,
      }),
    })),
    ...snapshot.assignments.map((assignment) => ({
      kind: 'assignment' as const,
      externalId: assignment.externalId,
      sourceUrl: assignment.sourceUrl,
      payload: jsonObject({
        courseExternalId: assignment.courseExternalId,
        title: assignment.title,
        description: assignment.description,
        dueAt: assignment.dueAt,
        submissionUrl: assignment.submissionUrl,
        hasSubmission: assignment.hasSubmission,
      }),
    })),
    ...snapshot.announcements.map((announcement) => ({
      kind: 'announcement' as const,
      externalId: announcement.externalId,
      sourceUrl: announcement.sourceUrl,
      payload: jsonObject({
        courseExternalId: announcement.courseExternalId,
        title: announcement.title,
        author: announcement.author,
        content: announcement.content,
        updatedAt: announcement.updatedAt,
      }),
    })),
    ...snapshot.events.map((event) => ({
      kind: 'event' as const,
      externalId: eventExternalId(event),
      sourceUrl: event.sourceUrl ?? null,
      payload: jsonObject({
        courseExternalId: event.courseExternalId,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        sourceType: event.sourceType,
        sourceExternalId: event.sourceExternalId,
      }),
    })),
  ];

  return drafts.map(prepareCampusSyncItem);
}
