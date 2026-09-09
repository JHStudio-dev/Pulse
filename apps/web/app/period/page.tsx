import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { formatSessionDate } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { PeriodForm } from './period-form';

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planificado',
  active: 'Activo',
  archived: 'Archivado',
};

export default async function PeriodPage() {
  const { userId, email, db } = await requireUser();

  const active = await db.periods.findActive(userId);
  if (!active) redirect('/onboarding');

  const all = await db.periods.listByUser(userId);
  const others = all.filter((period) => period.id !== active.id);

  return (
    <AppShell email={email}>
      <h1 className="text-2xl font-semibold tracking-tight">Período</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
        Tus materias, horarios y clases pertenecen a este período.
      </p>

      <section className="mt-8" aria-labelledby="edit-heading">
        <h2 id="edit-heading" className="sr-only">
          Editar período
        </h2>
        <PeriodForm
          name={active.name}
          startDate={active.range.start}
          endDate={active.range.end}
          timeZone={active.timeZone}
        />
      </section>

      {others.length > 0 ? (
        <section className="mt-12" aria-labelledby="others-heading">
          <h2 id="others-heading" className="text-sm font-medium">
            Otros períodos
          </h2>
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {others.map((period) => (
              <li
                key={period.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="text-sm">{period.name}</span>
                <span className="text-[color:var(--color-ink-muted)] text-xs">
                  {formatSessionDate(period.range.start)}
                  {period.range.end === null
                    ? ''
                    : ` — ${formatSessionDate(period.range.end)}`} ·{' '}
                  {STATUS_LABEL[period.status] ?? period.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
