import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';

export default async function HomePage() {
  const { userId, email, db } = await requireUser();

  // Without a period there is nothing to organise, so setup comes first.
  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const subjects = await db.subjects.listByPeriod(userId, period.id);
  const subjectLabel = subjects.length === 1 ? 'materia' : 'materias';

  return (
    <AppShell email={email}>
      <h1 className="text-2xl font-semibold tracking-tight">{period.name}</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-sm">
        {period.range.start}
        {period.range.end === null ? '' : ` — ${period.range.end}`} · {period.timeZone}
      </p>

      <p className="mt-8 text-sm">
        {subjects.length === 0
          ? 'Todavía no has agregado materias.'
          : `${subjects.length} ${subjectLabel} en este período.`}
      </p>
    </AppShell>
  );
}
