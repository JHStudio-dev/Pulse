'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import type { InboxItem } from '@pulse/types';
import { Dialog } from '@/components/dialog';
import { convertToTask, updateInboxItem, type InboxResult } from './actions';

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

type Subjects = { id: string; name: string }[];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Guardando' : label}
    </button>
  );
}

function SubjectField({
  id,
  defaultValue,
  subjects,
}: {
  id: string;
  defaultValue: string;
  subjects: Subjects;
}) {
  return (
    <div>
      <label htmlFor={`subject-${id}`} className="block text-sm font-medium">
        Materia
      </label>
      <select id={`subject-${id}`} name="subjectId" defaultValue={defaultValue} className={field}>
        <option value="">Sin materia</option>
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditForm({
  item,
  subjects,
  close,
}: {
  item: InboxItem;
  subjects: Subjects;
  close: () => void;
}) {
  const [state, formAction] = useActionState<InboxResult, FormData>(updateInboxItem, {
    error: null,
    saved: false,
  });

  useEffect(() => {
    if (state.saved && state.error === null) close();
  }, [state, close]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="itemId" value={item.id} />

      <div>
        <label htmlFor={`raw-${item.id}`} className="block text-sm font-medium">
          Texto
        </label>
        <textarea
          id={`raw-${item.id}`}
          name="rawText"
          required
          rows={3}
          maxLength={500}
          defaultValue={item.rawText}
          className={field}
        />
      </div>

      <SubjectField id={item.id} defaultValue={item.subjectId ?? ''} subjects={subjects} />

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <Submit label="Guardar" />
    </form>
  );
}

function ConvertForm({
  item,
  subjects,
  close,
}: {
  item: InboxItem;
  subjects: Subjects;
  close: () => void;
}) {
  const [state, formAction] = useActionState<InboxResult, FormData>(convertToTask, {
    error: null,
    saved: false,
  });

  useEffect(() => {
    if (state.saved && state.error === null) close();
  }, [state, close]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="itemId" value={item.id} />

      <div>
        <label htmlFor={`title-${item.id}`} className="block text-sm font-medium">
          Título de la tarea
        </label>
        {/* Prefilled with the captured text; Pulse does not parse it for you. */}
        <input
          id={`title-${item.id}`}
          name="title"
          required
          maxLength={200}
          defaultValue={item.rawText.slice(0, 200)}
          className={field}
        />
        <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">
          Ajusta el título si hace falta. La anotación original se conserva.
        </p>
      </div>

      <div>
        <label htmlFor={`due-${item.id}`} className="block text-sm font-medium">
          Fecha límite
        </label>
        <input id={`due-${item.id}`} name="dueDate" type="date" className={field} />
      </div>

      <SubjectField id={`c-${item.id}`} defaultValue={item.subjectId ?? ''} subjects={subjects} />

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <Submit label="Crear tarea" />
    </form>
  );
}

export function EditInboxItem({ item, subjects }: { item: InboxItem; subjects: Subjects }) {
  return (
    <Dialog
      title="Editar anotación"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
        >
          Editar
        </button>
      )}
    >
      {(close) => <EditForm item={item} subjects={subjects} close={close} />}
    </Dialog>
  );
}

export function ConvertInboxItem({ item, subjects }: { item: InboxItem; subjects: Subjects }) {
  return (
    <Dialog
      title="Convertir en tarea"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="rounded-md border border-[color:var(--color-border)] px-2.5 py-1 text-xs"
        >
          A tarea
        </button>
      )}
    >
      {(close) => <ConvertForm item={item} subjects={subjects} close={close} />}
    </Dialog>
  );
}
