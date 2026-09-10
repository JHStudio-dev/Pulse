import Link from 'next/link';
import type { ClassSession, IsoDate, Subject, SubjectId, Task } from '@pulse/types';
import { formatSessionDate, MODALITY_LABEL } from '@/lib/format';

/**
 * Chronological list for the visible range.
 *
 * A class and a deadline are different things, so each row is labelled as one
 * or the other in words. A class links to its subject; a deadline links to the
 * task list, since neither has a page of its own yet.
 */

export interface AgendaEntry {
  date: IsoDate;
  kind: 'class' | 'task';
  session?: ClassSession;
  task?: Task;
}

export function Agenda({
  entries,
  subjectsById,
  today,
}: {
  entries: readonly AgendaEntry[];
  subjectsById: ReadonlyMap<SubjectId, Subject>;
  today: IsoDate;
}) {
  const byDate = new Map<IsoDate, AgendaEntry[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }

  const dates = [...byDate.keys()].sort();

  return (
    <div className="mt-4 space-y-5">
      {dates.map((date) => (
        <section key={date} aria-labelledby={`day-${date}`}>
          <h3
            id={`day-${date}`}
            className="text-[color:var(--color-ink-muted)] text-xs font-medium"
          >
            {date === today ? 'Hoy' : formatSessionDate(date)}
          </h3>

          <ul className="mt-1.5 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {(byDate.get(date) ?? []).map((entry) => {
              if (entry.kind === 'class' && entry.session) {
                const session = entry.session;
                const subject = subjectsById.get(session.subjectId);
                const place = [session.location.room, session.location.building]
                  .filter((part): part is string => Boolean(part))
                  .join(' · ');

                return (
                  <li key={`c-${session.id}`}>
                    <Link
                      href={subject ? `/subjects/${subject.id}` : '/subjects'}
                      className="hover:bg-[color:var(--color-surface-raised)] flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 py-2"
                    >
                      <span className="font-mono text-xs tabular-nums">{session.startTime}</span>
                      <span className="text-sm">{subject?.name ?? 'Clase'}</span>
                      <span className="text-[color:var(--color-ink-muted)] ml-auto text-xs">
                        Clase · {MODALITY_LABEL[session.modality]}
                        {place.length > 0 ? ` · ${place}` : ''}
                        {session.status === 'cancelled' ? ' · Cancelada' : ''}
                      </span>
                    </Link>
                  </li>
                );
              }

              if (entry.kind === 'task' && entry.task) {
                const task = entry.task;
                const subject = task.subjectId ? subjectsById.get(task.subjectId) : undefined;
                const done = task.status === 'done' || task.status === 'submitted';

                return (
                  <li key={`t-${task.id}`}>
                    <Link
                      href="/tasks"
                      className="hover:bg-[color:var(--color-surface-raised)] flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 py-2"
                    >
                      <span className="font-mono text-xs tabular-nums">{task.dueTime ?? '—'}</span>
                      <span className={done ? 'text-sm line-through' : 'text-sm'}>
                        {task.title}
                      </span>
                      <span className="text-[color:var(--color-ink-muted)] ml-auto text-xs">
                        Entrega{subject ? ` · ${subject.name}` : ''}
                        {done ? ' · Terminada' : ''}
                      </span>
                    </Link>
                  </li>
                );
              }

              return null;
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
