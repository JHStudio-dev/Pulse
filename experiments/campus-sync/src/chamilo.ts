import type {
  CampusCourseRef,
  SyncedAnnouncement,
  SyncedAssignment,
  SyncedCourse,
  SyncedDocument,
  SyncedEvent,
} from './connector-contract.ts';

const COURSE_PATH = /\/courses\/([^/]+)\/index\.php/i;

function cleanText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function normalizeDocumentSize(value: string): string | undefined {
  const matches = value.match(/\d+(?:\.\d+)?\s*(?:[kmgt](?:i?b)?|bytes?|b)\b/gi);
  const last = matches?.at(-1);
  return last?.replace(/\s+/g, '') || undefined;
}

function normalizeDocumentUpdatedAt(value: string): string | undefined {
  const match = value.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  return match?.[0].replace(' ', 'T');
}

function visibleCellText(cell: HTMLTableCellElement): string {
  const clone = cell.cloneNode(true) as HTMLTableCellElement;

  for (const element of clone.querySelectorAll<HTMLElement>('[hidden], [aria-hidden="true"], [style]')) {
    const style = element.getAttribute('style')?.replace(/\s+/g, '').toLowerCase() ?? '';

    if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true' || style.includes('display:none')) {
      element.remove();
    }
  }

  return cleanText(clone.textContent);
}

function resolveAnchorUrl(anchor: HTMLAnchorElement, baseUrl: string): string | null {
  const href = anchor.getAttribute('href')?.trim();

  if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) {
    return null;
  }

  try {
    return sanitizeCampusUrl(href, baseUrl);
  } catch {
    return null;
  }
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
    const sourceUrl = resolveAnchorUrl(anchor, baseUrl);
    if (!sourceUrl) continue;

    const externalId = getChamiloCourseId(sourceUrl);
    if (!externalId) continue;

    const title = cleanText(anchor.innerText || anchor.textContent);
    if (!title) continue;

    const sessionId = getChamiloSessionId(sourceUrl);

    courses.set(externalId, {
      externalId,
      title,
      sourceUrl,
      ...(sessionId !== undefined ? { sessionId } : {}),
    });
  }

  return [...courses.values()];
}


function cleanCourseTitle(value: string): string {
  return cleanText(value)
    .replace(/\s*[|·-]\s*(?:UJCVx|Campus UJCV|UJCV)\s*$/i, '')
    .trim();
}

function findLabeledValue(document: Document, labels: RegExp): string | undefined {
  const lines = (document.body.textContent ?? '')
    .split('\n')
    .map(cleanText)
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const inline = line.match(labels);

    if (!inline) continue;

    const value = cleanText(inline[1]);
    if (value) return value;

    const next = lines[index + 1];
    if (next && !labels.test(next)) return next;
  }

  return undefined;
}

