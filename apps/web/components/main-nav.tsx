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

  return (
    <nav aria-label="Secciones" className="-mb-px flex gap-5 text-sm">
      {NAV_SECTIONS.map((section) => {
        const active = isActiveSection(section.href, pathname);

        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'border-b-2 border-[color:var(--color-ink)] pb-2.5 font-medium'
                : 'text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] border-b-2 border-transparent pb-2.5'
            }
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
