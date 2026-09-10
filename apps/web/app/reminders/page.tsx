import { redirect } from 'next/navigation';
import type { ResolvedReminder } from '@pulse/core';
import { AppShell } from '@/components/app-shell';
import { loadReminders } from '@/lib/reminders';
import { requireUser } from '@/lib/session';
import { deleteReminder } from './actions';

/** "3 días antes", "Al empezar" — describes the rule, not the clock. */
function describeOffset(minutes: number, kind: string): string {
  if (minutes === 0) return kind === 'task' ? 'El mismo día' : 'Al empezar';
  if (minutes < 60) return `${minutes} min antes`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h antes`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? '1 día antes' : `${days} días antes`;
}

function formatMoment(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(instant));
}

function ReminderRow({ entry, timeZone }: { entry: ResolvedReminder; timeZone: string }) {
  const { reminder } = entry;

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
      <span className="text-sm">{entry.targetTitle}</span>

      <span className="text-[color:var(--color-ink-muted)] text-xs">
        {reminder.target.kind === 'task' ? 'Entrega' : 'Clase'} ·{' '}
        {describeOffset(reminder.offsetMinutes, reminder.target.kind)}
      </span>

      <span className="text-[color:var(--color-ink-muted)] ml-auto text-xs">
        {formatMoment(entry.firesAt, timeZone)}
      </span>

      <form action={deleteReminder}>
        <input type="hidden" name="reminderId" value={reminder.id} />
        <button
          type="submit"
          className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
        >
          Quitar
        </button>
      </form>
    </li>
  );
}

export default async function RemindersPage() {
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const now = new Date();
  const [resolved, subjects] = await Promise.all([
    loadReminders(db, userId, period, now),
    db.subjects.listByPeriod(userId, period.id),
  ]);

  const due = resolved.filter((entry) => entry.state === 'due');
  const upcoming = resolved.filter((entry) => entry.state === 'upcoming');
  const expired = resolved.filter((entry) => entry.state === 'expired');

  return (
    <AppShell email={email} subjects={subjects.map((s) => ({ id: s.id as string, name: s.name }))}>
      <h1 className="text-2xl font-semibold tracking-tight">Recordatorios</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
        Los avisos aparecen dentro de Pulse. Todavía no se envían por correo ni notificaciones.
      </p>

      {resolved.length === 0 ? (
        <div className="mt-10 border-t border-[color:var(--color-border)] pt-8">
          <h2 className="text-base font-medium">Sin recordatorios</h2>
          <p className="text-[color:var(--color-ink-muted)] mt-2 max-w-md text-sm">
            Crea uno desde una entrega en Tareas o desde una clase en la página de la materia.
          </p>
        </div>
      ) : (
        <>
          {due.length > 0 ? (
            <section className="mt-8" aria-labelledby="due-heading">
              <h2 id="due-heading" className="text-sm font-medium">
                Ahora
              </h2>
              <ul className="mt-2 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
                {due.map((entry) => (
                  <ReminderRow key={entry.reminder.id} entry={entry} timeZone={period.timeZone} />
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-8" aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="text-sm font-medium">
              Próximos
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
                No hay avisos pendientes.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
                {upcoming.map((entry) => (
                  <ReminderRow key={entry.reminder.id} entry={entry} timeZone={period.timeZone} />
                ))}
              </ul>
            )}
          </section>

          {expired.length > 0 ? (
            <section className="mt-10" aria-labelledby="expired-heading">
              <h2 id="expired-heading" className="text-sm font-medium">
                Ya pasaron
              </h2>
              <ul className="text-[color:var(--color-ink-muted)] mt-2 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
                {expired.map((entry) => (
                  <ReminderRow key={entry.reminder.id} entry={entry} timeZone={period.timeZone} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
