'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Compact modal built on the native dialog element.
 *
 * Using <dialog> rather than a custom overlay keeps focus trapping, Escape and
 * inert background behaviour in the browser, which is far more reliable than
 * reimplementing them and costs no dependency.
 */
export function Dialog({
  trigger,
  title,
  children,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      {trigger(() => setOpen(true))}

      <dialog
        ref={ref}
        aria-label={title}
        onClose={() => setOpen(false)}
        // Clicking the backdrop closes; clicks inside the panel must not.
        onClick={(event) => {
          if (event.target === ref.current) setOpen(false);
        }}
        className="bg-[color:var(--color-surface)] text-[color:var(--color-ink)] m-auto w-[calc(100vw-2rem)] max-w-lg rounded-lg border border-[color:var(--color-border)] p-0 backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between gap-4 border-b border-[color:var(--color-border)] px-5 py-3">
          <h2 className="text-sm font-medium">{title}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-sm"
          >
            Cerrar
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {open ? children(() => setOpen(false)) : null}
        </div>
      </dialog>
    </>
  );
}
