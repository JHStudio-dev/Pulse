'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Dialog } from '@/components/dialog';
import { ALLOWED_MIME_TYPES } from '@/lib/uploads';
import { uploadDocument, type UploadResult } from './document-actions';

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

const ACCEPT = [...ALLOWED_MIME_TYPES.keys()].join(',');

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Subiendo' : 'Subir'}
    </button>
  );
}

function UploadForm({ subjectId, close }: { subjectId: string; close: () => void }) {
  const [state, formAction] = useActionState<UploadResult, FormData>(uploadDocument, {
    error: null,
    saved: false,
  });
  const submitted = useRef(false);

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
      <input type="hidden" name="subjectId" value={subjectId} />

      <div>
        <label htmlFor="file" className="block text-sm font-medium">
          Archivo
        </label>
        <input id="file" name="file" type="file" required accept={ACCEPT} className={field} />
        <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">
          PDF, Word, PowerPoint, Excel, imágenes o texto. Máximo 25 MB.
        </p>
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          Título
        </label>
        <input id="title" name="title" maxLength={200} className={field} />
        <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">
          Opcional. Si lo dejas vacío se usa el nombre del archivo.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

export function UploadDocument({ subjectId }: { subjectId: string }) {
  return (
    <Dialog
      title="Subir documento"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-xs"
        >
          Subir documento
        </button>
      )}
    >
      {(close) => <UploadForm subjectId={subjectId} close={close} />}
    </Dialog>
  );
}
