import type { CampusSyncItemKind, CampusSyncSection, CampusSyncSnapshot } from '@pulse/types';

const SECTION_KIND: Record<CampusSyncSection, CampusSyncItemKind | null> = {
  documents: 'document',
  assignments: 'assignment',
  announcements: 'announcement',
  // The agenda is read from the current month on, so past events drop out of
  // every read without having been removed.
  events: null,
};

/**
 * Item kinds whose absence from this snapshot means the campus removed them.
 *
 * Only sections the reader confirms it read in full count. A snapshot that
 * does not say which sections it read confirms nothing.
 */
export function confirmedCampusKinds(
  snapshot: Pick<CampusSyncSnapshot, 'readSections'>,
): CampusSyncItemKind[] {
  return [...new Set(snapshot.readSections ?? [])]
    .map((section) => SECTION_KIND[section])
    .filter((kind): kind is CampusSyncItemKind => kind !== null);
}
