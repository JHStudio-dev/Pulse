import Link from 'next/link';
import { AuthLayout } from '@/components/auth-layout';
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
    <AuthLayout
      title="Entrar"
      description="Usa el correo con el que creaste tu cuenta."
      footer={
        <span className="text-[color:var(--color-ink-muted)]">
          ¿No tienes cuenta?{' '}
          <Link
            href="/signup"
            className="text-[color:var(--color-ink)] underline underline-offset-4"
          >
            Crear una
          </Link>
        </span>
      }
    >
      {message ? (
        <p
          role="alert"
          className="mb-5 rounded-md border border-[color:var(--color-border)] px-3 py-2 text-sm"
        >
          {message}
        </p>
      ) : null}

      <CredentialsForm action={signIn} submitLabel="Entrar" pendingLabel="Entrando" />
    </AuthLayout>
  );
}
