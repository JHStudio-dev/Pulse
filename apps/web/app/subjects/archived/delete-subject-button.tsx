'use client';

import type { SubjectRemovalPreview } from '@/lib/academic-cleanup';
import { deleteSubjectPermanently } from '../actions';

function count(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function removalMessage(subjectName: string, preview: SubjectRemovalPreview): string {
  const removed = [
    count(preview.tasks, 'tarea', 'tareas'),
    'sus horarios, clases y grabaciones',
    ...(preview.campusDocuments > 0
      ? [count(preview.campusDocuments, 'enlace de documento del campus', 'enlaces de documentos del campus')]
      : []),
    'el vínculo de Campus Sync',
  ];

  const kept = [
    ...(preview.keptDocuments > 0 ? [count(preview.keptDocuments, 'archivo subido', 'archivos subidos')] : []),
    ...(preview.keptNotes > 0 ? [count(preview.keptNotes, 'nota', 'notas')] : []),
  ];

  return [
    `¿Eliminar "${subjectName}" permanentemente?`,
    `Se borrarán ${removed.join(', ')}.`,
    ...(kept.length > 0
      ? [`Se conservarán en Materias › Sin materia: ${kept.join(' y ')}.`]
      : []),
    'Esta acción no se puede deshacer.',
  ].join('\n\n');
}

export function DeleteSubjectButton({
  subjectId,
  subjectName,
  preview,
}: {
  subjectId: string;
  subjectName: string;
  preview: SubjectRemovalPreview;
}) {
  return (
    <form
      action={deleteSubjectPermanently}
      onSubmit={(event) => {
        if (!window.confirm(removalMessage(subjectName, preview))) event.preventDefault();
      }}
    >
      <input type="hidden" name="subjectId" value={subjectId} />
      <button
        type="submit"
        className="text-sm text-red-400 underline-offset-4 hover:underline"
      >
        Eliminar permanentemente
      </button>
    </form>
  );
}