export function parseChamiloCoursePage(
  document: Document,
  course: CampusCourseRef,
  pageUrl: string,
): SyncedCourse {
  const sameCourseLinkTitles = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
    .map((anchor) => {
      const href = resolveAnchorUrl(anchor, pageUrl);
      if (!href || getChamiloCourseId(href) !== course.externalId) return '';
      return cleanCourseTitle(
        anchor.innerText ||
          anchor.textContent ||
          anchor.getAttribute('title') ||
          anchor.getAttribute('aria-label') ||
          '',
      );
    })
    .filter(Boolean);

  const selectorCandidates = [
    '.page-header h1',
    '.page-header h2',
    '.course-title',
    '[class*="course-title"]',
    '.breadcrumb .active',
    '.breadcrumb li:last-child',
    'main h1',
    'main h2',
    'h1',
    'h2',
    '.panel-title',
  ]
    .flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)].map(
        (element) =>
          element.innerText ||
          element.textContent ||
          element.getAttribute('title') ||
          element.getAttribute('aria-label') ||
          '',
      ),
    );

  const metaTitle =
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ??
    document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content ??
    '';

  const titleCandidates = [
    ...sameCourseLinkTitles,
    ...selectorCandidates,
    metaTitle,
    document.title,
  ];

  const title =
    titleCandidates
      .map((value) => cleanCourseTitle(value ?? ''))
      .find(
        (value) =>
          value.length > 0 &&
          value !== course.externalId &&
          !/^(inicio|campus|curso|courses?|ujcvx?|principal|home)$/i.test(value),
      ) ?? course.externalId;

  const teacher =
    findLabeledValue(
      document,
      /^(?:profesor(?:es)?|docente(?:s)?|teacher)\s*:?\s*(.*)$/i,
    ) ??
    [...document.querySelectorAll<HTMLElement>('[class*="teacher"], [class*="professor"], [class*="trainer"]')]
      .map((element) => cleanText(element.textContent))
      .find((value) => value.length > 0);

  const section =
    findLabeledValue(document, /^(?:secci[oó]n|section)\s*:?\s*(.*)$/i) ??
    (document.body.textContent ?? '').match(/\bsecci[oó]n\s+([A-Z0-9-]+)/i)?.[1];

  return {
    externalId: course.externalId,
    title,
    code: course.externalId,
    sourceUrl: sanitizeCampusUrl(pageUrl, pageUrl),
    ...(course.sessionId !== undefined ? { sessionId: course.sessionId } : {}),
    ...(section !== undefined ? { section } : {}),
    ...(teacher !== undefined ? { teacher } : {}),
  };
}

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

    const links = anchors
      .map((anchor) => {
        const href = resolveAnchorUrl(anchor, pageUrl);
        if (!href) return null;

        return {
          text: cleanText(anchor.innerText || anchor.textContent),
          href,
        };
      })
      .filter((link): link is { text: string; href: string } => link !== null);

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
      .filter((cell) => cell.parentElement === row);

    const metadata = cells
      .map(visibleCellText)
      .filter((value) => value && value !== namedLink.text);

    const path = getChamiloDirectoryPath(pageUrl);
    const size = metadata
      .map(normalizeDocumentSize)
      .find((value): value is string => value !== undefined);
    const updatedAt = metadata
      .map(normalizeDocumentUpdatedAt)
      .find((value): value is string => value !== undefined);

    documents.push({
      externalId,
      courseExternalId: course.externalId,
      name: namedLink.text,
      kind: isFolder ? 'folder' : 'file',
      sourceUrl: namedLink.href,
      ...(path !== undefined ? { path } : {}),
      ...(size !== undefined ? { size } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
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
    const links = [...row.querySelectorAll<HTMLAnchorElement>('a[href]')]
      .map((anchor) => {
        const href = resolveAnchorUrl(anchor, pageUrl);
        if (!href) return null;

        return { anchor, href };
      })
      .filter(
        (link): link is { anchor: HTMLAnchorElement; href: string } => link !== null,
      );

    const assignmentLink = links.find(
      (link) => getChamiloAssignmentId(link.href) !== null,
    );

    if (!assignmentLink) continue;

    const externalId = getChamiloAssignmentId(assignmentLink.href);
    if (!externalId) continue;

    const title = cleanText(
      assignmentLink.anchor.innerText || assignmentLink.anchor.textContent,
    );

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
      sourceUrl: assignmentLink.href,
      ...(dueAt !== undefined ? { dueAt } : {}),
    });
  }

  return assignments;
}

function pageLines(document: Document): string[] {
  return (document.body.textContent ?? '').split('\n').map(cleanText).filter(Boolean);
}

function readAssignmentDescription(document: Document): string | undefined {
  const heading = [...document.querySelectorAll<HTMLElement>('h1, h2, h3, h4')]
    .find((element) => cleanText(element.textContent) === 'Descripción');

  const panel = heading?.closest<HTMLElement>('.panel');
  const body = panel?.querySelector<HTMLElement>('.panel-body');

  if (body) {
    const blocks = [...body.querySelectorAll<HTMLElement>('p, li')]
      .map((element) => cleanText(element.textContent))
      .filter(Boolean);

    const description = blocks.join('\n').trim();
    if (description) return description;
  }

  const lines = pageLines(document);
  const start = lines.findIndex((line) => line === 'Descripción');
  if (start === -1) return undefined;

  const stopLabels = new Set([
    'Tipo',
    'Profesores',
    'Creado con UJCVx',
    '© 2026',
  ]);

  const end = lines.findIndex(
    (line, index) => index > start && stopLabels.has(line),
  );

  const description = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((line) => !line.includes('jqGrid(') && !line.startsWith('$(function()'))
    .join('\n')
    .trim();

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

  return [...submissionTable.querySelectorAll('tbody tr')].some((row) =>
    [...row.querySelectorAll('td')].some((cell) => cleanText(cell.textContent).length > 0),
  );
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

  const description = readAssignmentDescription(document);

  const submissionLink = document.querySelector<HTMLAnchorElement>(
    'a[href*="/main/work/upload.php"]',
  );

  const submissionUrl = submissionLink
    ? sanitizeCampusUrl(submissionLink.href, pageUrl)
    : undefined;

  return {
    externalId,
    courseExternalId: course.externalId,
    title: heading,
    sourceUrl: sanitizeCampusUrl(pageUrl, pageUrl),
    hasSubmission: hasChamiloSubmission(document),
    ...(description !== undefined ? { description } : {}),
    ...(submissionUrl !== undefined ? { submissionUrl } : {}),
  };
}

