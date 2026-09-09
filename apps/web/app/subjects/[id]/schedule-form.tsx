'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { createSchedule, type ScheduleResult } from './actions';

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

const WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Guardando' : 'Agregar horario'}
    </button>
  );
}

export function ScheduleForm({ subjectId }: { subjectId: string }) {
  const [state, formAction] = useActionState<ScheduleResult, FormData>(createSchedule, {
    error: null,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const saved = useRef(false);

  useEffect(() => {
    if (state.error === null && saved.current) {
      formRef.current?.reset();
      saved.current = false;
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={(data) => {
        saved.current = true;
        formAction(data);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="subjectId" value={subjectId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="weekday" className="block text-sm font-medium">
            Día
          </label>
          <select id="weekday" name="weekday" required defaultValue="1" className={field}>
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="startTime" className="block text-sm font-medium">
            Inicio
          </label>
          <input id="startTime" name="startTime" type="time" required className={field} />
        </div>
        <div>
          <label htmlFor="endTime" className="block text-sm font-medium">
            Fin
          </label>
          <input id="endTime" name="endTime" type="time" required className={field} />
        </div>
      </div>

      {/* Left blank, the slot inherits the subject's usual modality and place. */}
      <div>
        <label htmlFor="modality" className="block text-sm font-medium">
          Modalidad
        </label>
        <select id="modality" name="modality" defaultValue="" className={field}>
          <option value="">Como la materia</option>
          <option value="in_person">Presencial</option>
          <option value="virtual">Virtual</option>
          <option value="hybrid">Híbrida</option>
          <option value="unconfirmed">Sin confirmar</option>
        </select>
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
