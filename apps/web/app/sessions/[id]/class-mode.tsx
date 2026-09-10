'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Countdown } from '@/components/countdown';
import { addMarker, type ClassResult } from './actions';

/**
 * The reduced interface used while a class is running.
 *
 * Only what is needed to follow the class: elapsed time, one place to type, and
 * the five marks. Everything else in the product is one tap away but out of the
 * way, which is the whole point of Class Mode.
 */

const MARKERS = [
  { kind: 'note', label: 'Nota' },
  { kind: 'question', label: 'Duda' },
  { kind: 'important', label: 'Importante' },
  { kind: 'task', label: 'Tarea' },
  { kind: 'missed', label: 'Me perdí' },
] as const;

function elapsedLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Each marker submits the form carrying its own kind, so no extra state is needed. */
function MarkerButton({ kind, label }: { kind: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="kind"
      value={kind}
      disabled={pending}
      className="rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm disabled:opacity-60"
    >
      {label}
    </button>
  );
}

export function ClassMode({
  sessionId,
  startsAt,
  endsAt,
}: {
  sessionId: string;
  startsAt: string;
  endsAt: string;
}) {
  const [state, formAction] = useActionState<ClassResult, FormData>(addMarker, {
    error: null,
    saved: false,
  });
  const [now, setNow] = useState<number | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const submitted = useRef(false);

  // Computed after mount: the server has a different clock than the browser.
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (state.saved && state.error === null && submitted.current) {
      if (noteRef.current) noteRef.current.value = '';
      submitted.current = false;
    }
  }, [state]);

  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const started = now !== null && now >= start;

  // Held at the class length once it is over, so an old class does not show a
  // timer that has been running for days.
  const offset = started ? Math.round((Math.min(now, end) - start) / 1000) : 0;

  return (
    <section
      aria-labelledby="class-mode-heading"
      className="border-y border-[color:var(--color-border)] py-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="class-mode-heading" className="text-sm font-medium">
          Modo clase
        </h2>
        {started ? (
          <span className="font-mono text-lg tabular-nums" aria-live="off">
            {elapsedLabel(offset)}
          </span>
        ) : (
          <span className="text-[color:var(--color-ink-muted)] text-sm">
            <Countdown startsAt={startsAt} />
          </span>
        )}
      </div>

      <form
        action={(data) => {
          submitted.current = true;
          formAction(data);
        }}
        className="mt-4 space-y-3"
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="offsetSeconds" value={offset} />

        <div>
          <label htmlFor="note" className="sr-only">
            Anotación rápida
          </label>
          <textarea
            ref={noteRef}
            id="note"
            name="note"
            rows={2}
            maxLength={500}
            placeholder="Escribe algo y elige cómo marcarlo"
            className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {MARKERS.map((marker) => (
            <MarkerButton key={marker.kind} kind={marker.kind} label={marker.label} />
          ))}
        </div>

        {state.error ? (
          <p role="alert" className="text-sm">
            {state.error}
          </p>
        ) : null}
      </form>

      <p className="text-[color:var(--color-ink-muted)] mt-3 text-xs">
        Cada marca guarda el minuto de la clase, para que puedas volver a ese punto.
      </p>
    </section>
  );
}
