'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AuthResult } from './actions';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-md bg-[color:var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[color:var(--color-accent-ink)] disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

interface Props {
  action: (previous: AuthResult, formData: FormData) => Promise<AuthResult>;
  submitLabel: string;
  pendingLabel: string;
  passwordHint?: string;
}

export function CredentialsForm({ action, submitLabel, pendingLabel, passwordHint }: Props) {
  const [state, formAction] = useActionState<AuthResult, FormData>(action, { error: null });

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          aria-describedby={passwordHint ? 'password-hint' : undefined}
          className="mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm"
        />
        {passwordHint ? (
          <p id="password-hint" className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">
            {passwordHint}
          </p>
        ) : null}
      </div>

      {/* Errors carry an icon-free text label; colour alone must not signal state. */}
      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}
