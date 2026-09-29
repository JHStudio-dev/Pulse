import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';
import { CampusSyncImport } from './import-client';

export default async function CampusSyncImportPage() {
  const { userId, email, db } = await requireUser();
  const period = await db.periods.findActive(userId);
  if (!period) redirect('/onboarding');

  const [subjects, connection] = await Promise.all([
    db.subjects.listByPeriod(userId, period.id),
    db.campusConnections.findByUser(userId),
  ]);

  return (
    <AppShell email={email} subjects={subjects.map((subject) => ({ id: subject.id, name: subject.name }))}>
      <h1 className="text-2xl font-semibold tracking-tight">Campus Sync</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-2 max-w-xl text-sm">
        Revisa los datos detectados por Campus Companion. Puedes crear la materia automáticamente
        o vincular el curso con una materia que ya exista.
      </p>

      {!connection ? (
        <p className="mt-6 text-sm">Configura una universidad antes de importar datos del campus.</p>
      ) : (
        <CampusSyncImport
          subjects={subjects.map((subject) => ({
            id: subject.id,
            name: subject.name,
            code: subject.code,
          }))}
        />
      )}
    </AppShell>
  );
}
