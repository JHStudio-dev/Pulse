/**
 * Foundation page.
 *
 * Phase 0 has no product screens yet. This states what exists instead of
 * mocking a dashboard, so nothing here looks functional before it is.
 */

const foundations = [
  { label: 'Tipos y limites compartidos', detail: 'packages/types, packages/validation' },
  { label: 'Logica academica', detail: 'packages/core' },
  { label: 'Acceso a datos desacoplado', detail: 'packages/database' },
  { label: 'Esquema y RLS', detail: 'supabase/migrations' },
];

const next = [
  'Autenticacion por email',
  'Periodo academico, materias y horarios',
  'Sesiones de clase con modalidad propia',
];

export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <header>
        <p className="text-[color:var(--color-ink-muted)] text-sm tracking-wide uppercase">
          Scale Studio
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Pulse</h1>
        <p className="text-[color:var(--color-ink-muted)] mt-3 text-base">
          Sistema academico multiuniversidad. Fase 0: arquitectura y validacion tecnica.
        </p>
      </header>

      <section className="mt-10" aria-labelledby="foundations-heading">
        <h2 id="foundations-heading" className="text-sm font-medium">
          Base implementada
        </h2>
        <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
          {foundations.map((item) => (
            <li key={item.label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3">
              <span className="text-sm">{item.label}</span>
              <code className="text-[color:var(--color-ink-muted)] font-mono text-xs">
                {item.detail}
              </code>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="next-heading">
        <h2 id="next-heading" className="text-sm font-medium">
          Siguiente fase
        </h2>
        <ul className="text-[color:var(--color-ink-muted)] mt-3 space-y-1 text-sm">
          {next.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
