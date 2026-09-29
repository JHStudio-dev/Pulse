import type { SyncedCourse } from './connector-contract.ts';

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
