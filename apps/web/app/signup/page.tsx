import Link from 'next/link';
import { signUp } from '../auth/actions';
import { CredentialsForm } from '../auth/credentials-form';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ check?: string }>;
}) {
  const { check } = await searchParams;

  if (check) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Revisa tu correo</h1>
        <p className="text-[color:var(--color-ink-muted)] mt-3 text-sm">
          Enviamos un enlace de confirmación. Ábrelo para activar tu cuenta y entrar.
        </p>
        <p className="text-[color:var(--color-ink-muted)] mt-6 text-sm">
          <Link
            href="/login"
            className="text-[color:var(--color-ink)] underline underline-offset-4"
          >
            Volver a entrar
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1.5 mb-8 text-sm">
        Necesitarás confirmar tu correo antes de entrar.
      </p>

      <CredentialsForm
        action={signUp}
        submitLabel="Crear cuenta"
        pendingLabel="Creando"
        passwordHint="Mínimo 8 caracteres."
      />

      <p className="text-[color:var(--color-ink-muted)] mt-6 text-sm">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-[color:var(--color-ink)] underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </main>
  );
}
