import Link from 'next/link';
import { AuthLayout } from '@/components/auth-layout';
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
      <AuthLayout
        title="Revisa tu correo"
        description="Enviamos un enlace de confirmación. Ábrelo para activar tu cuenta y entrar."
      >
        <Link href="/login" className="text-sm underline underline-offset-4">
          Volver a entrar
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Crear cuenta"
      description="Necesitarás confirmar tu correo antes de entrar."
      footer={
        <span className="text-[color:var(--color-ink-muted)]">
          ¿Ya tienes cuenta?{' '}
          <Link
            href="/login"
            className="text-[color:var(--color-ink)] underline underline-offset-4"
          >
            Entrar
          </Link>
        </span>
      }
    >
      <CredentialsForm
        action={signUp}
        submitLabel="Crear cuenta"
        pendingLabel="Creando"
        passwordHint="Mínimo 8 caracteres."
      />
    </AuthLayout>
  );
}
