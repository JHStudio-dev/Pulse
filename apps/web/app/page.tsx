import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { createClient } from '@/lib/supabase-server';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The middleware already redirects, so this only guards a direct render.
  if (!user) redirect('/login');

  return (
    <AppShell email={user.email ?? ''}>
      <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
        Aún no hay nada que mostrar aquí. Configura tu período y tus materias para empezar.
      </p>
    </AppShell>
  );
}
