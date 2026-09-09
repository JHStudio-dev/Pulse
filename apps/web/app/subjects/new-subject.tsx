'use client';

import { Dialog } from '@/components/dialog';
import { SubjectForm } from './subject-form';

export function NewSubject({ variant = 'button' }: { variant?: 'button' | 'inline' }) {
  return (
    <Dialog
      title="Nueva materia"
      trigger={(open) =>
        variant === 'button' ? (
          <button
            type="button"
            onClick={open}
            className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-3 py-1.5 text-sm font-medium"
          >
            Nueva materia
          </button>
        ) : (
          <button
            type="button"
            onClick={open}
            className="text-[color:var(--color-ink)] text-sm underline underline-offset-4"
          >
            Agregar tu primera materia
          </button>
        )
      }
    >
      {(close) => <SubjectForm onSaved={close} />}
    </Dialog>
  );
}
