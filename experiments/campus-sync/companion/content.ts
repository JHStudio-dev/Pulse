import {
  getChamiloCourseRef,
  inspectChamiloAssignmentDeadline,
  isChamiloLoginPage,
  mergeChamiloAssignmentDeadlines,
  mergeChamiloAssignmentDetail,
  parseChamiloAnnouncementDetail,
  parseChamiloAnnouncements,
  parseChamiloAssignmentDetail,
  parseChamiloAssignments,
  parseChamiloCourses,
  parseChamiloDocuments,
  parseChamiloEvents,
  parseChamiloCoursePage,
  sanitizeCampusUrl,
} from '../src/chamilo.ts';
import {
  BATCH_STORAGE_KEY,
  RUN_STORAGE_KEY,
  SNAPSHOT_STORAGE_KEY,
  createSyncRun,
  failSyncRun,
  finishSyncRun,
  mapWithConcurrency,
  mergeSyncBatch,
  readCourseSections,
  readStoredBatch,
  syncCourseBatch,
  type CampusSection,
  type CampusSnapshot,
  type CourseTarget,
  type SyncRun,
} from '../src/companion-state.ts';
import type {
  CampusCourseRef,
  SyncedAnnouncement,
  SyncedAssignment,
  SyncedCourse,
  SyncedDocument,
  SyncedEvent,
} from '../src/connector-contract.ts';
import { isCompanionRequest, type StartSyncResponse, type SyncCourseResponse } from './messages.ts';

type PageKind =
  | 'course'
  | 'documents'
  | 'assignments'
  | 'assignment_detail'
  | 'announcements'
  | 'agenda'
  | 'unknown';

const CAMPUS_BASE = 'https://campus.ujcv.edu.hn';
const AGENDA_MONTHS_TO_SYNC = 6;
const PAGE_LOAD_TIMEOUT_MS = 20_000;
const LIST_RENDER_TIMEOUT_MS = 15_000;
const DETAIL_CONCURRENCY = 4;
const EMPTY_LIST_TEXT = 'Sin registros que mostrar';

const SESSION_EXPIRED_MESSAGE =
  'La sesión del campus expiró. Inicia sesión de nuevo y repite la sincronización.';

class CampusSessionExpiredError extends Error {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE);
  }
}

let activeSync: string | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cleanCampusText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function detectPageKind(url: URL): PageKind {
  if (url.pathname.includes('/main/document/document.php')) return 'documents';
  if (url.pathname.includes('/main/work/work_list.php')) return 'assignment_detail';
  if (url.pathname.includes('/main/work/work.php')) return 'assignments';
  if (url.pathname.includes('/main/announcements/announcements.php')) {
    return 'announcements';
  }
  if (url.pathname.includes('/main/calendar/agenda.php')) return 'agenda';
  if (/\/courses\/[^/]+\/index\.php$/i.test(url.pathname)) return 'course';
  return 'unknown';
}

function currentCourseRef(): CampusCourseRef | null {
  return getChamiloCourseRef(location.href);
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
    case 'assignment_detail':
      data = {
        assignment: parseChamiloAssignmentDetail(document, course, location.href),
        deadline: inspectChamiloAssignmentDeadline(document),
      };
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchCampusResponse(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { credentials: 'include', redirect: 'follow' });
      const retryable = response.status >= 500 || response.status === 429;

      if (response.ok || !retryable || attempt === 2) return response;
    } catch (error) {
      if (attempt === 2) throw new Error(`No se pudo contactar el campus: ${errorMessage(error)}`);
    }

    // One retry absorbs a brief campus hiccup without hiding a real outage.
    await delay(800);
  }
}

