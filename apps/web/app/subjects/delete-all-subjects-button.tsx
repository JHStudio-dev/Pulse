'use client';

import { deleteAllSubjectsInActivePeriod } from './actions';

export function DeleteAllSubjectsButton({
  subjectCount,
  periodName,
}: {
  subjectCount: number;
  periodName: string;
}) {
  return (
    <form
      action={deleteAllSubjectsInActivePeriod}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          [
            `¿Eliminar permanentemente ${subjectCount === 1 ? 'la materia' : `las ${subjectCount} materias`} de ${periodName}, incluidas las archivadas?`,
            'Se borrarán sus tareas, horarios, clases, grabaciones, enlaces de documentos del campus y vínculos de Campus Sync.',
            'Los archivos subidos y las notas pasan a Materias › Sin materia; las capturas siguen en Inbox. Otros períodos no se tocan.',
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
        Eliminar todas
      </button>
    </form>
  );
}
