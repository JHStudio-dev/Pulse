import Link from 'next/link';
import { redirect } from 'next/navigation';
import { instantToZonedDate } from '@pulse/core';
import type { IsoDate, Subject, SubjectId } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import {
  clampMonth,
  endOfMonth,
  formatMonth,
  monthKeyOf,
  shiftMonth,
  startOfMonth,
} from '@/lib/calendar';
import { requireUser } from '@/lib/session';
import { Agenda, type AgendaEntry } from './agenda';
import { MonthGrid } from './month-grid';

function countByDate(dates: readonly IsoDate[]): Map<IsoDate, number> {
  const counts = new Map<IsoDate, number>();
  for (const date of dates) counts.set(date, (counts.get(date) ?? 0) + 1);
  return counts;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const today = instantToZonedDate(new Date(), period.timeZone);
  const params = await searchParams;

  // Default to the month the student is in, kept inside the period.
  const requested = params.month ?? monthKeyOf(today);
  const month = clampMonth(requested, period.range.start, period.range.end);
  const selected = params.day && params.day.startsWith(month) ? params.day : null;

  const from = startOfMonth(month);
  const to = endOfMonth(month);

  const [subjects, sessions, allTasks] = await Promise.all([
    db.subjects.listByPeriod(userId, period.id),
    db.sessions.listInRange(userId, from, to),
    db.tasks.listByUser(userId),
  ]);

  const subjectsById: ReadonlyMap<SubjectId, Subject> = new Map(subjects.map((s) => [s.id, s]));

  const tasks = allTasks.filter(
    (task) =>
      task.dueDate !== null &&
      task.dueDate >= from &&
      task.dueDate <= to &&
      (task.subjectId === null || subjectsById.has(task.subjectId)),
  );

  const classesByDate = countByDate(sessions.map((session) => session.date));
  const tasksByDate = countByDate(tasks.map((task) => task.dueDate as IsoDate));

  const visibleSessions = selected
    ? sessions.filter((session) => session.date === selected)
    : sessions;
  const visibleTasks = selected ? tasks.filter((task) => task.dueDate === selected) : tasks;

  const unsorted: AgendaEntry[] = [
    ...visibleSessions.map((session) => ({
      date: session.date,
      kind: 'class' as const,
      session,
    })),
    ...visibleTasks.map((task) => ({
      date: task.dueDate as IsoDate,
      kind: 'task' as const,
      task,
    })),
  ];

  // A deadline with no time sorts after the day's classes rather than above them.
  const timeKey = (entry: AgendaEntry): string =>
    entry.session?.startTime ?? entry.task?.dueTime ?? '99:99';

  const entries = unsorted.sort(
    (a, b) => a.date.localeCompare(b.date) || timeKey(a).localeCompare(timeKey(b)),
  );

  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const canGoBack = clampMonth(previous, period.range.start, period.range.end) === previous;
  const canGoForward = clampMonth(next, period.range.start, period.range.end) === next;

  return (
    <AppShell email={email}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">{period.name}</p>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {canGoBack ? (
            <Link href={`/calendar?month=${previous}`} aria-label="Mes anterior">
              ‹
            </Link>
          ) : (
            <span className="text-[color:var(--color-ink-muted)]" aria-hidden="true">
              ‹
            </span>
          )}
          <span className="min-w-[9rem] text-center font-medium">{formatMonth(month)}</span>
          {canGoForward ? (
            <Link href={`/calendar?month=${next}`} aria-label="Mes siguiente">
              ›
            </Link>
          ) : (
            <span className="text-[color:var(--color-ink-muted)]" aria-hidden="true">
              ›
            </span>
          )}
        </div>
      </div>

      <MonthGrid
        month={month}
        classesByDate={classesByDate}
        tasksByDate={tasksByDate}
        today={today}
        selected={selected}
      />

      <section className="mt-8" aria-labelledby="agenda-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="agenda-heading" className="text-sm font-medium">
            {selected ? 'Ese día' : 'Todo el mes'}
          </h2>
          {selected ? (
            <Link
              href={`/calendar?month=${month}`}
              className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
            >
              Ver el mes
            </Link>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-3 text-sm">
            {selected
              ? 'No hay clases ni entregas ese día.'
              : subjects.length === 0
                ? 'Agrega materias y horarios para ver tus clases aquí.'
                : 'No hay nada programado este mes.'}
          </p>
        ) : (
          <Agenda entries={entries} subjectsById={subjectsById} today={today} />
        )}
      </section>
    </AppShell>
  );
}