async function fetchDocument(url: string): Promise<Document> {
  const response = await fetchCampusResponse(url);

  if (!response.ok) {
    throw new Error(`El campus respondió HTTP ${response.status}`);
  }

  const html = await response.text();
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  if (isChamiloLoginPage(parsed)) throw new CampusSessionExpiredError();

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

async function waitForJqGridRows(page: Document, tableSelector: string, label: string): Promise<void> {
  const rendered = await waitForCondition(
    () =>
      page.querySelector(`${tableSelector} tbody tr.jqgrow`) !== null ||
      (page.body.textContent ?? '').includes(EMPTY_LIST_TEXT),
    LIST_RENDER_TIMEOUT_MS,
  );

  // Neither rows nor the empty message: the tool is off or never finished loading.
  if (!rendered) throw new Error(`${label} no terminó de cargar`);
}

async function syncAssignments(course: CampusCourseRef): Promise<SyncedAssignment[]> {
  const listUrl = courseToolUrl('/main/work/work.php', course);

  const assignments = await withRenderedPage(listUrl, async (page) => {
    await waitForJqGridRows(page, '#workList', 'La lista de tareas');
    return parseChamiloAssignments(page, course, listUrl);
  });

  return mapWithConcurrency(assignments, DETAIL_CONCURRENCY, async (assignment) => {
    const detailPage = await fetchDocument(assignment.sourceUrl);
    const detail = parseChamiloAssignmentDetail(detailPage, course, assignment.sourceUrl);

    return mergeChamiloAssignmentDetail(assignment, detail);
  });
}

async function syncAnnouncements(course: CampusCourseRef): Promise<SyncedAnnouncement[]> {
  const listUrl = courseToolUrl('/main/announcements/announcements.php', course);

  const announcements = await withRenderedPage(listUrl, async (page) => {
    await waitForJqGridRows(page, '#announcements', 'La lista de anuncios');
    return parseChamiloAnnouncements(page, course, listUrl);
  });

  return mapWithConcurrency(announcements, DETAIL_CONCURRENCY, async (announcement) => {
    const detailPage = await fetchDocument(announcement.sourceUrl);
    const detail = parseChamiloAnnouncementDetail(detailPage, course, announcement.sourceUrl);

    if (!detail) return announcement;

    return {
      ...announcement,
      ...detail,
      ...(announcement.author !== undefined ? { author: announcement.author } : {}),
      ...(announcement.updatedAt !== undefined ? { updatedAt: announcement.updatedAt } : {}),
    };
  });
}

function waitForFrameLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('La página del campus tardó demasiado en cargar'));
    }, PAGE_LOAD_TIMEOUT_MS);

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
    await delay(intervalMs);
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
      throw new Error('No se pudo leer la página del campus');
    }
    if (isChamiloLoginPage(frameDocument)) throw new CampusSessionExpiredError();

    return await read(frameDocument);
  } finally {
    iframe.remove();
  }
}

function agendaFingerprint(page: Document): string {
  const title = page.querySelector('.fc-center h2, .fc-toolbar-title')?.textContent ?? '';
  const view = page.querySelector('.fc-view-container')?.textContent ?? '';

  return `${title}|${view}`.trim().replace(/\s+/g, ' ');
}

async function waitForAgendaChange(
  page: Document,
  previousFingerprint: string,
  timeoutMs = 5000,
): Promise<void> {
  await waitForCondition(() => {
    const current = agendaFingerprint(page);
    return current.length > 0 && current !== previousFingerprint;
  }, timeoutMs);
}

