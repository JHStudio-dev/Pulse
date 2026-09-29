import {
  getChamiloCourseId,
  getChamiloSessionId,
  parseChamiloAnnouncementDetail,
  parseChamiloAnnouncements,
  parseChamiloAssignmentDetail,
  parseChamiloAssignments,
  parseChamiloDocuments,
  parseChamiloEvents,
  parseChamiloCoursePage,
  sanitizeCampusUrl,
} from '../src/chamilo.ts';
import type {
  CampusCourseRef,
  SyncedAnnouncement,
  SyncedAssignment,
  SyncedDocument,
  SyncedEvent,
} from '../src/connector-contract.ts';

type PageKind =
  | 'course'
  | 'documents'
  | 'assignments'
  | 'announcements'
  | 'agenda'
  | 'unknown';

type PulseRequest =
  | { type: 'pulse:inspect' }
  | { type: 'pulse:sync-course' };

const CAMPUS_BASE = 'https://campus.ujcv.edu.hn';
const AGENDA_MONTHS_TO_SYNC = 6;

function detectPageKind(url: URL): PageKind {
  if (url.pathname.includes('/main/document/document.php')) return 'documents';
  if (url.pathname.includes('/main/work/work.php')) return 'assignments';
  if (url.pathname.includes('/main/announcements/announcements.php')) {
    return 'announcements';
  }
  if (url.pathname.includes('/main/calendar/agenda.php')) return 'agenda';
  if (/\/courses\/[^/]+\/index\.php$/i.test(url.pathname)) return 'course';
  return 'unknown';
}

function currentCourseRef(): CampusCourseRef | null {
  const externalId = getChamiloCourseId(location.href);
  if (!externalId) return null;

  const sessionId = getChamiloSessionId(location.href);

  return {
    externalId,
    ...(sessionId !== undefined ? { sessionId } : {}),
  };
}

function inspectCurrentPage() {
  const url = new URL(location.href);
  const course = currentCourseRef();
  const pageKind = detectPageKind(url);

  if (!course) {
    return {
      ok: false,
      pageKind: 'unknown' as const,
      url: sanitizeCampusUrl(location.href, location.href),
    };
  }

  let data: unknown = null;

  switch (pageKind) {
    case 'documents':
      data = parseChamiloDocuments(document, course, location.href);
      break;
    case 'assignments':
      data = parseChamiloAssignments(document, course, location.href);
      break;
    case 'announcements':
      data = parseChamiloAnnouncements(document, course, location.href);
      break;
    case 'agenda':
      data = parseChamiloEvents(document, course, location.href);
      break;
  }

  return {
    ok: true,
    courseId: course.externalId,
    ...(course.sessionId !== undefined ? { sessionId: course.sessionId } : {}),
    pageKind,
    title: document.title,
    url: sanitizeCampusUrl(location.href, location.href),
    data,
  };
}

function courseHomeUrl(course: CampusCourseRef): string {
  const url = new URL(`/courses/${encodeURIComponent(course.externalId)}/index.php`, CAMPUS_BASE);
  url.searchParams.set('id_session', course.sessionId ?? '0');
  return url.toString();
}

function courseToolUrl(path: string, course: CampusCourseRef): string {
  const url = new URL(path, CAMPUS_BASE);

  url.searchParams.set('cidReq', course.externalId);
  url.searchParams.set('id_session', course.sessionId ?? '0');
  url.searchParams.set('gidReq', '0');
  url.searchParams.set('gradebook', '0');
  url.searchParams.set('origin', '');

  return url.toString();
}

