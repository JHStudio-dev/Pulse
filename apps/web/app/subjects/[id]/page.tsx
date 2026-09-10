import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { SubjectId } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import { AddReminder } from '@/app/reminders/add-reminder';
import { formatSessionDate, MODALITY_LABEL, WEEKDAY_LABEL } from '@/lib/format';
import { describeType, formatSize } from '@/lib/uploads';
import { requireUser } from '@/lib/session';
import { deleteSchedule } from './actions';
import { deleteDocument, openDocument } from './document-actions';
import { GenerateSessions } from './generate-sessions';
import { ScheduleForm } from './schedule-form';
import { UploadDocument } from './upload-document';

export default async function SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, email, db } = await requireUser();

  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const subject = await db.subjects.findById(userId, id as SubjectId);
  if (!subject) notFound();

  const schedules = await db.schedules.listBySubject(userId, subject.id);
  const sessions = await db.sessions.listBySubject(userId, subject.id);
  const documents = await db.documents.listBySubject(userId, subject.id);
  const upcoming = sessions.filter((session) => session.status !== 'cancelled').slice(0, 8);

  return (
    <AppShell email={email}>
      <Link
        href="/subjects"
        className="text-[color:var(--color-ink-muted)] text-sm underline-offset-4 hover:underline"
      >
        Materias
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{subject.name}</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-sm">
        {subject.code ? `${subject.code} · ` : ''}
        {MODALITY_LABEL[subject.defaultModality]}
        {subject.professorName ? ` · ${subject.professorName}` : ''}
      </p>

      <section className="mt-8" aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="text-sm font-medium">
          Horario semanal
        </h2>

        {schedules.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-3 text-sm">
            Sin horarios. Agrega el primero abajo.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
            {schedules.map((schedule) => (
              <li key={schedule.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm">
                    {WEEKDAY_LABEL[schedule.weekday]} · {schedule.startTime}–{schedule.endTime}
                  </p>
                  <p className="text-[color:var(--color-ink-muted)] mt-0.5 text-xs">
                    {MODALITY_LABEL[schedule.modality]}
                    {schedule.location.room ? ` · Aula ${schedule.location.room}` : ''}
                  </p>
                </div>

                <form action={deleteSchedule}>
                  <input type="hidden" name="scheduleId" value={schedule.id} />
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 text-xs"
                  >
                    Quitar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="new-schedule-heading">
        <h2 id="new-schedule-heading" className="mb-4 text-sm font-medium">
          Nuevo horario
        </h2>
        <ScheduleForm subjectId={subject.id} />
      </section>

      <section className="mt-10" aria-labelledby="sessions-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sessions-heading" className="text-sm font-medium">
            Clases del período
          </h2>
          <GenerateSessions subjectId={subject.id} hasSessions={sessions.length > 0} />
        </div>

        {sessions.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-3 text-sm">
            Sin clases generadas. Se crean a partir del horario semanal.
          </p>
        ) : (
          <>
            <p className="text-[color:var(--color-ink-muted)] mt-3 text-sm">
              {sessions.length} en total. Las próximas:
            </p>
            <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
              {upcoming.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5"
                >
                  <span className="text-sm">{formatSessionDate(session.date)}</span>
                  <span className="text-[color:var(--color-ink-muted)] text-xs">
                    {session.startTime}–{session.endTime} · {MODALITY_LABEL[session.modality]}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <Link
                      href={`/sessions/${session.id}`}
                      className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
                    >
                      Abrir
                    </Link>
                    <AddReminder kind="session" targetId={session.id} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="mt-10" aria-labelledby="documents-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="documents-heading" className="text-sm font-medium">
            Documentos
          </h2>
          <UploadDocument subjectId={subject.id} />
        </div>

        {documents.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-3 text-sm">
            Sin documentos. Sube apuntes, guías o presentaciones de esta materia.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <form action={openDocument} className="min-w-0 flex-1">
                  <input type="hidden" name="documentId" value={document.id} />
                  <button
                    type="submit"
                    className="block max-w-full truncate text-left text-sm underline-offset-4 hover:underline"
                  >
                    {document.title}
                  </button>
                </form>

                <span className="text-[color:var(--color-ink-muted)] text-xs">
                  {describeType(document.mimeType)}
                  {document.sizeBytes === null ? '' : ` · ${formatSize(document.sizeBytes)}`} ·{' '}
                  {formatSessionDate(document.createdAt.slice(0, 10))}
                </span>

                <form action={deleteDocument}>
                  <input type="hidden" name="documentId" value={document.id} />
                  <input type="hidden" name="subjectId" value={subject.id} />
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
    </AppShell>
  );
}
