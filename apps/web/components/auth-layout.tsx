import type { ReactNode } from 'react';

/**
 * Frame for the signed out screens.
 *
 * The mark sits above the heading so Pulse is identifiable without a banner or
 * marketing copy. Vertical centring is dropped below `sm` so a phone keyboard
 * cannot push the form off screen.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-6 pt-16 pb-12 sm:justify-center sm:pt-12">
      <p className="text-[color:var(--color-ink-muted)] text-xs font-semibold tracking-[0.18em] uppercase">
        Pulse
      </p>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-sm">{description}</p>
      ) : null}

      <div className="mt-8">{children}</div>

      {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
    </main>
  );
}
