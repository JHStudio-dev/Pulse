import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const { userId, db } = await requireUser();

  // Onboarding is finished once a period exists; do not offer it twice.
  const active = await db.periods.findActive(userId);
  if (active) redirect('/');

  const universities = await db.institutions.listUniversities();
  const campuses = (
    await Promise.all(
      universities.map(async (university) => {
        const instances = await db.institutions.listCampusInstances(university.id);
        return instances.map((instance) => ({
          id: instance.id as string,
          label: `${university.abbreviation} — ${instance.name}`,
        }));
      }),
    )
  ).flat();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Configura tu período</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-1.5 mb-8 text-sm">
        Pulse organiza tus clases dentro de un período académico. Puedes cambiarlo después.
      </p>

      <OnboardingForm campuses={campuses} timeZone="America/Tegucigalpa" />
    </main>
  );
}
