'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { createTask, type TaskResult } from './actions';

const field =
  'w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Agregando' : 'Agregar'}
    </button>
  );
}

/**
 * One line to add a task.
 *
 * Focus returns to the title after a save so several tasks can be entered in a
 * row without reaching for the mouse.
 */
export function QuickAdd({ subjects }: { subjects: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState<TaskResult, FormData>(createTask, {
    error: null,
    saved: false,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (state.saved && state.error === null && submitted.current) {
      formRef.current?.reset();
      titleRef.current?.focus();
      submitted.current = false;
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={(data) => {
        submitted.current = true;
        formAction(data);
      }}
      className="space-y-3"
    >
      <div>
        <label htmlFor="title" className="sr-only">
          Título de la tarea
        </label>
        <input
          ref={titleRef}
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="¿Qué tienes que hacer?"
          className={field}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="subjectId" className="sr-only">
            Materia
          </label>
          <select id="subjectId" name="subjectId" defaultValue="" className={field}>
            <option value="">Sin materia</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[9rem] flex-1">
          <label htmlFor="dueDate" className="sr-only">
            Fecha límite
          </label>
          <input id="dueDate" name="dueDate" type="date" className={field} />
        </div>

        <SubmitButton />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
