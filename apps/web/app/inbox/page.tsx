import { redirect } from 'next/navigation';
import type { Subject, SubjectId } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';
import { deleteInboxItem, discardInboxItem } from './actions';
import { ConvertInboxItem, EditInboxItem } from './inbox-item';

/** "hoy 14:32" for something captured today, otherwise a short date and time. */
function formatCaptured(instant: string, timeZone: string): string {
  const date = new Date(instant);
  const time = new Intl.DateTimeFormat('es', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);

  const day = new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(date);

  const todayLabel = new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date());

  return day === todayLabel ? `Hoy ${time}` : `${day} · ${time}`;
}

export default async function InboxPage() {
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const [subjects, items] = await Promise.all([
    db.subjects.listByPeriod(userId, period.id),
    db.inbox.listByUser(userId),
  ]);

  const subjectsById: ReadonlyMap<SubjectId, Subject> = new Map(subjects.map((s) => [s.id, s]));
  const options = subjects.map((s) => ({ id: s.id as string, name: s.name }));

  const pending = items.filter((item) => item.status === 'unprocessed');
  const closed = items.filter((item) => item.status !== 'unprocessed');

  return (
    <AppShell email={email} subjects={options}>
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
        {pending.length === 0 ? 'Nada por organizar' : `${pending.length} sin organizar`}
      </p>

      {items.length === 0 ? (
        <div className="mt-10 border-t border-[color:var(--color-border)] pt-8">
          <h2 className="text-base font-medium">Anota primero, organiza después</h2>
          <p className="text-[color:var(--color-ink-muted)] mt-2 max-w-md text-sm">
            Usa el botón + de la barra superior para guardar algo en segundos. El texto se conserva
            tal cual y aquí decides si se convierte en tarea.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-6" aria-labelledby="pending-heading">
            <h2 id="pending-heading" className="text-sm font-medium">
              Sin organizar
            </h2>

            {pending.length === 0 ? (
              <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
                No queda nada por organizar.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
                {pending.map((item) => {
                  const subject = item.subjectId ? subjectsById.get(item.subjectId) : undefined;

                  return (
                    <li key={item.id} className="py-3">
                      {/* The captured text is shown exactly as written. */}
                      <p className="text-sm break-words whitespace-pre-wrap">{item.rawText}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-[color:var(--color-ink-muted)] text-xs">
                          {formatCaptured(item.createdAt, period.timeZone)}
                          {subject ? ` · ${subject.name}` : ''}
                        </span>

                        <div className="ml-auto flex flex-wrap items-center gap-3">
                          <ConvertInboxItem item={item} subjects={options} />
                          <EditInboxItem item={item} subjects={options} />

                          <form action={discardInboxItem}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <button
                              type="submit"
                              className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
                            >
                              Listo
                            </button>
                          </form>

                          <form action={deleteInboxItem}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <button
                              type="submit"
                              className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
                            >
                              Eliminar
                            </button>
                          </form>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {closed.length > 0 ? (
            <section className="mt-10" aria-labelledby="closed-heading">
              <h2 id="closed-heading" className="text-sm font-medium">
                Ya organizadas
              </h2>
              <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
                {closed.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
                  >
                    <span className="text-[color:var(--color-ink-muted)] text-sm break-words">
                      {item.rawText}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-[color:var(--color-ink-muted)] text-xs">
                        {item.status === 'converted' ? 'Convertida en tarea' : 'Descartada'}
                      </span>
                      <form action={deleteInboxItem}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <button
                          type="submit"
                          className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
                        >
                          Eliminar
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
