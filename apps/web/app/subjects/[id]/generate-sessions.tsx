'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { generateSessions, type GenerateResult } from './generate-actions';

function SubmitButton({ hasSessions }: { hasSessions: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-xs disabled:opacity-60"
    >
      {pending ? 'Generando' : hasSessions ? 'Generar las que falten' : 'Generar clases'}
    </button>
  );
}

export function GenerateSessions({
  subjectId,
  hasSessions,
}: {
  subjectId: string;
  hasSessions: boolean;
}) {
  const [state, formAction] = useActionState<GenerateResult, FormData>(generateSessions, {
    error: null,
    created: 0,
  });

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="subjectId" value={subjectId} />
      <SubmitButton hasSessions={hasSessions} />

      {state.error ? (
        <span role="alert" className="text-sm">
          {state.error}
        </span>
      ) : null}

      {state.error === null && state.created > 0 ? (
        <span role="status" className="text-[color:var(--color-ink-muted)] text-sm">
          {state.created} {state.created === 1 ? 'clase creada' : 'clases creadas'}
        </span>
      ) : null}
    </form>
  );
}
