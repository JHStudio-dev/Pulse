import {
  getChamiloCourseId,
  getChamiloSessionId,
  parseChamiloAnnouncements,
  parseChamiloAssignments,
  parseChamiloDocuments,
  parseChamiloEvents,
} from '../src/chamilo.ts';

interface InspectRequest {
  type: 'pulse:inspect';
}

type PageKind = 'course' | 'documents' | 'assignments' | 'announcements' | 'agenda' | 'unknown';

function detectPageKind(url: URL): PageKind {
  if (url.pathname.includes('/main/document/document.php')) {
    return 'documents';
  }

  if (url.pathname.includes('/main/work/work.php')) {
    return 'assignments';
  }

  if (url.pathname.includes('/main/announcements/announcements.php')) {
    return 'announcements';
  }

  if (url.pathname.includes('/main/calendar/agenda.php')) {
    return 'agenda';
  }

  if (/\/courses\/[^/]+\/index\.php$/i.test(url.pathname)) {
    return 'course';
  }

  return 'unknown';
}

chrome.runtime.onMessage.addListener((message: InspectRequest, _sender, sendResponse) => {
  if (message.type !== 'pulse:inspect') return;

  const url = new URL(location.href);
  const courseId = getChamiloCourseId(location.href);

  if (!courseId) {
    sendResponse({
      ok: false,
      pageKind: 'unknown',
      url: location.href,
    });

    return;
  }

  const course = {
    externalId: courseId,
    sessionId: getChamiloSessionId(location.href),
  };

  const pageKind = detectPageKind(url);

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

  sendResponse({
    ok: true,
    courseId,
    sessionId: course.sessionId,
    pageKind,
    title: document.title,
    url: location.href,
    data,
  });
});
