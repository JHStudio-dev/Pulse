import { signOut } from '@/app/auth/actions';
import { QuickCapture } from '@/app/capture/quick-capture';
import { MainNav } from './main-nav';

/**
 * Frame for every signed in screen.
 *
 * Two rows: identity and account on top, sections below. Splitting them keeps
 * the header readable on a phone without a menu, and leaves the section row as
 * the natural place to swap in a mobile pattern once there are more sections.
 */
export function AppShell({
  email,
  subjects = [],
  children,
}: {
  email: string;
  subjects?: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-[color:var(--color-border)]">
        <div className="mx-auto max-w-3xl px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-sm font-semibold tracking-tight">Pulse</span>

            <div className="flex items-center gap-3">
              <QuickCapture subjects={subjects} />

              <span className="text-[color:var(--color-ink-muted)] hidden max-w-[16rem] truncate text-xs sm:inline">
                {email}
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
                >
                  Salir
                </button>
              </form>
            </div>
          </div>

          <MainNav />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
