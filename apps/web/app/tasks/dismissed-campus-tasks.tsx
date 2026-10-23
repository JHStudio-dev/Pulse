import { restoreCampusTask } from './actions';

export type DismissedCampusTask = {
  itemId: string;
  title: string;
  subjectName: string;
  sourceUrl: string | null;
};

/**
 * Campus assignments the student deleted.
 *
 * Collapsed by default: they were removed on purpose and only matter when the
 * student wants one back.
 */
export function DismissedCampusTasks({ tasks }: { tasks: readonly DismissedCampusTask[] }) {
  if (tasks.length === 0) return null;

  return (
    <details className="mt-10 border-t border-[color:var(--color-border)] pt-4">
      <summary className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] cursor-pointer text-xs">
        {tasks.length}{' '}
        {tasks.length === 1 ? 'tarea del campus eliminada' : 'tareas del campus eliminadas'}
      </summary>
      <p className="text-[color:var(--color-ink-muted)] mt-2 max-w-xl text-xs">
        No vuelven a importarse aunque el campus las siga mostrando. Restaurar las crea de nuevo con
        los datos de la última sincronización.
      </p>
      <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
        {tasks.map((task) => (
          <li key={task.itemId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
            <span className="text-sm">{task.title}</span>
            <span className="text-[color:var(--color-ink-muted)] text-xs">
              {task.subjectName}
              {task.sourceUrl ? (
                <>
                  {' · '}
                  <a
                    href={task.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-4 hover:underline"
                  >
                    Campus<span className="sr-only"> (abre la tarea en el campus)</span>
                  </a>
                </>
              ) : null}
            </span>
            <form action={restoreCampusTask} className="ml-auto">
              <input type="hidden" name="itemId" value={task.itemId} />
              <button type="submit" className="text-xs underline underline-offset-4">
                Restaurar
              </button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
