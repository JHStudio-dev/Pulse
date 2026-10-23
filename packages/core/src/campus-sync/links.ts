import type { CampusSubjectLink } from '@pulse/types';

type LinkIdentity = Pick<
  CampusSubjectLink,
  'campusConnectionId' | 'externalCourseId' | 'externalSessionId'
>;

/** An empty session id carries no information, so it means "no session". */
export function normalizeExternalSessionId(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

/**
 * Finds the link a campus course already has.
 *
 * An exact session match wins. A link stored without a session matches any
 * session of that course, and a course sent without a session matches its only
 * link, because neither side can tell offerings apart. Anything more ambiguous
 * returns null rather than guessing.
 */
export function resolveCampusSubjectLink<T extends LinkIdentity>(
  links: readonly T[],
  target: LinkIdentity,
): T | null {
  const sameCourse = links.filter(
    (link) =>
      link.campusConnectionId === target.campusConnectionId &&
      link.externalCourseId === target.externalCourseId,
  );

  const sessionId = normalizeExternalSessionId(target.externalSessionId);
  const exact = sameCourse.find(
    (link) => normalizeExternalSessionId(link.externalSessionId) === sessionId,
  );
  if (exact) return exact;

  if (sessionId === null) return sameCourse.length === 1 ? sameCourse[0]! : null;

  const unscoped = sameCourse.filter(
    (link) => normalizeExternalSessionId(link.externalSessionId) === null,
  );
  return unscoped.length === 1 ? unscoped[0]! : null;
}
