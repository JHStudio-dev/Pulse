'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createFirstPeriod, type OnboardingResult } from './actions';

interface CampusOption {
  id: string;
  label: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-[color:var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Guardando' : 'Empezar'}
    </button>
  );
}

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

export function OnboardingForm({
  campuses,
  timeZone,
}: {
  campuses: CampusOption[];
  timeZone: string;
}) {
  const [state, formAction] = useActionState<OnboardingResult, FormData>(createFirstPeriod, {
    error: null,
  });

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="campusInstanceId" className="block text-sm font-medium">
          Universidad
        </label>
        <select
          id="campusInstanceId"
          name="campusInstanceId"
          required
          defaultValue=""
          className={field}
        >
          <option value="" disabled>
            Elige tu universidad
          </option>
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>
              {campus.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Nombre del período
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={120}
          placeholder="Ej. III Período 2026"
          className={field}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium">
            Inicio
          </label>
          <input id="startDate" name="startDate" type="date" required className={field} />
        </div>
        <div>
          <label htmlFor="endDate" className="block text-sm font-medium">
            Fin
          </label>
          <input id="endDate" name="endDate" type="date" className={field} />
          <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">Opcional.</p>
        </div>
      </div>

      {/* Detected from the browser, editable: it drives every schedule calculation. */}
      <div>
        <label htmlFor="timeZone" className="block text-sm font-medium">
          Zona horaria
        </label>
        <input id="timeZone" name="timeZone" required defaultValue={timeZone} className={field} />
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
