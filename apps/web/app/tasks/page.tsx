import Link from 'next/link';
import { redirect } from 'next/navigation';
import { instantToZonedDate, isOverdue, sortTasksByPriority } from '@pulse/core';
import type { Subject, SubjectId, Task } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';
import { QuickAdd } from './quick-add';
import { TaskList } from './task-list';

type TaskGroup = {
  key: string;
  label: string;
  tasks: readonly Task[];
};

function groupTasksBySubject(
  tasks: readonly Task[],
  subjects: readonly Subject[],
): TaskGroup[] {
  const groups: TaskGroup[] = subjects
    .map((subject) => ({
      key: subject.id as string,
      label: subject.name,
      tasks: tasks.filter((task) => task.subjectId === subject.id),
    }))
    .filter((group) => group.tasks.length > 0);

  const unassigned = tasks.filter((task) => task.subjectId === null);
  if (unassigned.length > 0) {
    groups.push({
      key: 'unassigned',
      label: 'Sin materia',
      tasks: unassigned,
    });
  }

  return groups;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const params = await searchParams;
  const groupedView = params.view !== 'all';

  const [subjects, allTasks, reminders] = await Promise.all([
    db.subjects.listByPeriod(userId, period.id),
    db.tasks.listByUser(userId),
    db.reminders.listByUser(userId),
  ]);

  const subjectsById: ReadonlyMap<SubjectId, Subject> = new Map(subjects.map((subject) => [subject.id, subject]));
  const options = subjects.map((subject) => ({ id: subject.id as string, name: subject.name }));

  const tasks = allTasks.filter(
    (task) => task.subjectId === null || subjectsById.has(task.subjectId),
  );

  const reminderCounts = new Map<string, number>();
  for (const reminder of reminders) {
    if (!reminder.enabled || !reminder.target.taskId) continue;
    const taskId = reminder.target.taskId;
    reminderCounts.set(taskId, (reminderCounts.get(taskId) ?? 0) + 1);
  }

  const today = instantToZonedDate(new Date(), period.timeZone);

  const open = tasks.filter((task) => task.status !== 'done' && task.status !== 'submitted');
  const done = tasks.filter((task) => task.status === 'done' || task.status === 'submitted');
  const overdue = open.filter((task) => isOverdue(task, today));
  const ranked = sortTasksByPriority(open, { today }).map((entry) => entry.task);

  const openGroups = groupTasksBySubject(ranked, subjects);
  const doneGroups = groupTasksBySubject(done, subjects);

  const renderTaskList = (items: readonly Task[], showSubject = true) => (
    <TaskList
      tasks={items}
      subjectsById={subjectsById}
      subjects={options}
      today={today}
      reminderCounts={reminderCounts}
      showSubject={showSubject}
    />
  );

  return (
    <AppShell email={email} subjects={options}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
          <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
            {open.length === 0
              ? 'Nada pendiente'
              : `${open.length} ${open.length === 1 ? 'pendiente' : 'pendientes'}`}
            {overdue.length > 0
              ? ` · ${overdue.length} atrasada${overdue.length === 1 ? '' : 's'}`
              : ''}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-[color:var(--color-border)] p-1 text-xs">
          <Link
            href="/tasks"
            aria-current={groupedView ? 'page' : undefined}
            className={[
              'rounded px-2 py-1',
              groupedView ? 'bg-[color:var(--color-surface-raised)] font-medium' : 'text-[color:var(--color-ink-muted)]',
            ].join(' ')}
          >
            Por materia
          </Link>
          <Link
            href="/tasks?view=all"
            aria-current={!groupedView ? 'page' : undefined}
            className={[
              'rounded px-2 py-1',
              !groupedView ? 'bg-[color:var(--color-surface-raised)] font-medium' : 'text-[color:var(--color-ink-muted)]',
            ].join(' ')}
          >
            Todas
          </Link>
        </div>
      </div>

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
            <h2 id="open-heading" className="text-sm font-medium">Pendientes</h2>

            {ranked.length === 0 ? (
              <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
                No te queda nada pendiente.
              </p>
            ) : groupedView ? (
              <div className="mt-4 space-y-8">
                {openGroups.map((group) => (
                  <section key={group.key} aria-labelledby={`tasks-${group.key}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 id={`tasks-${group.key}`} className="text-sm font-medium">
                        {group.label}
                      </h3>
                      <span className="text-[color:var(--color-ink-muted)] text-xs">
                        {group.tasks.length} {group.tasks.length === 1 ? 'tarea' : 'tareas'}
                      </span>
                    </div>
                    {renderTaskList(group.tasks, false)}
                  </section>
                ))}
              </div>
            ) : (
              renderTaskList(ranked)
            )}
          </section>

          {done.length > 0 ? (
            <section className="mt-10" aria-labelledby="done-heading">
              <h2 id="done-heading" className="text-sm font-medium">Completadas</h2>

              {groupedView ? (
                <div className="mt-4 space-y-8">
                  {doneGroups.map((group) => (
                    <section key={group.key} aria-labelledby={`done-${group.key}`}>
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 id={`done-${group.key}`} className="text-sm font-medium">
                          {group.label}
                        </h3>
                        <span className="text-[color:var(--color-ink-muted)] text-xs">
                          {group.tasks.length}
                        </span>
                      </div>
                      {renderTaskList(group.tasks, false)}
                    </section>
                  ))}
                </div>
              ) : (
                renderTaskList(done)
              )}
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