function eventKey(event: SyncedEvent): string {
  return [event.sourceType, event.sourceExternalId ?? '', event.startsAt, event.title].join('|');
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
    const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

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

  return withRenderedPage(agendaUrl, async (page) => {
    await waitForSelector(page, '.fc-view-container, .fc-list-table, .fc-list-empty', 8000);

    const view = await activateAgendaListView(page);
    const listed = await waitForCondition(
      () => page.querySelector('.fc-list-table, .fc-list-empty') !== null,
      4000,
    );

    if (!listed) throw new Error('La agenda no terminó de cargar');

    const results = new Map<string, SyncedEvent>();
    collectAgendaEvents(results, page, course, agendaUrl);

    // An empty month still has later months worth reading.
    if (view === 'month') {
      for (let month = 1; month < AGENDA_MONTHS_TO_SYNC; month += 1) {
        const nextButton = page.querySelector<HTMLElement>('.fc-next-button');
        if (!nextButton) break;

        const before = agendaFingerprint(page);
        nextButton.click();
        await waitForAgendaChange(page, before);
        await waitForSelector(page, '.fc-list-table, .fc-list-empty', 3000);
        collectAgendaEvents(results, page, course, agendaUrl);
      }
    }

    return [...results.values()];
  });
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
        /\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|a|hasta)\s*\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i.test(
          value,
        ),
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

    inferredTitle = match?.[1] ? cleanCampusText(match[1]) : undefined;
    inferredSection = match?.[2] ? cleanCampusText(match[2]) : undefined;
  }

  const scheduleHints = [...(course.scheduleHints ?? []), ...announcementScheduleHints].filter(
    (value, index, values) => values.indexOf(value) === index,
  );

  return {
    ...course,
    ...(course.title === course.externalId && inferredTitle ? { title: inferredTitle } : {}),
    ...(course.teacher === undefined && authors.length === 1 ? { teacher: authors[0] } : {}),
    ...(course.section === undefined && inferredSection ? { section: inferredSection } : {}),
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

async function syncCourse(
  courseRef: CampusCourseRef,
): Promise<{ snapshot: CampusSnapshot; unread: Array<{ section: CampusSection; error: string }> }> {
  const courseUrl = courseHomeUrl(courseRef);
  const coursePage = await fetchDocument(courseUrl);
  const course = parseChamiloCoursePage(coursePage, courseRef, courseUrl);

  const { sections, unread } = await readCourseSections({
    documents: () => syncDocuments(course),
    assignments: () => syncAssignments(course),
    announcements: () => syncAnnouncements(course),
    events: () => syncEvents(course),
  });

  // An expired session is a course failure, not four empty sections.
  if (unread.some((entry) => entry.error === SESSION_EXPIRED_MESSAGE)) {
    throw new CampusSessionExpiredError();
  }

  const assignments = mergeChamiloAssignmentDeadlines(sections.assignments, sections.events);
  const events = mergeAssignmentEvents(course, sections.events, assignments);

  return {
    snapshot: {
      course: inferCourseMetadataFromAnnouncements(course, sections.announcements),
      documents: sections.documents,
      assignments,
      announcements: sections.announcements,
      events,
    },
    unread,
  };
}

async function discoverCampusCourses(): Promise<SyncedCourse[]> {
  const urls = [CAMPUS_BASE, `${CAMPUS_BASE}/user_portal.php`];

  for (const url of urls) {
    try {
      const page = await fetchDocument(url);
      const discovered = parseChamiloCourses(page, url);
      if (discovered.length > 0) return discovered;
    } catch (error) {
      if (error instanceof CampusSessionExpiredError) throw error;
      // Try the next authenticated campus entry point.
    }
  }

  return parseChamiloCourses(document, location.href);
}

async function saveRun(run: SyncRun): Promise<void> {
  await chrome.storage.local.set({ [RUN_STORAGE_KEY]: run });
}

async function runBatchSync(
  runId: string,
  mode: SyncRun['mode'],
  requested: CourseTarget[] | null,
): Promise<void> {
  let run = createSyncRun(runId, mode, Date.now());
  await saveRun(run);

  try {
    const targets = requested ?? (await discoverCampusCourses());
    if (targets.length === 0) {
      throw new Error('No se encontraron materias en la página principal del campus.');
    }

    const synced = await syncCourseBatch(run, targets, {
      syncCourse,
      save: saveRun,
      isFatal: (error) => error instanceof CampusSessionExpiredError,
    });
    run = synced.run;

    const stored = await chrome.storage.local.get(BATCH_STORAGE_KEY);
    const previous = mode === 'retry' ? readStoredBatch(stored[BATCH_STORAGE_KEY]) : null;

    await chrome.storage.local.set({ [BATCH_STORAGE_KEY]: mergeSyncBatch(previous, synced.batch) });
    await chrome.storage.local.remove(SNAPSHOT_STORAGE_KEY);

    run =
      synced.fatalError !== null
        ? failSyncRun(run, synced.fatalError, Date.now())
        : finishSyncRun(run, Date.now());
    await saveRun(run);
  } catch (error) {
    run = failSyncRun(run, errorMessage(error), Date.now());
    await saveRun(run);
  }
}

function startBatchSync(mode: SyncRun['mode'], courses: CourseTarget[] | null): StartSyncResponse {
  const targets =
    courses?.filter((course) => typeof course?.externalId === 'string' && course.externalId) ??
    null;

  if (targets?.length === 0) return { ok: false, error: 'No hay materias para reintentar.' };

  if (activeSync) {
    return { ok: false, error: 'Ya hay una sincronización en curso en esta pestaña.' };
  }

  const runId = crypto.randomUUID();
  activeSync = runId;

  void runBatchSync(runId, mode, targets).finally(() => {
    if (activeSync === runId) activeSync = null;
  });

  return { ok: true };
}

async function syncCurrentCourse(): Promise<SyncCourseResponse> {
  const courseRef = currentCourseRef();
  if (!courseRef) return { ok: false, error: 'Abre una materia de UJCV antes de sincronizar.' };

  if (activeSync) {
    return { ok: false, error: 'Ya hay una sincronización en curso en esta pestaña.' };
  }

  activeSync = 'course';

  try {
    const { snapshot, unread } = await syncCourse(courseRef);

    // Stored here so the result survives the popup closing.
    await chrome.storage.local.set({ [SNAPSHOT_STORAGE_KEY]: snapshot });
    await chrome.storage.local.remove([BATCH_STORAGE_KEY, RUN_STORAGE_KEY]);

    return { ok: true, snapshot, unread: unread.map((entry) => entry.section) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  } finally {
    activeSync = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isCompanionRequest(message)) return false;

  switch (message.type) {
    case 'pulse:inspect':
      sendResponse(inspectCurrentPage());
      return false;

    case 'pulse:sync-course':
      void syncCurrentCourse().then(sendResponse);
      return true;

    case 'pulse:sync-all-courses':
      sendResponse(startBatchSync('all', null));
      return false;

    case 'pulse:sync-courses':
      sendResponse(startBatchSync('retry', message.courses));
      return false;
  }
});
