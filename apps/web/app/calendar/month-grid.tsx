import Link from 'next/link';
import type { IsoDate } from '@pulse/types';
import { buildMonthGrid, WEEKDAY_INITIALS, type MonthKey } from '@/lib/calendar';

/**
 * Compact month overview.
 *
 * Each day carries counts, not entries: at phone width a square cannot hold a
 * readable title, and the agenda underneath already lists them in full. Classes
 * and deadlines are told apart by their letter, not by colour.
 */
export function MonthGrid({
  month,
  classesByDate,
  tasksByDate,
  today,
  selected,
}: {
  month: MonthKey;
  classesByDate: ReadonlyMap<IsoDate, number>;
  tasksByDate: ReadonlyMap<IsoDate, number>;
  today: IsoDate;
  selected: IsoDate | null;
}) {
  const weeks = buildMonthGrid(month);

  return (
    <div className="mt-4">
      <div className="text-[color:var(--color-ink-muted)] grid grid-cols-7 gap-px text-center text-[10px]">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span key={`${initial}-${index}`} className="py-1">
            {initial}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px border border-[color:var(--color-border)] bg-[color:var(--color-border)]">
        {weeks.flat().map((day) => {
          const classes = classesByDate.get(day.date) ?? 0;
          const tasks = tasksByDate.get(day.date) ?? 0;
          const isToday = day.date === today;
          const isSelected = day.date === selected;

          return (
            <Link
              key={day.date}
              href={`/calendar?month=${month}&day=${day.date}`}
              aria-current={isSelected ? 'date' : undefined}
              className={[
                'bg-[color:var(--color-surface)] min-h-[3.25rem] px-1 py-1 text-left',
                day.inMonth ? '' : 'opacity-40',
                isSelected ? 'outline-2 -outline-offset-2 outline-[color:var(--color-accent)]' : '',
              ].join(' ')}
            >
              <span
                className={
                  isToday
                    ? 'font-mono text-[11px] font-semibold underline underline-offset-2'
                    : 'text-[color:var(--color-ink-muted)] font-mono text-[11px]'
                }
              >
                {day.date.slice(8)}
              </span>

              <span className="mt-0.5 block text-[10px] leading-tight">
                {classes > 0 ? <span className="block">{classes}C</span> : null}
                {tasks > 0 ? (
                  <span className="text-[color:var(--color-ink-muted)] block">{tasks}E</span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>

      <p className="text-[color:var(--color-ink-muted)] mt-2 text-xs">C = clases · E = entregas</p>
    </div>
  );
}
