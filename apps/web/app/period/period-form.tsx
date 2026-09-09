'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { updatePeriod, type PeriodResult } from './actions';

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Guardando' : 'Guardar cambios'}
    </button>
  );
}

export function PeriodForm({
  name,
  startDate,
  endDate,
  timeZone,
}: {
  name: string;
  startDate: string;
  endDate: string | null;
  timeZone: string;
}) {
  const [state, formAction] = useActionState<PeriodResult, FormData>(updatePeriod, {
    error: null,
    saved: false,
  });

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          defaultValue={name}
          className={field}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium">
            Inicio
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={startDate}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="endDate" className="block text-sm font-medium">
            Fin
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={endDate ?? ''}
            aria-describedby="end-hint"
            className={field}
          />
          <p id="end-hint" className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">
            Necesaria para generar las clases del período.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="timeZone" className="block text-sm font-medium">
          Zona horaria
        </label>
        <input
          id="timeZone"
          name="timeZone"
          required
          defaultValue={timeZone}
          aria-describedby="tz-hint"
          className={field}
        />
        <p id="tz-hint" className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">
          Define a qué hora real corresponde cada clase.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />

        {state.error ? (
          <span role="alert" className="text-sm">
            {state.error}
          </span>
        ) : null}

        {state.saved && state.error === null ? (
          <span role="status" className="text-[color:var(--color-ink-muted)] text-sm">
            Cambios guardados
          </span>
        ) : null}
      </div>
    </form>
  );
}