async function fetchDocument(url: string): Promise<Document> {
  const response = await fetch(url, {
    credentials: 'include',
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Campus returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const base = parsed.createElement('base');

  base.href = sanitizeCampusUrl(response.url || url, url);
  parsed.head.prepend(base);

  return parsed;
}

async function syncDocuments(course: CampusCourseRef): Promise<SyncedDocument[]> {
  const rootUrl = courseToolUrl('/main/document/document.php', course);
  const results = new Map<string, SyncedDocument>();
  const visited = new Set<string>();

  async function visit(url: string): Promise<void> {
    const cleanUrl = sanitizeCampusUrl(url, CAMPUS_BASE);
    if (visited.has(cleanUrl)) return;
    visited.add(cleanUrl);

    const page = await fetchDocument(cleanUrl);
    const items = parseChamiloDocuments(page, course, cleanUrl);

    for (const item of items) {
      results.set(item.externalId, item);
    }

    for (const folder of items.filter((item) => item.kind === 'folder')) {
      await visit(folder.sourceUrl);
    }
  }

  await visit(rootUrl);
  return [...results.values()];
}

async function syncAssignments(
  course: CampusCourseRef,
): Promise<SyncedAssignment[]> {
  const listUrl = courseToolUrl('/main/work/work.php', course);

  const assignments = await withRenderedPage(listUrl, async (page) => {
    await waitForCondition(
      () =>
        page.querySelector('#workList tbody tr.jqgrow') !== null ||
        (page.body.textContent ?? '').includes('Sin registros que mostrar'),
      10000,
    );

    return parseChamiloAssignments(page, course, listUrl);
  });

  return Promise.all(
    assignments.map(async (assignment) => {
      const detailPage = await fetchDocument(assignment.sourceUrl);
      const detail = parseChamiloAssignmentDetail(
        detailPage,
        course,
        assignment.sourceUrl,
      );

      if (!detail) return assignment;

      return {
        ...assignment,
        ...detail,
        ...(assignment.dueAt !== undefined ? { dueAt: assignment.dueAt } : {}),
      };
    }),
  );
}

async function syncAnnouncements(
  course: CampusCourseRef,
): Promise<SyncedAnnouncement[]> {
  const listUrl = courseToolUrl('/main/announcements/announcements.php', course);

  const announcements = await withRenderedPage(listUrl, async (page) => {
    await waitForCondition(
      () =>
        page.querySelector('#announcements tbody tr.jqgrow') !== null ||
        (page.body.textContent ?? '').includes('Sin registros que mostrar'),
      10000,
    );

    return parseChamiloAnnouncements(page, course, listUrl);
  });

  return Promise.all(
    announcements.map(async (announcement) => {
      const detailPage = await fetchDocument(announcement.sourceUrl);
      const detail = parseChamiloAnnouncementDetail(
        detailPage,
        course,
        announcement.sourceUrl,
      );

      if (!detail) return announcement;

      return {
        ...announcement,
        ...detail,
        ...(announcement.author !== undefined
          ? { author: announcement.author }
          : {}),
        ...(announcement.updatedAt !== undefined
          ? { updatedAt: announcement.updatedAt }
          : {}),
      };
    }),
  );
}

function waitForFrameLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Campus page timed out'));
    }, 10000);

    iframe.addEventListener(
      'load',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

async function waitForSelector(
  page: Document,
  selector: string,
  timeoutMs = 6000,
): Promise<Element | null> {
  const existing = page.querySelector(selector);
  if (existing) return existing;

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const element = page.querySelector(selector);
      if (!element) return;

      observer.disconnect();
      window.clearTimeout(timeout);
      resolve(element);
    });

    observer.observe(page.documentElement, {
      childList: true,
      subtree: true,
    });

    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

