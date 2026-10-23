import Link from 'next/link';
import { redirect } from 'next/navigation';
import { instantToZonedDate, isOverdue, sortTasksByPriority } from '@pulse/core';
import type { Subject, SubjectId, Task } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';
import { tasksOfSubjects } from '@/lib/academic-cleanup';
import { campusOrigins } from '@/lib/campus-origin';
import { DeleteAllTasksButton, DeleteUnassignedTasksButton } from './delete-all-tasks-button';
import { DismissedCampusTasks } from './dismissed-campus-tasks';
import { QuickAdd } from './quick-add';
import { TaskList } from './task-list';

const UNASSIGNED_GROUP = 'unassigned';

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
      key: UNASSIGNED_GROUP,
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

  const [subjects, archivedSubjects, allTasks, reminders, campusTargets, dismissedItems, campusLinks] =
    await Promise.all([
      db.subjects.listByPeriod(userId, period.id),
      db.subjects.listArchivedByPeriod(userId, period.id),
      db.tasks.listByUser(userId),
      db.reminders.listByUser(userId),
      db.campusSync.listAppliedTargets(userId),
      db.campusSync.listDismissedItems(userId),
      db.campusSync.listSubjectLinks(userId),
    ]);
  const taskOrigins = campusOrigins(campusTargets).tasks;

  const subjectOfLink = new Map(campusLinks.map((link) => [link.id as string, link.subjectId]));
  const dismissedCampusTasks = dismissedItems.flatMap((item) => {
    const subjectId = subjectOfLink.get(item.subjectLinkId);
    const subject = subjectId ? subjectsById.get(subjectId) : undefined;
    const title = item.payload['title'];
    if (!subject || typeof title !== 'string') return [];

    return [{ itemId: item.id as string, title, subjectName: subject.name, sourceUrl: item.sourceUrl }];
  });

  const subjectsById: ReadonlyMap<SubjectId, Subject> = new Map(subjects.map((subject) => [subject.id, subject]));
  const options = subjects.map((subject) => ({ id: subject.id as string, name: subject.name }));

  const tasks = allTasks.filter(
    (task) => task.subjectId === null || subjectsById.has(task.subjectId),
  );
  const periodTaskCount = tasksOfSubjects(
    allTasks,
    new Set([...subjects, ...archivedSubjects].map((subject) => subject.id as string)),
  ).length;
  const unassignedCount = tasks.filter((task) => task.subjectId === null).length;

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
  // The cleanup action sits on the first "Sin materia" heading on the page.
  const unassignedOpen = openGroups.some((group) => group.key === UNASSIGNED_GROUP);

  const renderGroups = (groups: TaskGroup[], idPrefix: string, cleanupKey: string | null) => (
    <div className="mt-4 space-y-8">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`${idPrefix}-${group.key}`}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 id={`${idPrefix}-${group.key}`} className="text-sm font-medium">
              {group.key === UNASSIGNED_GROUP ? (
                group.label
              ) : (
                <Link href={`/subjects/${group.key}`} className="underline-offset-4 hover:underline">
                  {group.label}
                </Link>
              )}
            </h3>
            <div className="flex items-baseline gap-3">
              {group.key === cleanupKey ? (
                <DeleteUnassignedTasksButton taskCount={unassignedCount} />
              ) : null}
              <span className="text-[color:var(--color-ink-muted)] text-xs tabular-nums">
                {group.tasks.length}
              </span>
            </div>
          </div>
          {renderTaskList(group.tasks, false)}
        </section>
      ))}
    </div>
  );

  const renderTaskList = (items: readonly Task[], showSubject = true) => (
    <TaskList
      tasks={items}
      subjectsById={subjectsById}
      subjects={options}
      today={today}
      reminderCounts={reminderCounts}
      campusOrigins={taskOrigins}
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

        <div className="flex flex-wrap items-center justify-end gap-3">
          {periodTaskCount > 0 ? (
            <DeleteAllTasksButton taskCount={periodTaskCount} periodName={period.name} />
          ) : null}

          <nav aria-label="Vista de tareas" className="flex items-center gap-4 text-xs">
            {[
              { href: '/tasks', label: 'Por materia', current: groupedView },
              { href: '/tasks?view=all', label: 'Todas', current: !groupedView },
            ].map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={tab.current ? 'page' : undefined}
                className={[
                  'border-b pb-1',
                  tab.current
                    ? 'border-[color:var(--color-ink)] font-medium'
                    : 'text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] border-transparent',
                ].join(' ')}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
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
              renderGroups(openGroups, 'tasks', UNASSIGNED_GROUP)
            ) : (
              renderTaskList(ranked)
            )}
          </section>

          {done.length > 0 ? (
            <section className="mt-10" aria-labelledby="done-heading">
              <h2 id="done-heading" className="text-sm font-medium">Completadas</h2>

              {groupedView ? (
                renderGroups(doneGroups, 'done', unassignedOpen ? null : UNASSIGNED_GROUP)
              ) : (
                renderTaskList(done)
              )}
            </section>
          ) : null}
        </>
      )}

      <DismissedCampusTasks tasks={dismissedCampusTasks} />
    </AppShell>
  );
}
