import { redirect } from 'next/navigation';
import { instantToZonedDate, isOverdue, sortTasksByPriority } from '@pulse/core';
import type { Subject, SubjectId, Task } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';
import { QuickAdd } from './quick-add';
import { TaskList } from './task-list';

/**
 * Tasks for the active period.
 *
 * A task belongs to a period through its subject. Tasks with no subject are
 * kept as well: dropping them would silently hide work the student recorded.
 */
export default async function TasksPage() {
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const [subjects, allTasks] = await Promise.all([
    db.subjects.listByPeriod(userId, period.id),
    db.tasks.listByUser(userId),
  ]);

  const subjectsById: ReadonlyMap<SubjectId, Subject> = new Map(subjects.map((s) => [s.id, s]));
  const options = subjects.map((s) => ({ id: s.id as string, name: s.name }));

  const tasks = allTasks.filter(
    (task) => task.subjectId === null || subjectsById.has(task.subjectId),
  );

  const today = instantToZonedDate(new Date(), period.timeZone);

  const open = tasks.filter((task) => task.status !== 'done' && task.status !== 'submitted');
  const done = tasks.filter((task) => task.status === 'done' || task.status === 'submitted');
  const overdue = open.filter((task) => isOverdue(task, today));

  const ranked = sortTasksByPriority(open, { today }).map((entry) => entry.task);

  return (
    <AppShell email={email}>
      <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
        {open.length === 0
          ? 'Nada pendiente'
          : `${open.length} ${open.length === 1 ? 'pendiente' : 'pendientes'}`}
        {overdue.length > 0
          ? ` · ${overdue.length} atrasada${overdue.length === 1 ? '' : 's'}`
          : ''}
      </p>

      <div className="mt-6 border-b border-[color:var(--color-border)] pb-6">
        <QuickAdd subjects={options} />
      </div>

      {tasks.length === 0 ? (
        <div className="mt-8">
          <h2 className="text-base font-medium">Todavía no hay tareas</h2>
          <p className="text-[color:var(--color-ink-muted)] mt-2 max-w-md text-sm">
            Anota lo que tengas que entregar. Con la fecha límite, Pulse ordena por urgencia y avisa
            en el inicio cuando algo se acerca o se pasa.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-6" aria-labelledby="open-heading">
            <h2 id="open-heading" className="text-sm font-medium">
              Pendientes
            </h2>
            {ranked.length === 0 ? (
              <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
                No te queda nada pendiente.
              </p>
            ) : (
              <TaskList
                tasks={ranked}
                subjectsById={subjectsById}
                subjects={options}
                today={today}
              />
            )}
          </section>

          {done.length > 0 ? (
            <section className="mt-10" aria-labelledby="done-heading">
              <h2 id="done-heading" className="text-sm font-medium">
                Completadas
              </h2>
              <TaskList
                tasks={done as readonly Task[]}
                subjectsById={subjectsById}
                subjects={options}
                today={today}
              />
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
