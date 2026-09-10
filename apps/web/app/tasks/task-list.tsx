import { isOverdue, resolveTaskPriority, type PriorityLevel } from '@pulse/core';
import type { Subject, SubjectId, Task } from '@pulse/types';
import { formatSessionDate } from '@/lib/format';
import { toggleTaskDone } from './actions';
import { EditTask } from './edit-task';

/**
 * Task rows with their computed priority.
 *
 * Priority is not stored: it is derived from the due date, status and
 * difficulty, and the level is shown with a word rather than a colour so the
 * ranking is readable without distinguishing hues.
 */

const LEVEL_LABEL: Record<PriorityLevel, string> = {
  critical: 'Crítica',
  high: 'Alta',
  normal: 'Media',
  low: '',
};

const STATUS_LABEL: Record<Task['status'], string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Terminada',
  submitted: 'Entregada',
  overdue: 'Atrasada',
};

function dueLabel(task: Task, today: string): string {
  if (task.dueDate === null) return 'Sin fecha';

  const overdue = isOverdue(task, today);
  const prefix = overdue ? 'Atrasada desde ' : task.dueDate === today ? 'Hoy' : '';

  if (task.dueDate === today && !overdue) {
    return task.dueTime === null ? 'Hoy' : `Hoy · ${task.dueTime}`;
  }

  const date = formatSessionDate(task.dueDate);
  return prefix.length > 0 ? `${prefix}${date}` : date;
}

export function TaskList({
  tasks,
  subjectsById,
  subjects,
  today,
}: {
  tasks: readonly Task[];
  subjectsById: ReadonlyMap<SubjectId, Subject>;
  subjects: { id: string; name: string }[];
  today: string;
}) {
  return (
    <ul className="mt-4 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
      {tasks.map((task) => {
        const priority = resolveTaskPriority(task, { today });
        const done = task.status === 'done' || task.status === 'submitted';
        const subject = task.subjectId ? subjectsById.get(task.subjectId) : undefined;
        const level = LEVEL_LABEL[priority.level];

        return (
          <li key={task.id} className="flex items-start gap-3 py-3">
            <form action={toggleTaskDone} className="pt-0.5">
              <input type="hidden" name="taskId" value={task.id} />
              <button
                type="submit"
                aria-label={done ? `Reabrir ${task.title}` : `Completar ${task.title}`}
                className="flex h-4 w-4 items-center justify-center rounded-sm border border-[color:var(--color-border)] text-[10px] leading-none"
              >
                {done ? '✓' : ''}
              </button>
            </form>

            <div className="min-w-0 flex-1">
              <p
                className={
                  done ? 'text-[color:var(--color-ink-muted)] text-sm line-through' : 'text-sm'
                }
              >
                {task.title}
              </p>

              <p className="text-[color:var(--color-ink-muted)] mt-0.5 text-xs">
                {subject ? `${subject.name} · ` : ''}
                {dueLabel(task, today)}
                {done ? ` · ${STATUS_LABEL[task.status]}` : ''}
                {!done && task.status === 'in_progress' ? ' · En progreso' : ''}
                {!done && level.length > 0 ? ` · Prioridad ${level.toLowerCase()}` : ''}
              </p>
            </div>

            <EditTask task={task} subjects={subjects} />
          </li>
        );
      })}
    </ul>
  );
}
