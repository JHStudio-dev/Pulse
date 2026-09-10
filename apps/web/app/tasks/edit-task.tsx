'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import type { Task } from '@pulse/types';
import { Dialog } from '@/components/dialog';
import { deleteTask, updateTask, type TaskResult } from './actions';

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Guardando' : 'Guardar'}
    </button>
  );
}

function EditForm({
  task,
  subjects,
  close,
}: {
  task: Task;
  subjects: { id: string; name: string }[];
  close: () => void;
}) {
  const [state, formAction] = useActionState<TaskResult, FormData>(updateTask, {
    error: null,
    saved: false,
  });

  useEffect(() => {
    if (state.saved && state.error === null) close();
  }, [state, close]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="taskId" value={task.id} />

      <div>
        <label htmlFor={`title-${task.id}`} className="block text-sm font-medium">
          Título
        </label>
        <input
          id={`title-${task.id}`}
          name="title"
          required
          maxLength={200}
          defaultValue={task.title}
          className={field}
        />
      </div>

      <div>
        <label htmlFor={`description-${task.id}`} className="block text-sm font-medium">
          Descripción
        </label>
        <textarea
          id={`description-${task.id}`}
          name="description"
          rows={3}
          defaultValue={task.description ?? ''}
          className={field}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`subject-${task.id}`} className="block text-sm font-medium">
            Materia
          </label>
          <select
            id={`subject-${task.id}`}
            name="subjectId"
            defaultValue={task.subjectId ?? ''}
            className={field}
          >
            <option value="">Sin materia</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`status-${task.id}`} className="block text-sm font-medium">
            Estado
          </label>
          <select
            id={`status-${task.id}`}
            name="status"
            defaultValue={task.status}
            className={field}
          >
            <option value="pending">Pendiente</option>
            <option value="in_progress">En progreso</option>
            <option value="done">Terminada</option>
            <option value="submitted">Entregada</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`due-${task.id}`} className="block text-sm font-medium">
            Fecha límite
          </label>
          <input
            id={`due-${task.id}`}
            name="dueDate"
            type="date"
            defaultValue={task.dueDate ?? ''}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`time-${task.id}`} className="block text-sm font-medium">
            Hora
          </label>
          <input
            id={`time-${task.id}`}
            name="dueTime"
            type="time"
            defaultValue={task.dueTime ?? ''}
            className={field}
          />
        </div>

        <div>
          <label htmlFor={`difficulty-${task.id}`} className="block text-sm font-medium">
            Dificultad
          </label>
          <select
            id={`difficulty-${task.id}`}
            name="difficulty"
            defaultValue={task.difficulty ?? ''}
            className={field}
          >
            <option value="">Sin definir</option>
            <option value="easy">Fácil</option>
            <option value="medium">Media</option>
            <option value="hard">Alta</option>
          </select>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-4 pt-1">
        <SaveButton />
      </div>
    </form>
  );
}

export function EditTask({
  task,
  subjects,
}: {
  task: Task;
  subjects: { id: string; name: string }[];
}) {
  return (
    <Dialog
      title="Editar tarea"
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
        >
          Editar
        </button>
      )}
    >
      {(close) => (
        <>
          <EditForm task={task} subjects={subjects} close={close} />

          <form
            action={deleteTask}
            className="mt-6 border-t border-[color:var(--color-border)] pt-4"
          >
            <input type="hidden" name="taskId" value={task.id} />
            <button
              type="submit"
              className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline underline-offset-4"
            >
              Eliminar tarea
            </button>
          </form>
        </>
      )}
    </Dialog>
  );
}
