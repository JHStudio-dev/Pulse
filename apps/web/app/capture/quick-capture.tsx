'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Dialog } from '@/components/dialog';
import { captureInbox, captureNote, captureTask, type CaptureResult } from './actions';

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

type Mode = 'inbox' | 'task' | 'note';

const MODES: { id: Mode; label: string }[] = [
  { id: 'inbox', label: 'Anotar' },
  { id: 'task', label: 'Tarea' },
  { id: 'note', label: 'Nota' },
];

const ACTIONS = { inbox: captureInbox, task: captureTask, note: captureNote } as const;

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Guardando' : 'Guardar'}
    </button>
  );
}

function SubjectSelect({ subjects }: { subjects: { id: string; name: string }[] }) {
  return (
    <div>
      <label htmlFor="subjectId" className="block text-sm font-medium">
        Materia
      </label>
      <select id="subjectId" name="subjectId" defaultValue="" className={field}>
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

/**
 * Capture form for one mode.
 *
 * Remounted per mode via key, so switching does not carry a half typed value
 * from one shape into another.
 */
function CaptureForm({
  mode,
  subjects,
  close,
}: {
  mode: Mode;
  subjects: { id: string; name: string }[];
  close: () => void;
}) {
  const [state, formAction] = useActionState<CaptureResult, FormData>(ACTIONS[mode], {
    error: null,
    saved: false,
  });
  const submitted = useRef(false);
  const firstField = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  useEffect(() => {
    if (state.saved && state.error === null && submitted.current) close();
  }, [state, close]);

  return (
    <form
      action={(data) => {
        submitted.current = true;
        formAction(data);
      }}
      className="space-y-4"
    >
      {mode === 'inbox' ? (
        <div>
          <label htmlFor="rawText" className="block text-sm font-medium">
            Anotación
          </label>
          <textarea
            ref={firstField as React.RefObject<HTMLTextAreaElement>}
            id="rawText"
            name="rawText"
            required
            rows={3}
            maxLength={500}
            placeholder="Programación - proyecto API viernes 11:59"
            className={field}
          />
          <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">
            Se guarda tal cual. Podrás organizarlo después desde el Inbox.
          </p>
        </div>
      ) : null}

      {mode === 'task' ? (
        <>
          <div>
            <label htmlFor="title" className="block text-sm font-medium">
              Tarea
            </label>
            <input
              ref={firstField as React.RefObject<HTMLInputElement>}
              id="title"
              name="title"
              required
              maxLength={200}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="dueDate" className="block text-sm font-medium">
              Fecha límite
            </label>
            <input id="dueDate" name="dueDate" type="date" className={field} />
          </div>
        </>
      ) : null}

      {mode === 'note' ? (
        <>
          <div>
            <label htmlFor="body" className="block text-sm font-medium">
              Nota
            </label>
            <textarea
              ref={firstField as React.RefObject<HTMLTextAreaElement>}
              id="body"
              name="body"
              required
              rows={4}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="title" className="block text-sm font-medium">
              Título
            </label>
            <input id="title" name="title" maxLength={200} className={field} />
          </div>
        </>
      ) : null}

      <SubjectSelect subjects={subjects} />

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

export function QuickCapture({ subjects }: { subjects: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<Mode>('inbox');

  return (
    <Dialog
      title="Capturar"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          aria-label="Capturar algo"
          className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-2.5 py-1 text-sm font-medium"
        >
          +
        </button>
      )}
    >
      {(close) => (
        <>
          <div
            role="tablist"
            aria-label="Tipo de captura"
            className="mb-4 flex gap-1 border-b border-[color:var(--color-border)]"
          >
            {MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={mode === option.id}
                onClick={() => setMode(option.id)}
                className={
                  mode === option.id
                    ? 'border-b-2 border-[color:var(--color-ink)] px-3 pb-2 text-sm font-medium'
                    : 'text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] border-b-2 border-transparent px-3 pb-2 text-sm'
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          <CaptureForm key={mode} mode={mode} subjects={subjects} close={close} />
        </>
      )}
    </Dialog>
  );
}