async function waitForCondition(
  check: () => boolean,
  timeoutMs = 10000,
  intervalMs = 100,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (check()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  return check();
}

async function withRenderedPage<T>(
  url: string,
  read: (page: Document) => Promise<T> | T,
): Promise<T> {
  const iframe = document.createElement('iframe');

  iframe.style.position = 'fixed';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.left = '-9999px';

  const loaded = waitForFrameLoad(iframe);
  iframe.src = url;
  document.documentElement.append(iframe);

  try {
    await loaded;

    const frameDocument = iframe.contentDocument;
    if (!frameDocument) {
      throw new Error('Campus page could not be read');
    }

    return await read(frameDocument);
  } finally {
    iframe.remove();
  }
}

function agendaFingerprint(page: Document): string {
  const title =
    page.querySelector('.fc-center h2, .fc-toolbar-title')?.textContent ?? '';
  const view = page.querySelector('.fc-view-container')?.textContent ?? '';

  return `${title}|${view}`.trim().replace(/\s+/g, ' ');
}

async function waitForAgendaChange(
  page: Document,
  previousFingerprint: string,
  timeoutMs = 5000,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const startedAt = Date.now();

    const check = () => {
      const current = agendaFingerprint(page);

      if (
        (current && current !== previousFingerprint) ||
        Date.now() - startedAt >= timeoutMs
      ) {
        resolve();
        return;
      }

      window.setTimeout(check, 100);
    };

    check();
  });
}

function eventKey(event: SyncedEvent): string {
  return [
    event.sourceType,
    event.sourceExternalId ?? '',
    event.startsAt,
    event.title,
  ].join('|');
}

function collectAgendaEvents(
  results: Map<string, SyncedEvent>,
  page: Document,
  course: CampusCourseRef,
  pageUrl: string,
): void {
  for (const event of parseChamiloEvents(page, course, pageUrl)) {
    results.set(eventKey(event), event);
  }
}

function detectAgendaListView(page: Document): 'year' | 'month' | 'list' {
  const view = page.querySelector<HTMLElement>('.fc-view');
  const className = view?.className ?? '';

  if (className.includes('fc-listYear-view')) return 'year';
  if (className.includes('fc-listMonth-view')) return 'month';
  return 'list';
}

