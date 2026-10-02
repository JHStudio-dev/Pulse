import type { CampusSyncItem, Subject } from '@pulse/types';

export interface CampusAnnouncementEntry {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  author: string | null;
  content: string | null;
  sourceUrl: string | null;
  updatedAt: string;
}

export interface CampusEventEntry {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  sourceUrl: string | null;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function plainText(value: string | null): string | null {
  if (!value) return null;
  const clean = value
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();

  return clean.length > 0 ? clean : null;
}

export function buildCampusAnnouncements(
  items: readonly CampusSyncItem[],
  subject: Subject,
): CampusAnnouncementEntry[] {
  return items
    .filter((item) => item.kind === 'announcement')
    .map((item) => ({
      id: item.id as string,
      subjectId: subject.id as string,
      subjectName: subject.name,
      title: text(item.payload['title']) ?? 'Anuncio del campus',
      author: text(item.payload['author']),
      content: plainText(text(item.payload['content'])),
      sourceUrl: item.sourceUrl,
      updatedAt: text(item.payload['updatedAt']) ?? item.firstSeenAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function buildCampusEvents(
  items: readonly CampusSyncItem[],
  subject: Subject,
): CampusEventEntry[] {
  return items
    .filter((item) => item.kind === 'event')
    .flatMap((item) => {
      const startsAt = text(item.payload['startsAt']);
      if (!startsAt) return [];

      return [{
        id: item.id as string,
        subjectId: subject.id as string,
        subjectName: subject.name,
        title: text(item.payload['title']) ?? 'Evento del campus',
        description: plainText(text(item.payload['description'])),
        startsAt,
        endsAt: text(item.payload['endsAt']),
        allDay: boolean(item.payload['allDay']),
        sourceUrl: item.sourceUrl,
      }];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
