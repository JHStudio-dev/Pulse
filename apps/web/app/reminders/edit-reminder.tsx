'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ResolvedReminder } from '@pulse/core';
import { Dialog } from '@/components/dialog';
import { updateReminder, type ReminderResult } from './actions';

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

const OFFSETS = [
  { value: '0', label: 'En el momento de entrega o inicio' },
  { value: '60', label: '1 hora antes' },
  { value: '180', label: '3 horas antes' },
  { value: '1440', label: '1 día antes' },
  { value: '4320', label: '3 días antes' },
  { value: '10080', label: '7 días antes' },
];

function localMoment(instant: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  );
}

function EditForm({
  entry,
  timeZone,
  close,
}: {
  entry: ResolvedReminder;
  timeZone: string;
  close: () => void;
}) {
  const { reminder } = entry;
  const savedChoice = String(reminder.offsetMinutes);
  const preset = OFFSETS.some((item) => item.value === savedChoice) ? savedChoice : 'custom';
  const [choice, setChoice] = useState(preset);
  const [state, formAction] = useActionState<ReminderResult, FormData>(updateReminder, {
    error: null,
    saved: false,
  });
  const moment = localMoment(entry.firesAt, timeZone);

  useEffect(() => {
    if (state.saved && !state.error) close();
  }, [state, close]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reminderId" value={reminder.id} />

      <label className="block text-sm font-medium">
        Avisarme
        <select
          name="offsetMinutes"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          className={field}
        >
          {OFFSETS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
          <option value="custom">Fecha y hora concretas</option>
        </select>
      </label>

      {choice === 'custom' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Fecha
            <input name="customDate" type="date" required defaultValue={moment.date} className={field} />
          </label>
          <label className="text-sm">
            Hora
            <input name="customTime" type="time" required defaultValue={moment.time} className={field} />
          </label>
        </div>
      ) : null}

      <label className="block text-sm font-medium">
        Mensaje personalizado
        <textarea
          name="message"
          rows={3}
          maxLength={500}
          defaultValue={reminder.message ?? ''}
          className={field}
        />
      </label>

      {state.error ? <p role="alert" className="text-sm text-red-400">{state.error}</p> : null}
      <SubmitButton />
    </form>
  );
}

export function EditReminder({
  entry,
  timeZone,
}: {
  entry: ResolvedReminder;
  timeZone: string;
}) {
  return (
    <Dialog
      title="Editar recordatorio"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
        >
          Editar
        </button>
      )}
    >
      {(close) => <EditForm entry={entry} timeZone={timeZone} close={close} />}
    </Dialog>
  );
}
