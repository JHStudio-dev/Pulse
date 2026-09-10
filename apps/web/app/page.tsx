import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  findNextClass,
  instantToZonedDate,
  instantToZonedTime,
  isOverdue,
  needsModalityConfirmation,
  sessionsOnDate,
  sortTasksByPriority,
} from '@pulse/core';
import type { ClassSession, Subject, SubjectId, Task } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import { loadReminders } from '@/lib/reminders';
import { requireUser } from '@/lib/session';
import { NextClass } from './next-class';
import { TodaySchedule } from './today-schedule';

/**
 * Signals worth surfacing, built only from data Pulse actually holds.
 *
 * Academic risk is deliberately absent: every input it takes — tasks, grades,
 * assessments, attendance, recovery — belongs to a later phase, so it would
 * report "no risk" for everyone and state something Pulse cannot know.
 */
/** Whole days from one calendar date to another. */
function daysBetweenDates(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

function buildAttention(
  subjects: readonly Subject[],
  schedules: ReadonlyMap<string, unknown[]>,
  sessionsBySubject: ReadonlyMap<string, ClassSession[]>,
  unconfirmed: number,
  periodHasEnd: boolean,
): string[] {
  const items: string[] = [];

  if (!periodHasEnd) {
    items.push('Tu período no tiene fecha de fin, así que no se pueden generar clases.');
  }

  const withoutSchedule = subjects.filter((s) => (schedules.get(s.id)?.length ?? 0) === 0);
  if (withoutSchedule.length > 0) {
    items.push(
      withoutSchedule.length === 1
        ? `${withoutSchedule[0]!.name} no tiene horario.`
        : `${withoutSchedule.length} materias no tienen horario.`,
    );
  }

  const withoutSessions = subjects.filter(
    (s) =>
      (schedules.get(s.id)?.length ?? 0) > 0 && (sessionsBySubject.get(s.id)?.length ?? 0) === 0,
  );
  if (withoutSessions.length > 0) {
    items.push(
      withoutSessions.length === 1
        ? `${withoutSessions[0]!.name} tiene horario pero no ha generado clases.`
        : `${withoutSessions.length} materias tienen horario pero no han generado clases.`,
    );
  }

  if (unconfirmed > 0) {
    items.push(
      unconfirmed === 1
        ? 'Una clase próxima no tiene modalidad confirmada.'
        : `${unconfirmed} clases próximas no tienen modalidad confirmada.`,
    );
  }

  return items;
}

export default async function HomePage() {
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const now = new Date();
  const today = instantToZonedDate(now, period.timeZone);
  const nowTime = instantToZonedTime(now, period.timeZone);
  const [nowH = 0, nowM = 0] = nowTime.split(':').map(Number);

  const subjects = await db.subjects.listByPeriod(userId, period.id);
  const subjectsById: ReadonlyMap<SubjectId, Subject> = new Map(subjects.map((s) => [s.id, s]));

  const horizonEnd = period.range.end ?? today;
  const [schedules, sessions, allTasks] = await Promise.all([
    db.schedules.listByPeriod(userId, period.id),
    db.sessions.listInRange(userId, today, horizonEnd),
    db.tasks.listByUser(userId),
  ]);

  const dueReminders = (await loadReminders(db, userId, period, now)).filter(
    (entry) => entry.state === 'due',
  );

  const openTasks = allTasks.filter(
    (task) =>
      task.status !== 'done' &&
      task.status !== 'submitted' &&
      (task.subjectId === null || subjectsById.has(task.subjectId)),
  );
  const overdueTasks = openTasks.filter((task) => isOverdue(task, today));
  const soonTasks = openTasks.filter(
    (task) =>
      !isOverdue(task, today) &&
      task.dueDate !== null &&
      daysBetweenDates(today, task.dueDate) <= 3,
  );

  const upcoming = findNextClass(sessions, subjectsById, now, period.timeZone);
  const todaySessions = sessionsOnDate(sessions, today);

  const schedulesBySubject = new Map<string, unknown[]>();
  for (const slot of schedules) {
    const list = schedulesBySubject.get(slot.subjectId) ?? [];
    list.push(slot);
    schedulesBySubject.set(slot.subjectId, list);
  }

  const sessionsBySubject = new Map<string, ClassSession[]>();
  for (const session of sessions) {
    const list = sessionsBySubject.get(session.subjectId) ?? [];
    list.push(session);
    sessionsBySubject.set(session.subjectId, list);
  }

  const unconfirmed = sessions.filter((session) =>
    needsModalityConfirmation(session, now, period.timeZone),
  ).length;

  const attention = buildAttention(
    subjects,
    schedulesBySubject,
    sessionsBySubject,
    unconfirmed,
    period.range.end !== null,
  );

  if (subjects.length === 0) {
    return (
      <AppShell
        email={email}
        subjects={subjects.map((s) => ({ id: s.id as string, name: s.name }))}
      >
        <h1 className="text-2xl font-semibold tracking-tight">{period.name}</h1>
        <div className="mt-10 border-t border-[color:var(--color-border)] pt-8">
          <h2 className="text-base font-medium">Aún no hay nada que organizar</h2>
          <p className="text-[color:var(--color-ink-muted)] mt-2 max-w-md text-sm">
            Agrega tus materias y sus horarios. Con eso Pulse puede mostrarte tu próxima clase y el
            día completo.
          </p>
          <Link href="/subjects" className="mt-5 inline-block text-sm underline underline-offset-4">
            Ir a materias
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell email={email}>
      <h1 className="text-2xl font-semibold tracking-tight">{period.name}</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
        {subjects.length} {subjects.length === 1 ? 'materia' : 'materias'} en curso
      </p>

      <div className="mt-6">
        {upcoming ? (
          <NextClass
            upcoming={upcoming}
            subject={subjectsById.get(upcoming.session.subjectId)}
            today={today}
          />
        ) : (
          <section className="border-y border-[color:var(--color-border)] py-5">
            <h2 className="text-[color:var(--color-ink-muted)] text-xs font-medium">
              Próxima clase
            </h2>
            <p className="mt-2 text-sm">No hay clases programadas por delante en este período.</p>
          </section>
        )}
      </div>

      <section className="mt-8" aria-labelledby="today-heading">
        <h2 id="today-heading" className="text-sm font-medium">
          Hoy
        </h2>
        {todaySessions.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">No tienes clases hoy.</p>
        ) : (
          <TodaySchedule
            sessions={todaySessions}
            subjectsById={subjectsById}
            nowMinutes={nowH * 60 + nowM}
          />
        )}
      </section>

      {dueReminders.length > 0 ? (
        <section className="mt-8" aria-labelledby="reminders-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="reminders-heading" className="text-sm font-medium">
              Recordatorios
            </h2>
            <Link
              href="/reminders"
              className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {dueReminders.slice(0, 5).map((entry) => (
              <li
                key={entry.reminder.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
              >
                <span className="text-sm">{entry.targetTitle}</span>
                <span className="text-[color:var(--color-ink-muted)] text-xs">
                  {entry.reminder.target.kind === 'task' ? 'Entrega' : 'Clase'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overdueTasks.length + soonTasks.length > 0 ? (
        <section className="mt-8" aria-labelledby="tasks-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="tasks-heading" className="text-sm font-medium">
              Entregas
            </h2>
            <Link
              href="/tasks"
              className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
            >
              Ver todas
            </Link>
          </div>

          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {sortTasksByPriority([...overdueTasks, ...soonTasks], { today })
              .slice(0, 5)
              .map(({ task }: { task: Task }) => {
                const late = isOverdue(task, today);
                const subject = task.subjectId ? subjectsById.get(task.subjectId) : undefined;

                return (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
                  >
                    <span className="text-sm">{task.title}</span>
                    <span className="text-[color:var(--color-ink-muted)] text-xs">
                      {subject ? `${subject.name} · ` : ''}
                      {late
                        ? 'Atrasada'
                        : task.dueDate === today
                          ? 'Hoy'
                          : `En ${daysBetweenDates(today, task.dueDate!)} días`}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}

      {attention.length > 0 ? (
        <section className="mt-8" aria-labelledby="attention-heading">
          <h2 id="attention-heading" className="text-sm font-medium">
            Requiere atención
          </h2>
          <ul className="text-[color:var(--color-ink-muted)] mt-2 space-y-1.5 text-sm">
            {attention.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
