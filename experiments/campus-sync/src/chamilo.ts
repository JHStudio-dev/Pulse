import type {
  CampusCourseRef,
  SyncedAssignment,
  SyncedCourse,
  SyncedDocument,
} from './connector-contract.ts';

const COURSE_PATH = /\/courses\/([^/]+)\/index\.php/i;

function cleanText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

export function sanitizeCampusUrl(value: string, baseUrl: string): string {
  const url = new URL(value, baseUrl);

  url.searchParams.delete('sec_token');
  url.searchParams.delete('hash');

  return url.toString();
}

export function getChamiloCourseId(value: string): string | null {
  try {
    const url = new URL(value);
    const match = url.pathname.match(COURSE_PATH);

    if (match?.[1]) return match[1];

    return url.searchParams.get('cidReq');
  } catch {
    return null;
  }
}

export function getChamiloSessionId(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.searchParams.get('id_session') ?? undefined;
  } catch {
    return undefined;
  }
}

export function parseChamiloCourses(document: Document, baseUrl: string): SyncedCourse[] {
  const courses = new Map<string, SyncedCourse>();

  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.href;
    const externalId = getChamiloCourseId(href);

    if (!externalId) continue;

    const title = cleanText(anchor.innerText || anchor.textContent);
    if (!title) continue;

    const sourceUrl = sanitizeCampusUrl(href, baseUrl);

    courses.set(externalId, {
      externalId,
      sessionId: getChamiloSessionId(href),
      title,
      sourceUrl,
    });
  }

  return [...courses.values()];
}

import type { CampusCourseRef, SyncedDocument } from './connector-contract.ts';

export function getChamiloDocumentId(value: string): string | null {
  try {
    return new URL(value).searchParams.get('id');
  } catch {
    return null;
  }
}

export function getChamiloDirectoryPath(value: string): string | undefined {
  try {
    return new URL(value).searchParams.get('curdirpath') ?? undefined;
  } catch {
    return undefined;
  }
}

export function parseChamiloDocuments(
  document: Document,
  course: CampusCourseRef,
  pageUrl: string,
): SyncedDocument[] {
  const documents: SyncedDocument[] = [];

  for (const row of document.querySelectorAll<HTMLTableRowElement>('table tbody tr')) {
    const anchors = [...row.querySelectorAll<HTMLAnchorElement>('a[href]')];

    if (anchors.length === 0) continue;

    const links = anchors.map((anchor) => ({
      text: cleanText(anchor.innerText || anchor.textContent),
      href: sanitizeCampusUrl(anchor.href, pageUrl),
    }));

    const namedLink = links.find((link) => link.text && getChamiloDocumentId(link.href));
    if (!namedLink) continue;

    const externalId = getChamiloDocumentId(namedLink.href);
    if (!externalId) continue;

    const isFolder = links.some((link) => {
      try {
        return new URL(link.href).searchParams.get('action') === 'downloadfolder';
      } catch {
        return false;
      }
    });

    const isFile = links.some((link) => {
      try {
        const url = new URL(link.href);

        return (
          url.searchParams.get('action') === 'download' ||
          url.pathname.includes('/main/document/showinframes.php') ||
          url.pathname.includes(`/courses/${course.externalId}/document/`)
        );
      } catch {
        return false;
      }
    });

    if (!isFolder && !isFile) continue;

    const cells = [...row.querySelectorAll<HTMLTableCellElement>('td')]
      .map((cell) => cleanText(cell.innerText || cell.textContent))
      .filter(Boolean);

    const metadata = cells.filter((value) => value !== namedLink.text);

    documents.push({
      externalId,
      courseExternalId: course.externalId,
      name: namedLink.text,
      kind: isFolder ? 'folder' : 'file',
      path: getChamiloDirectoryPath(pageUrl),
      size: metadata[0],
      updatedAt: metadata[1],
      sourceUrl: namedLink.href,
    });
  }

  return documents;
}

