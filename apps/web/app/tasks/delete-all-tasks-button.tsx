'use client';

import { deleteAllTasksInActivePeriod, deleteUnassignedTasks } from './actions';

export function DeleteAllTasksButton({
  taskCount,
  periodName,
}: {
  taskCount: number;
  periodName: string;
}) {
  return (
    <form
      action={deleteAllTasksInActivePeriod}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          [
            `¿Eliminar ${taskCount === 1 ? 'la tarea' : `las ${taskCount} tareas`} de las materias de ${periodName}, incluidas las archivadas?`,
            'Las tareas sin materia y las de otros períodos se conservan.',
            'Las que vinieron del campus no volverán a importarse; puedes restaurarlas desde Tareas.',
            'Esta acción no se puede deshacer.',
          ].join('\n\n'),
        );

        if (!confirmed) event.preventDefault();
      }}
    >
      <button
        type="submit"
        className="text-xs text-red-400 underline-offset-4 hover:underline"
      >
        Eliminar tareas del período
      </button>
    </form>
  );
}

export function DeleteUnassignedTasksButton({ taskCount }: { taskCount: number }) {
  return (
    <form
      action={deleteUnassignedTasks}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          [
            `¿Eliminar ${taskCount === 1 ? 'la tarea' : `las ${taskCount} tareas`} sin materia, pendientes y completadas?`,
            'Estas tareas no pertenecen a ningún período, así que se borran todas las que ves en este grupo.',
            'Esta acción no se puede deshacer.',
          ].join('\n\n'),
        );

        if (!confirmed) event.preventDefault();
      }}
    >
      <button
        type="submit"
        className="text-xs text-red-400 underline-offset-4 hover:underline"
      >
        Eliminar sin materia
      </button>
    </form>
  );
}
