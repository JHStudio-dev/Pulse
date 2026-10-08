'use client';

import { deleteAllSubjectsInActivePeriod } from './actions';

export function DeleteAllSubjectsButton({ subjectCount }: { subjectCount: number }) {
  return (
    <form
      action={deleteAllSubjectsInActivePeriod}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `¿Eliminar permanentemente las ${subjectCount} materias del período actual? También se borrarán las tareas asociadas. Esta acción no se puede deshacer.`,
        );

        if (!confirmed) event.preventDefault();
      }}
    >
      <button
        type="submit"
        className="text-xs text-red-400 underline-offset-4 hover:underline"
      >
        Eliminar todas
      </button>
    </form>
  );
}
