'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Dialog } from '@/components/dialog';
import { createSessionReminder, createTaskReminder, type ReminderResult } from './actions';

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

const TASK_CHOICES = [
  { value: '0', label: 'En el momento de la entrega' },
  { value: '60', label: '1 hora antes' },
  { value: '180', label: '3 horas antes' },
  { value: '1440', label: '1 día antes' },
  { value: '4320', label: '3 días antes' },
  { value: '10080', label: '7 días antes' },
];

const SESSION_CHOICES = [
  { value: '0', label: 'Al empezar' },
  { value: '10', label: '10 minutos antes' },
  { value: '30', label: '30 minutos antes' },
];

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Creando' : 'Crear recordatorio'}
    </button>
  );
}

function Form({
  kind,
  targetId,
  dueDate,
  close,
}: {
  kind: 'task' | 'session';
  targetId: string;
  dueDate?: string | null;
  close: () => void;
}) {
  const action = kind === 'task' ? createTaskReminder : createSessionReminder;
  const [state, formAction] = useActionState<ReminderResult, FormData>(action, {
    error: null,
    saved: false,
  });
  const [choice, setChoice] = useState(kind === 'task' ? '1440' : '30');
  const choices = kind === 'task' ? TASK_CHOICES : SESSION_CHOICES;

  useEffect(() => {
    if (state.saved && state.error === null) close();
  }, [state, close]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name={kind === 'task' ? 'taskId' : 'sessionId'} value={targetId} />

      {kind === 'task' && !dueDate ? (
        <div className="rounded-md border border-[color:var(--color-border)] p-3">
          <p className="mb-2 text-sm font-medium">Esta tarea no tiene fecha límite</p>
          <p className="text-[color:var(--color-ink-muted)] mb-3 text-xs">
            Agrega una fecha para guardar el recordatorio. Si no indicas una hora, se usará
            el final del día (23:59).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              Fecha límite
              <input name="taskDueDate" type="date" required className={field} />
            </label>
            <label className="text-xs">
              Hora límite (opcional)
              <input name="taskDueTime" type="time" className={field} />
            </label>
          </div>
        </div>
      ) : null}

      <div>
        <label htmlFor="offsetMinutes" className="block text-sm font-medium">
          Avisarme
        </label>
        <select
          id="offsetMinutes"
          name="offsetMinutes"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          className={field}
        >
          {choices.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="custom">Fecha y hora concretas</option>
        </select>
      </div>

      {choice === 'custom' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="customDate" className="block text-sm font-medium">
              Fecha
            </label>
            <input id="customDate" name="customDate" type="date" required className={field} />
          </div>
          <div>
            <label htmlFor="customTime" className="block text-sm font-medium">
              Hora
            </label>
            <input id="customTime" name="customTime" type="time" required className={field} />
          </div>
        </div>
      ) : null}

      <label htmlFor="reminder-message" className="block text-sm font-medium">
        Mensaje personalizado (opcional)
        <textarea
          id="reminder-message"
          name="message"
          rows={2}
          maxLength={500}
          placeholder="Ej.: Terminar el ensayo y revisar el formato"
          className={field}
        />
      </label>
      <p className="text-[color:var(--color-ink-muted)] text-xs">
        Por ahora el aviso y tu mensaje aparecen dentro de Pulse. El envío por correo
        todavía no está activado.
      </p>

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

export function AddReminder({
  kind,
  targetId,
  label = 'Recordarme',
  dueDate,
}: {
  kind: 'task' | 'session';
  targetId: string;
  label?: string;
  dueDate?: string | null;
}) {
  return (
    <Dialog
      title="Nuevo recordatorio"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
        >
          {label}
        </button>
      )}
    >
      {(close) => <Form kind={kind} targetId={targetId} dueDate={dueDate} close={close} />}
    </Dialog>
  );
}
