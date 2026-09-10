import Link from 'next/link';
import type { UpcomingClass } from '@pulse/core';
import type { Subject } from '@pulse/types';
import { Countdown } from '@/components/countdown';
import { formatSessionDate, MODALITY_LABEL } from '@/lib/format';

/**
 * The one block the student should read first.
 *
 * The action shown depends on modality: a virtual class needs its link, an
 * in-person one needs the room. Showing both would bury the useful half.
 */
export function NextClass({
  upcoming,
  subject,
  today,
}: {
  upcoming: UpcomingClass;
  subject: Subject | undefined;
  today: string;
}) {
  const { session } = upcoming;
  const isToday = session.date === today;
  const place = [session.location.room, session.location.building, session.location.campus]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <section
      aria-labelledby="next-heading"
      className="border-y border-[color:var(--color-border)] py-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="next-heading" className="text-[color:var(--color-ink-muted)] text-xs font-medium">
          {upcoming.inProgress ? 'Clase en curso' : 'Próxima clase'}
        </h2>
        <span className="text-[color:var(--color-ink-muted)] text-xs">
          {isToday ? 'Hoy' : formatSessionDate(session.date)}
        </span>
      </div>

      <p className="mt-2 text-xl font-semibold tracking-tight">{subject?.name ?? 'Materia'}</p>

      <p className="mt-1 text-sm">
        {session.startTime}–{session.endTime} · {MODALITY_LABEL[session.modality]}
        {upcoming.inProgress ? null : (
          <>
            {' · '}
            <Countdown startsAt={upcoming.startsAt} />
          </>
        )}
      </p>

      {session.modality === 'in_person' && place.length > 0 ? (
        <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">{place}</p>
      ) : null}

      {upcoming.departAt !== null && !upcoming.inProgress ? (
        <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">
          Salir a las{' '}
          {new Date(upcoming.departAt).toLocaleTimeString('es', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {session.meetingUrl ? (
          <a
            href={session.meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-3 py-1.5 text-sm font-medium"
          >
            Entrar a clase
          </a>
        ) : null}

        <Link
          href={`/sessions/${session.id}`}
          className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-sm underline-offset-4 hover:underline"
        >
          Modo clase
        </Link>

        {subject ? (
          <Link
            href={`/subjects/${subject.id}`}
            className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-sm underline-offset-4 hover:underline"
          >
            Ver materia
          </Link>
        ) : null}
      </div>
    </section>
  );
}
