import { describe, expect, it } from 'vitest';
import type { CampusConnectionId } from '@pulse/types';
import { normalizeExternalSessionId, resolveCampusSubjectLink } from './links';

const CONNECTION = 'connection-1' as CampusConnectionId;

function link(id: string, externalCourseId: string, externalSessionId: string | null) {
  return { id, campusConnectionId: CONNECTION, externalCourseId, externalSessionId };
}

function target(externalCourseId: string, externalSessionId: string | null) {
  return { campusConnectionId: CONNECTION, externalCourseId, externalSessionId };
}

describe('campus subject links', () => {
  it('treats a blank session as no session', () => {
    expect(normalizeExternalSessionId('')).toBeNull();
    expect(normalizeExternalSessionId('  ')).toBeNull();
    expect(normalizeExternalSessionId(undefined)).toBeNull();
    expect(normalizeExternalSessionId(' 7 ')).toBe('7');
  });

  it('prefers the exact session', () => {
    const links = [link('a', 'ADM201', '0'), link('b', 'ADM201', '7')];
    expect(resolveCampusSubjectLink(links, target('ADM201', '7'))?.id).toBe('b');
  });

  it('reuses a link stored before sessions were recorded', () => {
    const links = [link('a', 'ADM201', null)];
    expect(resolveCampusSubjectLink(links, target('ADM201', '0'))?.id).toBe('a');
  });

  it('matches a course sent without a session to its only link', () => {
    const links = [link('a', 'ADM201', '0')];
    expect(resolveCampusSubjectLink(links, target('ADM201', null))?.id).toBe('a');
  });

  it('does not guess between two sessions of the same course', () => {
    const links = [link('a', 'ADM201', '0'), link('b', 'ADM201', '7')];
    expect(resolveCampusSubjectLink(links, target('ADM201', null))).toBeNull();
  });

  it('does not reuse a link that belongs to another session', () => {
    const links = [link('a', 'ADM201', '7')];
    expect(resolveCampusSubjectLink(links, target('ADM201', '0'))).toBeNull();
  });

  it('ignores other courses and other campus connections', () => {
    const links = [
      link('a', 'MAT102', '0'),
      { ...link('b', 'ADM201', '0'), campusConnectionId: 'connection-2' as CampusConnectionId },
    ];
    expect(resolveCampusSubjectLink(links, target('ADM201', '0'))).toBeNull();
  });
});
