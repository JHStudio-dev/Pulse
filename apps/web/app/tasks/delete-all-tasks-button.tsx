'use client';

import { deleteAllTasksInActivePeriod } from './actions';

export function DeleteAllTasksButton({ taskCount }: { taskCount: number }) {
  return (
    <form
      action={deleteAllTasksInActivePeriod}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `¿Eliminar todas las tareas del período actual? Hay ${taskCount} visibles ahora. También se eliminarán las tareas de materias archivadas y las tareas sin materia. Esta acción no se puede deshacer.`,
        );

        if (!confirmed) event.preventDefault();
      }}
    >
      <button
        type="submit"
        className="text-xs text-red-400 underline-offset-4 hover:underline"
      >
        Eliminar todas las tareas
      </button>
    </form>
  );
}
