import { redirect } from 'next/navigation';
import { instantToZonedDate, instantToZonedTime } from '@pulse/core';
import type { Subject, SubjectId } from '@pulse/types';
import { AppShell } from '@/components/app-shell';
import {
  buildCampusAnnouncements,
  buildCampusChanges,
  buildCampusEvents,
  campusEventDate,
  campusEventTime,
} from '@/lib/campus-activity';
import { requireUser } from '@/lib/session';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatMoment(value: string, timeZone: string): string {
  // Chamilo's parsed dates are local wall-clock values without an offset.
  const local = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/);
  if (local) return `${formatDate(local[1]!)} · ${local[2]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

function formatCampusEvent(event: ReturnType<typeof buildCampusEvents>[number]): string {
  const date = campusEventDate(event);
  if (!date) return event.startsAt;

  const time = campusEventTime(event);
  if (time) return `${formatDate(date)} · ${time}`;

  const endDate = event.endsAt?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  if (endDate && endDate !== date) {
    return `${formatDate(date)} – ${formatDate(endDate)} · Todo el día`;
  }

  return `${formatDate(date)} · Todo el día`;
}

function isUpcomingCampusEvent(
  event: ReturnType<typeof buildCampusEvents>[number],
  today: string,
  nowTime: string,
): boolean {
  const date = campusEventDate(event);
  if (!date) return false;

  const endDate = event.endsAt?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  if (endDate && endDate >= today) return true;
  if (date > today) return true;
  if (date < today) return false;

  const time = campusEventTime(event);
  return time === null || time >= nowTime;
}

export default async function ActivityPage() {
  const { userId, email, db } = await requireUser();
  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const [subjects, links] = await Promise.all([
    db.subjects.listByPeriod(userId, period.id),
    db.campusSync.listSubjectLinks(userId),
  ]);

  const subjectsById = new Map<SubjectId, Subject>(subjects.map((subject) => [subject.id, subject]));
  const activeLinks = links.filter((link) => subjectsById.has(link.subjectId));
  const itemGroups = await Promise.all(
    activeLinks.map((link) => db.campusSync.listItems(userId, link.id)),
  );

  const changes = activeLinks.flatMap((link, index) => {
    const subject = subjectsById.get(link.subjectId);
    if (!subject) return [];
    return buildCampusChanges(itemGroups[index] ?? [], subject);
  }).sort((a, b) => b.changedAt.localeCompare(a.changedAt));

  const announcements = activeLinks.flatMap((link, index) => {
    const subject = subjectsById.get(link.subjectId);
    if (!subject) return [];
    return buildCampusAnnouncements(itemGroups[index] ?? [], subject);
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const events = activeLinks.flatMap((link, index) => {
    const subject = subjectsById.get(link.subjectId);
    if (!subject) return [];
    return buildCampusEvents(itemGroups[index] ?? [], subject);
  });

  const now = new Date();
  const today = instantToZonedDate(now, period.timeZone);
  const nowTime = instantToZonedTime(now, period.timeZone);
  const upcomingEvents = events.filter((event) => isUpcomingCampusEvent(event, today, nowTime));
  const upcomingIds = new Set(upcomingEvents.map((event) => event.id));
  const pastEvents = events
    .filter((event) => !upcomingIds.has(event.id))
    .slice(-10)
    .reverse();

  return (
    <AppShell email={email} subjects={subjects.map((subject) => ({ id: subject.id as string, name: subject.name }))}>
      <h1 className="text-2xl font-semibold tracking-tight">Actividad del campus</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">
        Anuncios y eventos encontrados durante tus sincronizaciones.
      </p>

      <section className="mt-8" aria-labelledby="changes-heading">
        <h2 id="changes-heading" className="text-sm font-medium">Novedades recientes</h2>
        {changes.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
            Las próximas sincronizaciones registrarán aquí lo nuevo y lo que cambie.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {changes.slice(0, 30).map((entry) => {
              const kindLabel =
                entry.kind === 'assignment'
                  ? 'Tarea'
                  : entry.kind === 'document'
                    ? 'Documento'
                    : entry.kind === 'announcement'
                      ? 'Anuncio'
                      : 'Evento';

              return (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                  <span className="text-sm">{entry.title}</span>
                  <span className="text-[color:var(--color-ink-muted)] text-xs">
                    {entry.change === 'new' ? `Nuevo ${kindLabel.toLowerCase()}` : `${kindLabel} actualizado`}
                    {' · '}{entry.subjectName}
                  </span>
                  <span className="text-[color:var(--color-ink-muted)] ml-auto text-xs">
                    {formatMoment(entry.changedAt, period.timeZone)}
                  </span>
                  {entry.sourceUrl ? (
                    <a
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline underline-offset-4"
                    >
                      Abrir
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="announcements-heading">
        <h2 id="announcements-heading" className="text-sm font-medium">Anuncios</h2>
        {announcements.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
            Todavía no hay anuncios sincronizados.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {announcements.slice(0, 30).map((entry) => (
              <li key={entry.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-sm font-medium">{entry.title}</p>
                  <span className="text-[color:var(--color-ink-muted)] text-xs">
                    {entry.subjectName}
                    {entry.author ? ` · ${entry.author}` : ''}
                  </span>
                  <span className="text-[color:var(--color-ink-muted)] ml-auto text-xs">
                    {formatMoment(entry.updatedAt, period.timeZone)}
                  </span>
                </div>
                {entry.content ? (
                  <p className="text-[color:var(--color-ink-muted)] mt-1 line-clamp-3 text-sm">
                    {entry.content}
                  </p>
                ) : null}
                {entry.sourceUrl ? (
                  <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs underline underline-offset-4"
                  >
                    Abrir en el campus
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="events-heading">
        <h2 id="events-heading" className="text-sm font-medium">Próximos eventos</h2>
        {upcomingEvents.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
            No hay eventos próximos sincronizados.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {upcomingEvents.slice(0, 30).map((entry) => (
              <li key={entry.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-sm font-medium">{entry.title}</p>
                  <span className="text-[color:var(--color-ink-muted)] text-xs">{entry.subjectName}</span>
                  <span className="text-[color:var(--color-ink-muted)] ml-auto text-xs">
                    {formatCampusEvent(entry)}
                  </span>
                </div>
                {entry.description ? (
                  <p className="text-[color:var(--color-ink-muted)] mt-1 text-sm">{entry.description}</p>
                ) : null}
                {entry.sourceUrl ? (
                  <a
                    href={entry.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs underline underline-offset-4"
                  >
                    Abrir en el campus
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pastEvents.length > 0 ? (
        <section className="mt-10" aria-labelledby="past-events-heading">
          <h2 id="past-events-heading" className="text-sm font-medium">Eventos recientes</h2>
          <ul className="text-[color:var(--color-ink-muted)] mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
            {pastEvents.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span className="text-sm">{entry.title}</span>
                <span className="text-xs">{entry.subjectName}</span>
                <span className="ml-auto text-xs">
                  {formatCampusEvent(entry)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
