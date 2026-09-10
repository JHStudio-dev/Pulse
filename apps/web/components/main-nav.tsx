'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveSection, NAV_SECTIONS } from './navigation';

/**
 * Primary navigation.
 *
 * The active section is marked with a rule rather than colour alone, so the
 * current location survives a colour-blind reading.
 */
export function MainNav() {
  const pathname = usePathname();

  // Scrolls within itself: with several sections the row no longer fits a
  // phone, and letting it push the page would break every screen's layout.
  return (
    <nav
      aria-label="Secciones"
      className="-mb-px flex gap-5 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {NAV_SECTIONS.map((section) => {
        const active = isActiveSection(section.href, pathname);

        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'shrink-0 border-b-2 border-[color:var(--color-ink)] pb-2.5 font-medium'
                : 'text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] shrink-0 border-b-2 border-transparent pb-2.5'
            }
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
