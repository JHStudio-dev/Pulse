import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { sessionEndsAt, sessionStartsAt } from '@pulse/core';
import type { ClassMarkerKind, ClassSessionId, RecoveryStatus } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import { formatSessionDate, MODALITY_LABEL } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { removeMarker, toggleRecoveryItem } from './actions';
import { AttendanceForm } from './attendance-form';
import { ClassMode } from './class-mode';
import { SessionNote } from './session-note';

const MARKER_LABEL: Record<ClassMarkerKind, string> = {
  note: 'Nota',
  question: 'Duda',
  important: 'Importante',
  task: 'Tarea',
  missed: 'Me perdí',
};

const RECOVERY_LABEL: Record<RecoveryStatus, string> = {
  pending: 'Pendiente',
  recovering: 'Recuperando',
  recovered: 'Recuperada',
};

/** "12:40" into the class, from the stored offset. */
function offsetLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const session = await db.sessions.findById(userId, id as ClassSessionId);
  if (!session) notFound();

  const [subject, markers, attendance, plan, note, subjects] = await Promise.all([
    db.subjects.findById(userId, session.subjectId),
    db.markers.listBySession(userId, session.id),
    db.attendance.findBySession(userId, session.id),
    db.recovery.findBySession(userId, session.id),
    db.notes.findBySession(userId, session.id),
    db.subjects.listByPeriod(userId, period.id),
  ]);

  const items = plan ? await db.recovery.listItems(userId, plan.id) : [];
  const startsAt = sessionStartsAt(session, period.timeZone).toISOString();
  const endsAt = sessionEndsAt(session, period.timeZone).toISOString();
  const place = [session.location.room, session.location.building, session.location.campus]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <AppShell email={email} subjects={subjects.map((s) => ({ id: s.id as string, name: s.name }))}>
      <Link
        href={subject ? `/subjects/${subject.id}` : '/subjects'}
        className="text-[color:var(--color-ink-muted)] text-sm underline-offset-4 hover:underline"
      >
        {subject?.name ?? 'Materia'}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {formatSessionDate(session.date)}
      </h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-sm">
        {session.startTime}–{session.endTime} · {MODALITY_LABEL[session.modality]}
        {place.length > 0 ? ` · ${place}` : ''}
        {session.status === 'cancelled' ? ' · Cancelada' : ''}
      </p>
      {subject?.professorName ? (
        <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">{subject.professorName}</p>
      ) : null}

      {session.meetingUrl && session.status !== 'cancelled' ? (
        <a
          href={session.meetingUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] mt-4 inline-block rounded-md px-3 py-1.5 text-sm font-medium"
        >
          Entrar a clase
        </a>
      ) : null}

      <div className="mt-6">
        {session.status === 'cancelled' ? (
          <p className="text-[color:var(--color-ink-muted)] border-y border-[color:var(--color-border)] py-5 text-sm">
            Esta clase fue cancelada
            {session.cancelledReason ? `: ${session.cancelledReason}` : '.'}
          </p>
        ) : (
          <ClassMode sessionId={session.id} startsAt={startsAt} endsAt={endsAt} />
        )}
      </div>

      <section className="mt-8" aria-labelledby="markers-heading">
        <h2 id="markers-heading" className="text-sm font-medium">
          Marcas de la clase
        </h2>

        {markers.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">Sin marcas todavía.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {markers.map((marker) => (
              <li key={marker.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span className="font-mono text-xs tabular-nums">
                  {offsetLabel(marker.offsetSeconds)}
                </span>
                <span className="text-sm font-medium">{MARKER_LABEL[marker.kind]}</span>
                {marker.note ? <span className="text-sm">{marker.note}</span> : null}

                <form action={removeMarker} className="ml-auto">
                  <input type="hidden" name="markerId" value={marker.id} />
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button
                    type="submit"
                    className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
                  >
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="note-heading">
        <h2 id="note-heading" className="text-sm font-medium">
          Apuntes de la clase
        </h2>
        <SessionNote sessionId={session.id} body={note?.body ?? ''} />
      </section>

      <section className="mt-8" aria-labelledby="attendance-heading">
        <h2 id="attendance-heading" className="text-sm font-medium">
          Asistencia
        </h2>
        <AttendanceForm
          sessionId={session.id}
          current={attendance?.status ?? null}
          currentNote={attendance?.note ?? null}
        />
      </section>

      {plan ? (
        <section className="mt-10" aria-labelledby="recovery-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="recovery-heading" className="text-sm font-medium">
              Plan de recuperación
            </h2>
            <span className="text-[color:var(--color-ink-muted)] text-xs">
              {RECOVERY_LABEL[plan.status]}
            </span>
          </div>

          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-2.5">
                <form action={toggleRecoveryItem} className="pt-0.5">
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button
                    type="submit"
                    aria-label={item.done ? `Reabrir: ${item.label}` : `Completar: ${item.label}`}
                    className="flex h-4 w-4 items-center justify-center rounded-sm border border-[color:var(--color-border)] text-[10px] leading-none"
                  >
                    {item.done ? '✓' : ''}
                  </button>
                </form>
                <span
                  className={
                    item.done
                      ? 'text-[color:var(--color-ink-muted)] text-sm line-through'
                      : 'text-sm'
                  }
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