export function getChamiloAnnouncementId(value: string): string | null {
  try {
    const url = new URL(value);

    if (!url.pathname.endsWith('/main/announcements/announcements.php')) {
      return null;
    }

    if (url.searchParams.get('action') !== 'view') {
      return null;
    }

    return url.searchParams.get('id');
  } catch {
    return null;
  }
}

const CHAMILO_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function normalizeSpanishDateTime(value: string): string | undefined {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  const match = normalized.match(/(\d{1,2}) de ([a-z]+) (\d{4}) a las (\d{1,2}):(\d{2}) (am|pm)/);

  if (!match) return undefined;

  const [, dayText, monthText, yearText, hourText, minuteText, period] = match;

  const month = CHAMILO_MONTHS[monthText!];
  if (!month) return undefined;

  let hour = Number(hourText);

  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;

  return [
    `${yearText}-${String(month).padStart(2, '0')}-${String(dayText).padStart(2, '0')}`,
    `${String(hour).padStart(2, '0')}:${minuteText}:00`,
  ].join('T');
}

export function parseChamiloAnnouncements(
  document: Document,
  course: CampusCourseRef,
  pageUrl: string,
): SyncedAnnouncement[] {
  const announcements: SyncedAnnouncement[] = [];

  for (const row of document.querySelectorAll<HTMLTableRowElement>('table tbody tr')) {
    const links = [...row.querySelectorAll<HTMLAnchorElement>('a[href]')]
      .map((anchor) => {
        const href = resolveAnchorUrl(anchor, pageUrl);
        if (!href) return null;

        return { anchor, href };
      })
      .filter(
        (link): link is { anchor: HTMLAnchorElement; href: string } => link !== null,
      );

    const announcementLink = links.find((link) =>
      getChamiloAnnouncementId(link.href),
    );

    if (!announcementLink) continue;

    const externalId = getChamiloAnnouncementId(announcementLink.href);
    if (!externalId) continue;

    const title = cleanText(
      announcementLink.anchor.innerText || announcementLink.anchor.textContent,
    );

    if (!title) continue;

    const cells = [...row.querySelectorAll<HTMLTableCellElement>('td')]
      .map((cell) => cleanText(cell.innerText || cell.textContent))
      .filter(Boolean);

    const author = cells[1];

    const updatedAt = cells
      .map(normalizeSpanishDateTime)
      .find((value): value is string => value !== undefined);

    announcements.push({
      externalId,
      courseExternalId: course.externalId,
      title,
      sourceUrl: announcementLink.href,
      ...(author !== undefined ? { author } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    });
  }

  return announcements;
}

function readAnnouncementContent(document: Document, title: string): string | undefined {
  const heading = [...document.querySelectorAll('h1, h2, h3, h4')].find(
    (element) => cleanText(element.textContent) === title,
  );

  const table = heading?.closest('table');
  if (!table) return undefined;

  const rows = [...table.querySelectorAll('tbody > tr')];

  const contentRow = rows.find((row) => {
    const text = cleanText(row.textContent);

    return text.length > 0 && !text.includes(title) && !text.startsWith('Última actualización');
  });

  if (!contentRow) return undefined;

  const content = [...contentRow.querySelectorAll('p, li')]
    .map((element) => cleanText(element.textContent))
    .filter(Boolean)
    .join('\n');

  return content || undefined;
}

export function parseChamiloAnnouncementDetail(
  document: Document,
  course: CampusCourseRef,
  pageUrl: string,
): SyncedAnnouncement | null {
  const externalId = getChamiloAnnouncementId(pageUrl);
  if (!externalId) return null;

  const title = [...document.querySelectorAll('h1, h2, h3, h4')]
    .map((element) => cleanText(element.textContent))
    .find((text) => text && text !== 'Eliminar');

  if (!title) return null;

  const content = readAnnouncementContent(document, title);

  return {
    externalId,
    courseExternalId: course.externalId,
    title,
    sourceUrl: sanitizeCampusUrl(pageUrl, pageUrl),
    ...(content !== undefined ? { content } : {}),
  };
}

interface AgendaDateRange {
  startDate: string;
  endDate?: string;
}

function normalizeSpanishDate(value: string): string | undefined {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  const match = normalized.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);

  if (!match) return undefined;

  const [, dayText, monthText, yearText] = match;
  const month = CHAMILO_MONTHS[monthText!];

  if (!month) return undefined;

  return `${yearText}-${String(month).padStart(2, '0')}-${String(dayText).padStart(2, '0')}`;
}

