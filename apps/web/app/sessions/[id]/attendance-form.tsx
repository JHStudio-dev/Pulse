'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AttendanceStatus } from '@pulse/types';
import { recordAttendance, type ClassResult } from './actions';

/**
 * Records how the class went.
 *
 * Marking absent or partial opens a recovery plan automatically, and the form
 * says so before it happens rather than surprising the student with a checklist.
 */

const CHOICES: { value: AttendanceStatus; label: string }[] = [
  { value: 'attended', label: 'Asistí' },
  { value: 'partial', label: 'Asistí parcialmente' },
  { value: 'missed', label: 'No asistí' },
  { value: 'cancelled', label: 'Se canceló' },
];

function SubmitButton({ current }: { current: AttendanceStatus | null }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Guardando' : current === null ? 'Registrar' : 'Actualizar'}
    </button>
  );
}

export function AttendanceForm({
  sessionId,
  current,
  currentNote,
}: {
  sessionId: string;
  current: AttendanceStatus | null;
  currentNote: string | null;
}) {
  const [state, formAction] = useActionState<ClassResult, FormData>(recordAttendance, {
    error: null,
    saved: false,
  });

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="sessionId" value={sessionId} />

      <fieldset>
        <legend className="sr-only">Asistencia</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {CHOICES.map((choice) => (
            <label key={choice.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="status"
                value={choice.value}
                defaultChecked={current === choice.value}
                required
              />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="attendance-note" className="sr-only">
          Nota
        </label>
        <input
          id="attendance-note"
          name="note"
          maxLength={300}
          defaultValue={currentNote ?? ''}
          placeholder="Nota opcional"
          className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton current={current} />
        <span className="text-[color:var(--color-ink-muted)] text-xs">
          Si faltaste, Pulse abre un plan de recuperación.
        </span>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