export function getChamiloAssignmentId(value: string): string | null {
  try {
    const url = new URL(value);

    if (!url.pathname.endsWith('/main/work/work_list.php')) {
      return null;
    }

    return url.searchParams.get('id');
  } catch {
    return null;
  }
}

function normalizeChamiloDateTime(value: string): string | undefined {
  const match = value.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

  if (!match) return undefined;

  return match[0].replace(' ', 'T');
}

export function parseChamiloAssignments(
  document: Document,
  course: CampusCourseRef,
  pageUrl: string,
): SyncedAssignment[] {
  const assignments: SyncedAssignment[] = [];

  for (const row of document.querySelectorAll<HTMLTableRowElement>('table tbody tr')) {
    const links = [...row.querySelectorAll<HTMLAnchorElement>('a[href]')];

    const assignmentLink = links.find((anchor) => getChamiloAssignmentId(anchor.href));

    if (!assignmentLink) continue;

    const externalId = getChamiloAssignmentId(assignmentLink.href);
    if (!externalId) continue;

    const title = cleanText(assignmentLink.innerText || assignmentLink.textContent);

    if (!title) continue;

    const cells = [...row.querySelectorAll<HTMLTableCellElement>('td')]
      .map((cell) => cleanText(cell.innerText || cell.textContent))
      .filter(Boolean);

    const dueAt = cells
      .map(normalizeChamiloDateTime)
      .find((value): value is string => value !== undefined);

    assignments.push({
      externalId,
      courseExternalId: course.externalId,
      title,
      dueAt,
      sourceUrl: sanitizeCampusUrl(assignmentLink.href, pageUrl),
    });
  }

  return assignments;
}

function pageLines(document: Document): string[] {
  return (document.body.textContent ?? '').split('\n').map(cleanText).filter(Boolean);
}

function readAssignmentDescription(document: Document): string | undefined {
  const lines = pageLines(document);

  const start = lines.findIndex((line) => line === 'Descripción');
  if (start === -1) return undefined;

  const end = lines.findIndex((line, index) => index > start && line === 'Tipo');

  const descriptionLines = lines.slice(start + 1, end === -1 ? undefined : end);

  const description = descriptionLines.join('\n').trim();

  return description || undefined;
}

function hasChamiloSubmission(document: Document): boolean {
  const tables = [...document.querySelectorAll('table')];

  const submissionTable = tables.find((table) => {
    const text = cleanText(table.textContent);

    return (
      text.includes('Tipo') &&
      text.includes('Título') &&
      text.includes('Calificación') &&
      text.includes('Fecha') &&
      text.includes('Estado')
    );
  });

  if (!submissionTable) return false;

  const text = cleanText(submissionTable.textContent);

  if (text.includes('Sin registros que mostrar')) return false;

  return [...submissionTable.querySelectorAll('tbody tr')].some((row) => {
    const cells = [...row.querySelectorAll('td')]
      .map((cell) => cleanText(cell.textContent))
      .filter(Boolean);

    return cells.length > 0;
  });
}

export function parseChamiloAssignmentDetail(
  document: Document,
  course: CampusCourseRef,
  pageUrl: string,
): SyncedAssignment | null {
  const externalId = getChamiloAssignmentId(pageUrl);
  if (!externalId) return null;

  const heading = [...document.querySelectorAll('h1, h2, h3, h4')]
    .map((element) => cleanText(element.textContent))
    .find((text) => text && text !== 'Descripción' && text !== 'Eliminar');

  if (!heading) return null;

  const submissionLink = document.querySelector<HTMLAnchorElement>(
    'a[href*="/main/work/upload.php"]',
  );

  return {
    externalId,
    courseExternalId: course.externalId,
    title: heading,
    description: readAssignmentDescription(document),
    sourceUrl: sanitizeCampusUrl(pageUrl, pageUrl),
    submissionUrl: submissionLink ? sanitizeCampusUrl(submissionLink.href, pageUrl) : undefined,
    hasSubmission: hasChamiloSubmission(document),
  };
}
