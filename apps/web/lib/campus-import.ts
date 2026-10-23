import { resolveCampusSubjectLink } from '@pulse/core';
import type {
  CampusConnectionId,
  CampusScheduleSuggestion,
  CampusSyncSnapshot,
  Modality,
  Weekday,
} from '@pulse/types';

export type ScheduleDraft = {
  weekdays: Weekday[];
  startTime: string;
  endTime: string;
  modality: Modality;
  meetingUrl: string;
};

export type ImportSubjectOption = { id: string; name: string; code: string | null };

export type ImportCourseLink = {
  campusConnectionId: string;
  externalCourseId: string;
  externalSessionId: string | null;
  subjectId: string;
};

export type CourseImportPlan = { mode: 'link'; subjectId: string } | { mode: 'create' };

/** Identifies a course offering; the same code can exist in two sessions. */
export function campusCourseKey(course: {
  externalId: string;
  sessionId?: string | undefined;
}): string {
  return `${course.externalId}#${course.sessionId ?? ''}`;
}

export function scheduleDraftFromSuggestion(suggestion: CampusScheduleSuggestion): ScheduleDraft {
  return {
    weekdays: [...suggestion.weekdays],
    startTime: suggestion.startTime,
    endTime: suggestion.endTime,
    modality: suggestion.modality,
    meetingUrl: suggestion.meetingUrl ?? '',
  };
}

export function isScheduleDraftComplete(draft: ScheduleDraft): boolean {
  return (
    draft.weekdays.length > 0 &&
    draft.startTime.length > 0 &&
    draft.endTime.length > 0 &&
    draft.startTime < draft.endTime
  );
}

function normalized(value: string | undefined | null): string {
  return (value ?? '').trim().toLocaleLowerCase('es');
}

/**
 * Chooses where a course lands in Pulse.
 *
 * A course keeps the subject it is already linked to. Otherwise it joins an
 * unused subject with the same code or name, and only then is a new one made.
 */
export function planCourseImport(
  snapshot: CampusSyncSnapshot,
  options: {
    connectionId: string | null;
    subjects: readonly ImportSubjectOption[];
    links: readonly ImportCourseLink[];
    usedSubjectIds: ReadonlySet<string>;
  },
): CourseImportPlan {
  if (options.connectionId) {
    const linked = resolveCampusSubjectLink(
      options.links.map((link) => ({
        ...link,
        campusConnectionId: link.campusConnectionId as CampusConnectionId,
      })),
      {
        campusConnectionId: options.connectionId as CampusConnectionId,
        externalCourseId: snapshot.course.externalId,
        externalSessionId: snapshot.course.sessionId ?? null,
      },
    );

    if (linked && options.subjects.some((subject) => subject.id === linked.subjectId)) {
      return { mode: 'link', subjectId: linked.subjectId };
    }

    // Linked to an archived subject of this period: the server decides.
    if (linked) return { mode: 'create' };
  }

  const courseCode = normalized(snapshot.course.code ?? snapshot.course.externalId);
  const courseTitle = normalized(snapshot.course.title);
  const available = options.subjects.filter((subject) => !options.usedSubjectIds.has(subject.id));

  const match =
    available.find((subject) => courseCode.length > 0 && normalized(subject.code) === courseCode) ??
    available.find((subject) => courseTitle.length > 0 && normalized(subject.name) === courseTitle);

  return match ? { mode: 'link', subjectId: match.id } : { mode: 'create' };
}

export function buildIngestRequest(
  snapshot: CampusSyncSnapshot,
  plan: CourseImportPlan,
  confirmedSchedule: ScheduleDraft | null,
  options: { keepArchived?: boolean } = {},
) {
  return {
    ...(plan.mode === 'link'
      ? { mode: 'link' as const, subjectId: plan.subjectId }
      : { mode: 'create' as const }),
    snapshot,
    ...(options.keepArchived ? { restoreArchived: false } : {}),
    ...(confirmedSchedule
      ? {
          schedule: {
            weekdays: [...new Set(confirmedSchedule.weekdays)].sort(),
            startTime: confirmedSchedule.startTime,
            endTime: confirmedSchedule.endTime,
            modality: confirmedSchedule.modality,
            meetingUrl: confirmedSchedule.meetingUrl.trim() || null,
            location: { campus: null, building: null, room: null },
          },
        }
      : {}),
  };
}

const INGEST_ERRORS: Record<string, string> = {
  subject_not_in_active_period: 'La materia elegida no pertenece al período actual.',
  subject_not_found: 'La materia elegida ya no existe.',
  subject_campus_mismatch: 'La materia pertenece a otra universidad.',
  active_period_not_found: 'Configura un período académico activo antes de importar.',
  campus_not_configured: 'Configura tu universidad antes de importar.',
  invalid_snapshot: 'Los datos del campus llegaron incompletos. Sincroniza de nuevo.',
  not_authenticated: 'Tu sesión de Pulse expiró. Vuelve a iniciar sesión.',
  network: 'No se pudo contactar Pulse.',
};

export function ingestErrorMessage(code: string | undefined): string {
  return (code && INGEST_ERRORS[code]) || 'No se pudo guardar esta materia.';
}