export function parseChamiloAgendaDateRange(value: string): AgendaDateRange | null {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  const matches = [...normalized.matchAll(/(\d{1,2}) de ([a-z]+) de (\d{4})/g)];

  if (matches.length === 0) return null;

  const startDate = normalizeSpanishDate(matches[0]![0]);
  if (!startDate) return null;

  const endDate = matches.length > 1 ? normalizeSpanishDate(matches[1]![0]) : undefined;

  return {
    startDate,
    ...(endDate !== undefined ? { endDate } : {}),
  };
}

export function parseChamiloEvents(
  document: Document,
  course: CampusCourseRef,
  pageUrl: string,
): SyncedEvent[] {
  const events: SyncedEvent[] = [];
  let currentRange: AgendaDateRange | null = null;

  const listTable = document.querySelector('.fc-list-table');
  const rows = listTable
    ? listTable.querySelectorAll<HTMLTableRowElement>('tbody tr')
    : document.querySelectorAll<HTMLTableRowElement>('table tbody tr');

  for (const row of rows) {
    if (row.classList.contains('fc-list-heading')) {
      const rowText = cleanText(row.textContent);
      currentRange = parseChamiloAgendaDateRange(rowText);
      continue;
    }

    if (!currentRange || !row.classList.contains('fc-list-item')) continue;

    const timeCell = row.querySelector<HTMLElement>('.fc-list-item-time');
    const titleCell = row.querySelector<HTMLElement>('.fc-list-item-title');

    const timeText = cleanText(timeCell?.innerText || timeCell?.textContent);
    if (!timeText || !titleCell) continue;

    const normalizedTime = timeText
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();

    const compactTime = normalizedTime.replace(/\s+/g, '');
    const allDay = compactTime === 'todoeldia';
    const timeMatch = timeText.match(/^(\d{1,2}):(\d{2})$/);

    if (!allDay && !timeMatch) continue;

    const links = [...titleCell.querySelectorAll<HTMLAnchorElement>('a')]
      .map((anchor) => {
        const href = resolveAnchorUrl(anchor, pageUrl);
        return { anchor, href };
      });

    const assignmentLink = links.find(
      (link) => link.href !== null && getChamiloAssignmentId(link.href) !== null,
    );

    const assignmentId = assignmentLink?.href
      ? getChamiloAssignmentId(assignmentLink.href)
      : null;

    const visibleTitle = cleanText(
      titleCell.querySelector('a:not([href])')?.textContent ||
        titleCell.querySelector('a')?.textContent ||
        titleCell.textContent,
    );

    if (!visibleTitle) continue;

    let title = visibleTitle;

    if (assignmentLink && assignmentId && visibleTitle.startsWith('Entrega de tarea')) {
      const assignmentTitle = cleanText(assignmentLink.anchor.textContent);
      if (assignmentTitle && !visibleTitle.includes(assignmentTitle)) {
        title = `Entrega de tarea ${assignmentTitle}`;
      }
    }

    const startsAt = allDay
      ? currentRange.startDate
      : `${currentRange.startDate}T${String(timeMatch![1]).padStart(2, '0')}:${timeMatch![2]}:00`;

    const endsAt = allDay ? currentRange.endDate : undefined;

    events.push({
      courseExternalId: course.externalId,
      title,
      startsAt,
      allDay,
      sourceType: assignmentId ? 'assignment' : 'agenda',
      sourceUrl: assignmentLink?.href
        ? assignmentLink.href
        : sanitizeCampusUrl(pageUrl, pageUrl),
      ...(endsAt !== undefined ? { endsAt } : {}),
      ...(assignmentId !== null && assignmentId !== undefined
        ? { sourceExternalId: assignmentId }
        : {}),
    });
  }

  return events;
}