async function activateAgendaListView(page: Document): Promise<'year' | 'month' | 'list'> {
  const yearButton = page.querySelector<HTMLElement>('.fc-listYear-button');
  const monthButton = page.querySelector<HTMLElement>('.fc-listMonth-button');

  const controls = [...page.querySelectorAll<HTMLElement>('button, a')];
  const namedAgendaButton = controls.find((element) => {
    const text = (element.textContent ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

    return text === 'lista agenda';
  });

  const button = yearButton ?? monthButton ?? namedAgendaButton;

  if (!button) return detectAgendaListView(page);

  const before = agendaFingerprint(page);
  button.click();
  await waitForAgendaChange(page, before, 2500);
  await waitForSelector(page, '.fc-list-table, .fc-list-empty');

  return detectAgendaListView(page);
}

async function syncEvents(course: CampusCourseRef): Promise<SyncedEvent[]> {
  const agendaUrl = courseToolUrl('/main/calendar/agenda.php', course);
  const iframe = document.createElement('iframe');

  iframe.style.position = 'fixed';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.left = '-9999px';

  const loaded = waitForFrameLoad(iframe);
  iframe.src = agendaUrl;
  document.documentElement.append(iframe);

  try {
    await loaded;

    const frameDocument = iframe.contentDocument;
    if (!frameDocument) return [];

    await waitForSelector(
      frameDocument,
      '.fc-view-container, .fc-list-table, .fc-list-empty',
      8000,
    );

    const view = await activateAgendaListView(frameDocument);

    const hasList = await waitForCondition(
      () => frameDocument.querySelector('.fc-list-table') !== null,
      4000,
    );

    if (!hasList) return [];

    const results = new Map<string, SyncedEvent>();
    collectAgendaEvents(results, frameDocument, course, agendaUrl);


    if (view === 'month') {
      for (let month = 1; month < AGENDA_MONTHS_TO_SYNC; month += 1) {
        const nextButton = frameDocument.querySelector<HTMLElement>('.fc-next-button');
        if (!nextButton) break;

        const before = agendaFingerprint(frameDocument);
        nextButton.click();
        await waitForAgendaChange(frameDocument, before);
        await waitForSelector(frameDocument, '.fc-list-table, .fc-list-empty', 3000);
        collectAgendaEvents(results, frameDocument, course, agendaUrl);
      }
    }

    return [...results.values()];
  } finally {
    iframe.remove();
  }
}


function inferCourseMetadataFromAnnouncements(
  course: SyncedCourse,
  announcements: SyncedAnnouncement[],
): SyncedCourse {
  const authors = [
    ...new Set(
      announcements
        .map((announcement) => announcement.author?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const announcementScheduleHints = announcements
    .flatMap((announcement) => [announcement.title, announcement.content ?? ''])
    .map((value) => value.trim().replace(/\s+/g, ' '))
    .filter(
      (value) =>
        value.length > 0 &&
        value.length <= 500 &&
        /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i.test(value) &&
        /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|a|hasta)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i.test(value),
    );

  const welcome = announcements
    .map((announcement) => announcement.title)
    .find((title) => /bienvenida.*(?:clase|curso)/i.test(title));

  let inferredTitle: string | undefined;
  let inferredSection: string | undefined;

  if (welcome) {
    const match = welcome.match(
      /bienvenida(?:\s+a\s+la)?\s+(?:clase|curso)\s+(.+?)(?:\s*[-–—]\s*secci[oó]n\s+([a-z0-9-]+))?$/i,
    );

    inferredTitle = match?.[1] ? cleanText(match[1]) : undefined;
    inferredSection = match?.[2] ? cleanText(match[2]) : undefined;
  }

  const scheduleHints = [
    ...(course.scheduleHints ?? []),
    ...announcementScheduleHints,
  ].filter((value, index, values) => values.indexOf(value) === index);

  return {
    ...course,
    ...(course.title === course.externalId && inferredTitle
      ? { title: inferredTitle }
      : {}),
    ...(course.teacher === undefined && authors.length === 1
      ? { teacher: authors[0] }
      : {}),
    ...(course.section === undefined && inferredSection
      ? { section: inferredSection }
      : {}),
    ...(scheduleHints.length > 0 ? { scheduleHints } : {}),
  };
}

function mergeAssignmentEvents(
  course: CampusCourseRef,
  events: SyncedEvent[],
  assignments: SyncedAssignment[],
): SyncedEvent[] {
  const results = new Map(events.map((event) => [eventKey(event), event]));
  const assignmentIds = new Set(
    events
      .filter((event) => event.sourceType === 'assignment')
      .map((event) => event.sourceExternalId)
      .filter((value): value is string => value !== undefined),
  );

  for (const assignment of assignments) {
    if (!assignment.dueAt || assignmentIds.has(assignment.externalId)) continue;

    const event: SyncedEvent = {
      courseExternalId: course.externalId,
      title: `Entrega de tarea ${assignment.title}`,
      startsAt: assignment.dueAt,
      allDay: false,
      sourceType: 'assignment',
      sourceExternalId: assignment.externalId,
      sourceUrl: assignment.sourceUrl,
    };

    results.set(eventKey(event), event);
  }

  return [...results.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

async function syncCourse() {
  const courseRef = currentCourseRef();
  if (!courseRef) {
    throw new Error('Open a UJCV course before syncing');
  }

  const courseUrl = courseHomeUrl(courseRef);
  const coursePage = await fetchDocument(courseUrl);
  const course = parseChamiloCoursePage(coursePage, courseRef, courseUrl);

  const [documents, assignments, announcements, agendaEvents] = await Promise.all([
    syncDocuments(course),
    syncAssignments(course),
    syncAnnouncements(course),
    syncEvents(course),
  ]);

  const events = mergeAssignmentEvents(course, agendaEvents, assignments);
  const enrichedCourse = inferCourseMetadataFromAnnouncements(course, announcements);

  return {
    course: enrichedCourse,
    documents,
    assignments,
    announcements,
    events,
  };
}

chrome.runtime.onMessage.addListener(
  (message: PulseRequest, _sender, sendResponse) => {
    if (message.type === 'pulse:inspect') {
      sendResponse(inspectCurrentPage());
      return false;
    }

    if (message.type === 'pulse:sync-course') {
      void syncCourse()
        .then((data) => {
          sendResponse({
            ok: true,
            data,
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    }

    return false;
  },
);
