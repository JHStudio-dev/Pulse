import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { formatSessionDate } from '@/lib/format';
import { requireUser } from '@/lib/session';
import { noteHeadline } from '@/lib/unassigned-content';
import { describeType, formatSize } from '@/lib/uploads';
import { openDocument } from '../[id]/document-actions';
import { deleteNote, deleteUnassignedDocument, moveDocument, moveNote } from './actions';

const FIELD =
  'rounded-sm border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-xs';

function MoveForm({
  action,
  name,
  value,
  subjects,
}: {
  action: (formData: FormData) => Promise<void>;
  name: 'documentId' | 'noteId';
  value: string;
  subjects: { id: string; name: string }[];
}) {
  if (subjects.length === 0) return null;

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name={name} value={value} />
      <label className="sr-only" htmlFor={`move-${value}`}>
        Mover a una materia
      </label>
      <select id={`move-${value}`} name="subjectId" className={FIELD} defaultValue="">
        <option value="" disabled>
          Mover a…
        </option>
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>
      <button type="submit" className="text-xs underline underline-offset-4">
        Mover
      </button>
    </form>
  );
}

export default async function UnassignedContentPage() {
  const { userId, email, db } = await requireUser();
  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const [subjects, documents, notes] = await Promise.all([
    db.subjects.listByPeriod(userId, period.id),
    db.documents.listUnassigned(userId),
    db.notes.listUnassigned(userId),
  ]);
  const options = subjects.map((subject) => ({ id: subject.id as string, name: subject.name }));

  return (
    <AppShell email={email} subjects={options}>
      <Link
        href="/subjects"
        className="text-[color:var(--color-ink-muted)] text-sm underline-offset-4 hover:underline"
      >
        Materias
      </Link>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sin materia</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-2 max-w-xl text-sm">
        Archivos y notas que no pertenecen a ninguna materia: se conservan al eliminar una materia y
        aparecen aquí cuando capturas una nota sin elegirla. Puedes moverlos a una materia de{' '}
        {period.name}. Las capturas rápidas siguen en{' '}
        <Link href="/inbox" className="underline underline-offset-4">
          Inbox
        </Link>
        .
      </p>

      <section className="mt-8" aria-labelledby="unassigned-documents">
        <h2 id="unassigned-documents" className="text-sm font-medium">
          Documentos
          <span className="text-[color:var(--color-ink-muted)] ml-2 text-xs font-normal">
            {documents.length}
          </span>
        </h2>

        {documents.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
            No hay documentos sin materia.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
              >
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
                  {document.source === 'campus_sync' ? 'Campus · ' : ''}
                  {describeType(document.mimeType)}
                  {document.sizeBytes === null ? '' : ` · ${formatSize(document.sizeBytes)}`} ·{' '}
                  {formatSessionDate(document.createdAt.slice(0, 10))}
                </span>
                <MoveForm
                  action={moveDocument}
                  name="documentId"
                  value={document.id}
                  subjects={options}
                />
                <form action={deleteUnassignedDocument}>
                  <input type="hidden" name="documentId" value={document.id} />
                  <button
                    type="submit"
                    className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
                  >
                    Eliminar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="unassigned-notes">
        <h2 id="unassigned-notes" className="text-sm font-medium">
          Notas
          <span className="text-[color:var(--color-ink-muted)] ml-2 text-xs font-normal">
            {notes.length}
          </span>
        </h2>

        {notes.length === 0 ? (
          <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
            No hay notas sin materia.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
            {notes.map((note) => (
              <li key={note.id} className="py-2.5">
                <details>
                  <summary className="cursor-pointer text-sm">
                    {noteHeadline(note)}
                    <span className="text-[color:var(--color-ink-muted)] ml-2 text-xs">
                      {formatSessionDate(note.createdAt.slice(0, 10))}
                    </span>
                  </summary>
                  <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm whitespace-pre-wrap">
                    {note.body}
                  </p>
                </details>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <MoveForm action={moveNote} name="noteId" value={note.id} subjects={options} />
                  <form action={deleteNote}>
                    <input type="hidden" name="noteId" value={note.id} />
                    <button
                      type="submit"
                      className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
                    >
                      Eliminar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
