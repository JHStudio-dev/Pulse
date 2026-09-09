import Link from 'next/link';
import { signOut } from '@/app/auth/actions';

/**
 * Frame for every signed in screen.
 *
 * Navigation stays flat while there are few sections; a sidebar is not worth it
 * until the product has more than a handful of destinations.
 */

const links = [
  { href: '/', label: 'Inicio' },
  { href: '/subjects', label: 'Materias' },
];

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[color:var(--color-border)]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <span className="font-semibold tracking-tight">Pulse</span>

          <nav aria-label="Principal" className="flex gap-4 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-[color:var(--color-ink-muted)] hidden text-xs sm:inline">
              {email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 text-xs"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
