import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';
import { restoreSubject } from '../actions';
import { DeleteSubjectButton } from './delete-subject-button';

export default async function ArchivedSubjectsPage() {
  const { userId, email, db } = await requireUser();
  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const archived = await db.subjects.listArchivedByPeriod(userId, period.id);

  return (
    <AppShell email={email}>
      <Link
        href="/subjects"
        className="text-[color:var(--color-ink-muted)] text-sm underline-offset-4 hover:underline"
      >
        Materias
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Materias archivadas</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
        {period.name}
      </p>
      <p className="text-[color:var(--color-ink-muted)] mt-2 max-w-xl text-xs">
        Restaurar vuelve a mostrar la materia. Eliminar permanentemente borra la materia, sus
        horarios y su vínculo de Campus Sync; no se puede deshacer.
      </p>

      {archived.length === 0 ? (
        <p className="text-[color:var(--color-ink-muted)] mt-8 text-sm">
          No tienes materias archivadas.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
          {archived.map((subject) => (
            <li key={subject.id} className="flex flex-wrap items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{subject.name}</p>
                <p className="text-[color:var(--color-ink-muted)] mt-0.5 text-xs">
                  {subject.code ?? 'Sin código'}
                  {subject.professorName ? ` · ${subject.professorName}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <form action={restoreSubject}>
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-xs"
                  >
                    Restaurar
                  </button>
                </form>

                <DeleteSubjectButton
                  subjectId={subject.id}
                  subjectName={subject.name}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
