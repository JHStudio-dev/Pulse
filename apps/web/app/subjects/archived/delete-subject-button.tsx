'use client';

import { deleteSubjectPermanently } from '../actions';

export function DeleteSubjectButton({
  subjectId,
  subjectName,
}: {
  subjectId: string;
  subjectName: string;
}) {
  return (
    <form
      action={deleteSubjectPermanently}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `¿Eliminar "${subjectName}" permanentemente? Esta acción no se puede deshacer.`,
        );

        if (!confirmed) event.preventDefault();
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
