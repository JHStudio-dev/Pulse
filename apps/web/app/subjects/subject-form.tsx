'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createSubject, type SubjectResult } from './actions';

const field =
  'mt-1.5 w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
    >
      {pending ? 'Guardando' : 'Agregar materia'}
    </button>
  );
}

export function SubjectForm() {
  const [state, formAction] = useActionState<SubjectResult, FormData>(createSubject, {
    error: null,
  });
  const [modality, setModality] = useState('unconfirmed');
  const formRef = useRef<HTMLFormElement>(null);
  const saved = useRef(false);

  // Clear the form only after a save that reported no error.
  useEffect(() => {
    if (state.error === null && saved.current) {
      formRef.current?.reset();
      setModality('unconfirmed');
      saved.current = false;
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={(data) => {
        saved.current = true;
        formAction(data);
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Nombre
          </label>
          <input id="name" name="name" required maxLength={160} className={field} />
        </div>
        <div>
          <label htmlFor="code" className="block text-sm font-medium">
            Código
          </label>
          <input id="code" name="code" maxLength={40} className={field} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="professorName" className="block text-sm font-medium">
            Profesor
          </label>
          <input id="professorName" name="professorName" maxLength={160} className={field} />
        </div>
        <div>
          <label htmlFor="defaultModality" className="block text-sm font-medium">
            Modalidad habitual
          </label>
          <select
            id="defaultModality"
            name="defaultModality"
            value={modality}
            onChange={(event) => setModality(event.target.value)}
            className={field}
          >
            <option value="unconfirmed">Sin confirmar</option>
            <option value="in_person">Presencial</option>
            <option value="virtual">Virtual</option>
            <option value="hybrid">Híbrida</option>
          </select>
        </div>
      </div>

      {/* Only the fields the chosen modality actually uses are shown. */}
      {modality === 'virtual' || modality === 'hybrid' ? (
        <div>
          <label htmlFor="defaultMeetingUrl" className="block text-sm font-medium">
            Enlace de clase
          </label>
          <input
            id="defaultMeetingUrl"
            name="defaultMeetingUrl"
            type="url"
            placeholder="https://"
            className={field}
          />
        </div>
      ) : null}

      {modality === 'in_person' || modality === 'hybrid' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="campus" className="block text-sm font-medium">
              Campus
            </label>
            <input id="campus" name="campus" maxLength={120} className={field} />
          </div>
          <div>
            <label htmlFor="building" className="block text-sm font-medium">
              Edificio
            </label>
            <input id="building" name="building" maxLength={120} className={field} />
          </div>
          <div>
            <label htmlFor="room" className="block text-sm font-medium">
              Aula
            </label>
            <input id="room" name="room" maxLength={60} className={field} />
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="rounded-md border border-red-500/40 px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
