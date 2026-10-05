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


function scheduleHintLines(document: Document): string[] {
  const results = new Set<string>();
  const lines = (document.body.textContent ?? '')
    .split('\n')
    .map(cleanText)
    .filter(Boolean);

  const signal = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|horario|clase|aula|sal[oó]n|virtual|presencial|meet|zoom|teams)\b/i;
  const time = /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|a|hasta)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i;

  for (let index = 0; index < lines.length; index += 1) {
    const windows = [
      lines[index],
      [lines[index], lines[index + 1]].filter(Boolean).join(' '),
      [lines[index], lines[index + 1], lines[index + 2]].filter(Boolean).join(' '),
    ];

    for (const candidate of windows) {
      if (!candidate || candidate.length > 500) continue;
      if (!signal.test(candidate) || !time.test(candidate)) continue;
      results.add(candidate);
    }
  }

  return [...results].slice(0, 20);
}

function courseMeetingUrls(document: Document, baseUrl: string): string[] {
  const results = new Set<string>();

  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = resolveAnchorUrl(anchor, baseUrl);
    if (!href) continue;

    try {
      const host = new URL(href).hostname.toLowerCase();
      if (
        host === 'meet.google.com' ||
        host.endsWith('.zoom.us') ||
        host === 'teams.microsoft.com'
      ) {
        results.add(href);
      }
    } catch {
      continue;
    }
  }

  return [...results];
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

  const scheduleHints = scheduleHintLines(document);
  const meetingUrls = courseMeetingUrls(document, pageUrl);

  return {
    externalId: course.externalId,
    title,
    code: course.externalId,
    sourceUrl: sanitizeCampusUrl(pageUrl, pageUrl),
    ...(course.sessionId !== undefined ? { sessionId: course.sessionId } : {}),
    ...(section !== undefined ? { section } : {}),
    ...(teacher !== undefined ? { teacher } : {}),
    ...(scheduleHints.length > 0 ? { scheduleHints } : {}),
    ...(meetingUrls.length > 0 ? { meetingUrls } : {}),
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

const CHAMILO_DATE_MONTHS: Record<string, number> = {
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

function toChamiloTimestamp(
  year: number,
  month: number,
  day: number,
  hour?: number,
  minute?: number,
): string | undefined {
  if (
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    (hour !== undefined && (hour < 0 || hour > 23)) ||
    (minute !== undefined && (minute < 0 || minute > 59))
  ) {
    return undefined;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }

  const isoDate = [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');

  if (hour === undefined || minute === undefined) return isoDate;
  return `${isoDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function nearestYearForMonthDay(month: number, day: number, referenceDate: Date): number | null {
  const reference = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );

  const candidates = [
    referenceDate.getUTCFullYear() - 1,
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCFullYear() + 1,
  ]
    .map((year) => ({
      year,
      timestamp: Date.UTC(year, month - 1, day),
    }))
    .filter(({ year, timestamp }) => {
      const date = new Date(timestamp);
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    })
    .sort(
      (left, right) =>
        Math.abs(left.timestamp - reference) - Math.abs(right.timestamp - reference),
    );

  return candidates[0]?.year ?? null;
}

export function inferChamiloAssignmentDueAt(
  title: string,
  referenceDate = new Date(),
): string | undefined {
  const normalized = title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

  if (
    !/\b(fecha\s*(?:limite|de\s+entrega)|vencimiento|vence|entregar|entrega\s+(?:hasta|limite))\b/.test(
      normalized,
    )
  ) {
    return undefined;
  }

  const match = normalized.match(
    /\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(20\d{2}))?(?:\s+(?:a\s+las\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?/,
  );

  if (!match) return undefined;

  const month = CHAMILO_DATE_MONTHS[match[2]!];
  if (!month) return undefined;

  const day = Number(match[1]);
  const explicitYear = match[3] === undefined ? null : Number(match[3]);
  const year = explicitYear ?? nearestYearForMonthDay(month, day, referenceDate);
  if (year === null) return undefined;

  let hour = match[4] === undefined ? undefined : Number(match[4]);
  const minute = match[5] === undefined ? undefined : Number(match[5]);
  const period = match[6]?.replace(/\./g, '');

  if (hour !== undefined && period) {
    if (hour < 1 || hour > 12) return undefined;
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
  }

  if (hour !== undefined && minute === undefined) {
    return toChamiloTimestamp(year, month, day);
  }

  return toChamiloTimestamp(year, month, day, hour, minute);
}

export function normalizeChamiloDateTime(value: string): string | undefined {
  const text = value.trim();
  const iso = text.match(
    /\b(20\d{2})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?)?\b/,
  );

  if (iso) {
    return toChamiloTimestamp(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      iso[4] === undefined ? undefined : Number(iso[4]),
      iso[5] === undefined ? undefined : Number(iso[5]),
    );
  }

  const numeric = text.match(
    /\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?)?\b/,
  );

  if (numeric) {
    return toChamiloTimestamp(
      Number(numeric[3]),
      Number(numeric[2]),
      Number(numeric[1]),
      numeric[4] === undefined ? undefined : Number(numeric[4]),
      numeric[5] === undefined ? undefined : Number(numeric[5]),
    );
  }

  const normalized = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const spanish = normalized.match(
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})(?:\s+(?:a\s+las\s+)?(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?)?/,
  );
  if (!spanish) return undefined;

  let hour = spanish[4] === undefined ? undefined : Number(spanish[4]);
  const period = spanish[6]?.replace(/\./g, '');

  if (hour !== undefined && period) {
    if (hour < 1 || hour > 12) return undefined;
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
  }

  return toChamiloTimestamp(
    Number(spanish[3]),
    CHAMILO_DATE_MONTHS[spanish[2]!]!,
    Number(spanish[1]),
    hour,
    spanish[5] === undefined ? undefined : Number(spanish[5]),
  );
}

function assignmentDeadlineCandidates(document: Document): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | null | undefined) => {
    const clean = cleanText(value);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    candidates.push(clean);
  };

  const signalSelector = [
    '[id*="expire" i]',
    '[name*="expire" i]',
    '[data-field*="expire" i]',
    '[aria-describedby*="expire" i]',
    '[id*="deadline" i]',
    '[name*="deadline" i]',
    '[data-field*="deadline" i]',
    '[aria-describedby*="deadline" i]',
    '[id*="due_date" i]',
    '[name*="due_date" i]',
    '[data-field*="due_date" i]',
    '[aria-describedby*="due_date" i]',
    '[id*="end_date" i]',
    '[name*="end_date" i]',
    '[data-field*="end_date" i]',
    '[aria-describedby*="end_date" i]',
  ].join(', ');

  for (const element of document.querySelectorAll<HTMLElement>(signalSelector)) {
    add(element.getAttribute('value'));
    add(element.getAttribute('title'));
    add(element.getAttribute('data-date'));
    add(element.textContent);
  }

  const labelPattern =
    /^(?:fecha\s*(?:l[ií]mite|de\s+entrega|final|fin)|vencimiento|vence|expira(?:ci[oó]n)?|deadline|due\s+date)\s*:?.*$/i;

  for (const row of document.querySelectorAll<HTMLTableRowElement>('tr')) {
    const cells = [...row.children].filter(
      (element) => element.tagName === 'TH' || element.tagName === 'TD',
    );

    const labelIndex = cells.findIndex((cell) => labelPattern.test(cleanText(cell.textContent)));
    if (labelIndex === -1) continue;

    for (const cell of cells.slice(labelIndex)) {
      add(cell.getAttribute('title'));
      add(cell.getAttribute('data-date'));
      add(cell.textContent);
    }
  }

  for (const label of document.querySelectorAll<HTMLLabelElement>('label')) {
    if (!labelPattern.test(cleanText(label.textContent))) continue;

    add(label.textContent);

    const targetId = label.htmlFor;
    if (!targetId) continue;

    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLElement)) continue;

    add(target.getAttribute('value'));
    add(target.getAttribute('title'));
    add(target.getAttribute('data-date'));
    add(target.textContent);
  }

  const scriptSignal =
    /(?:expires?_on|due_date|deadline|end_date|endDate)\s*["']?\s*[:=]\s*["']([^"']+)["']/gi;

  for (const script of document.querySelectorAll<HTMLScriptElement>('script')) {
    const source = script.textContent ?? '';
    for (const match of source.matchAll(scriptSignal)) add(match[1]);
  }

  return candidates;
}

export function inspectChamiloAssignmentDeadline(document: Document): {
  candidates: string[];
  normalized: string[];
} {
  const candidates = assignmentDeadlineCandidates(document);
  const normalized = candidates
    .map(normalizeChamiloDateTime)
    .filter((value): value is string => value !== undefined);

  return {
    candidates: candidates.slice(0, 20),
    normalized: [...new Set(normalized)].slice(0, 10),
  };
}

function structuredChamiloAssignmentDueAt(document: Document): string | undefined {
  return assignmentDeadlineCandidates(document)
    .map(normalizeChamiloDateTime)
    .find((value): value is string => value !== undefined);
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

    const rowDocument = row.ownerDocument.implementation.createHTMLDocument();
    rowDocument.body.append(row.cloneNode(true));

    const dueAt =
      structuredChamiloAssignmentDueAt(rowDocument) ??
      inferChamiloAssignmentDueAt(title);

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

  const dueAt =
    structuredChamiloAssignmentDueAt(document) ??
    inferChamiloAssignmentDueAt(heading);

  return {
    externalId,
    courseExternalId: course.externalId,
    title: heading,
    sourceUrl: sanitizeCampusUrl(pageUrl, pageUrl),
    hasSubmission: hasChamiloSubmission(document),
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(submissionUrl !== undefined ? { submissionUrl } : {}),
  };
}

export function mergeChamiloAssignmentDeadlines(
  assignments: SyncedAssignment[],
  events: SyncedEvent[],
): SyncedAssignment[] {
  const dueByAssignmentId = new Map<string, string>();

  for (const event of events) {
    if (
      event.sourceType !== 'assignment' ||
      event.sourceExternalId === undefined ||
      !event.startsAt
    ) {
      continue;
    }

    if (!dueByAssignmentId.has(event.sourceExternalId)) {
      dueByAssignmentId.set(event.sourceExternalId, event.startsAt);
    }
  }

  return assignments.map((assignment) => {
    if (assignment.dueAt !== undefined) return assignment;

    const dueAt = dueByAssignmentId.get(assignment.externalId);
    return dueAt === undefined ? assignment : { ...assignment, dueAt };
  });
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

