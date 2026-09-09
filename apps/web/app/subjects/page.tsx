import { redirect } from 'next/navigation';
import type { Modality } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';
import { SubjectForm } from './subject-form';

const MODALITY_LABEL: Record<Modality, string> = {
  in_person: 'Presencial',
  virtual: 'Virtual',
  hybrid: 'Híbrida',
  unconfirmed: 'Sin confirmar',
};

export default async function SubjectsPage() {
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const subjects = await db.subjects.listByPeriod(userId, period.id);

  return (
    <AppShell email={email}>
      <h1 className="text-2xl font-semibold tracking-tight">Materias</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-sm">{period.name}</p>

      <section className="mt-8" aria-labelledby="list-heading">
        <h2 id="list-heading" className="text-sm font-medium">
          Tus materias
        </h2>

        {subjects.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-3 text-sm">
            Todavía no hay materias. Agrega la primera abajo.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
            {subjects.map((subject) => (
              <li
                key={subject.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="text-sm font-medium">{subject.name}</span>
                <span className="text-[color:var(--color-ink-muted)] text-xs">
                  {subject.code ? `${subject.code} · ` : ''}
                  {MODALITY_LABEL[subject.defaultModality]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="new-heading">
        <h2 id="new-heading" className="mb-4 text-sm font-medium">
          Nueva materia
        </h2>
        <SubjectForm />
      </section>
    </AppShell>
  );
}
