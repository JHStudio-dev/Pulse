'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveSessionNote, type ClassResult } from './actions';

/**
 * The written record of a class.
 *
 * Separate from the markers: markers are moments, this is the page the student
 * keeps. Clearing it deletes the note rather than leaving an empty one behind.
 */

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-60"
    >
      {pending ? 'Guardando' : 'Guardar apuntes'}
    </button>
  );
}

export function SessionNote({ sessionId, body }: { sessionId: string; body: string }) {
  const [state, formAction] = useActionState<ClassResult, FormData>(saveSessionNote, {
    error: null,
    saved: false,
  });

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="sessionId" value={sessionId} />

      <label htmlFor="session-note" className="sr-only">
        Apuntes de la clase
      </label>
      <textarea
        id="session-note"
        name="body"
        rows={6}
        maxLength={20000}
        defaultValue={body}
        placeholder="Lo que se vio en la clase"
        className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SaveButton />
        {state.saved && state.error === null ? (
          <span className="text-[color:var(--color-ink-muted)] text-xs">Apuntes guardados</span>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
