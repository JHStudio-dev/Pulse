import Link from 'next/link';
import { redirect } from 'next/navigation';
import { instantToZonedDate } from '@pulse/core';
import type { ClassSession, SubjectSchedule } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import { formatSessionDate, MODALITY_LABEL, summarizeSchedules } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { NewSubject } from './new-subject';

/** Groups rows by subject so the list costs one query per kind, not per subject. */
function groupBySubject<T extends { subjectId: string }>(rows: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.subjectId);
    if (list) list.push(row);
    else grouped.set(row.subjectId, [row]);
  }
  return grouped;
}

export default async function SubjectsPage() {
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const subjects = await db.subjects.listByPeriod(userId, period.id);

  const today = instantToZonedDate(new Date(), period.timeZone);
  const [schedules, sessions] = await Promise.all([
    db.schedules.listByPeriod(userId, period.id),
    period.range.end === null
      ? Promise.resolve<ClassSession[]>([])
      : db.sessions.listInRange(userId, today, period.range.end),
  ]);

  const schedulesBySubject = groupBySubject<SubjectSchedule>(schedules);
  const sessionsBySubject = groupBySubject<ClassSession>(
    sessions.filter((session) => session.status === 'scheduled'),
  );

  return (
    <AppShell email={email}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Materias</h1>
          <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">{period.name}</p>
        </div>
        {subjects.length > 0 ? <NewSubject /> : null}
      </div>

      {subjects.length === 0 ? (
        <div className="mt-10 border-t border-[color:var(--color-border)] pt-8">
          <h2 className="text-base font-medium">Empieza por tus materias</h2>
          <p className="text-[color:var(--color-ink-muted)] mt-2 max-w-md text-sm">
            Cada materia guarda su horario semanal. Con eso Pulse genera las clases del período y
            puede mostrarte lo que viene.
          </p>
          <div className="mt-5">
            <NewSubject variant="inline" />
          </div>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
          {subjects.map((subject) => {
            const subjectSchedules = schedulesBySubject.get(subject.id) ?? [];
            const next = sessionsBySubject.get(subject.id)?.[0];
            const scheduleSummary = summarizeSchedules(subjectSchedules);

            return (
              <li key={subject.id}>
                <Link
                  href={`/subjects/${subject.id}`}
                  className="hover:bg-[color:var(--color-surface-raised)] block px-2 py-3.5"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="font-medium">{subject.name}</span>
                    {subject.code ? (
                      <span className="text-[color:var(--color-ink-muted)] font-mono text-xs">
                        {subject.code}
                      </span>
                    ) : null}
                    <span className="text-[color:var(--color-ink-muted)] ml-auto text-xs">
                      {MODALITY_LABEL[subject.defaultModality]}
                    </span>
                  </div>

                  <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
                    {scheduleSummary.length > 0 ? scheduleSummary : 'Sin horario'}
                    {subject.professorName ? ` · ${subject.professorName}` : ''}
                  </p>

                  {next ? (
                    <p className="mt-1.5 text-xs">
                      Próxima clase: {formatSessionDate(next.date)} · {next.startTime}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
