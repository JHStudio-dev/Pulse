/**
 * Sections of the signed in application.
 *
 * Declared in one place so the desktop header and a later mobile pattern render
 * the same list. Only sections that actually work belong here: an unfinished
 * screen must not appear as a working link.
 */

export interface NavSection {
  href: string;
  label: string;
}

export const NAV_SECTIONS: readonly NavSection[] = [
  { href: '/', label: 'Inicio' },
  { href: '/subjects', label: 'Materias' },
  { href: '/period', label: 'Período' },
];

/** Marks a section active, treating "/" as an exact match only. */
export function isActiveSection(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
