import Link from 'next/link';
import { signIn } from '../auth/actions';
import { CredentialsForm } from '../auth/credentials-form';

const ERRORS: Record<string, string> = {
  missing_code: 'El enlace de confirmación está incompleto.',
  invalid_code: 'El enlace de confirmación expiró o ya fue usado.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERRORS[error] : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Entrar a Pulse</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1.5 mb-8 text-sm">
        Usa el correo con el que creaste tu cuenta.
      </p>

      {message ? (
        <p
          role="alert"
          className="mb-6 rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm"
        >
          {message}
        </p>
      ) : null}

      <CredentialsForm action={signIn} submitLabel="Entrar" pendingLabel="Entrando" />

      <p className="text-[color:var(--color-ink-muted)] mt-6 text-sm">
        ¿No tienes cuenta?{' '}
        <Link href="/signup" className="text-[color:var(--color-ink)] underline underline-offset-4">
          Crear una
        </Link>
      </p>
    </main>
  );
}
