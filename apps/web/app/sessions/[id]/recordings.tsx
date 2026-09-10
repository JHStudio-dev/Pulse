'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { MAX_RECORDING_SECONDS } from '@pulse/core';
import type { Recording, RecordingStatus } from '@pulse/types';
import { describeRecordingType, formatDuration } from '@/lib/recordings';
import { formatSize } from '@/lib/uploads';
import {
  deleteRecording,
  playRecording,
  uploadRecording,
  type PlaybackResult,
  type RecordingResult,
} from './recording-actions';

/**
 * Recordings attached to a class.
 *
 * Nothing here starts a microphone. A recording arrives because the student
 * chose a file and said they may use it, which is the only way Pulse accepts
 * one: no automatic capture, and no recording that has not been confirmed as
 * permitted.
 */

const STATUS_LABEL: Record<RecordingStatus, string> = {
  uploaded: 'Guardada',
  queued: 'En cola',
  transcribing: 'Transcribiendo',
  analyzing: 'Analizando',
  ready: 'Lista',
  failed: 'Falló',
};

function UploadButton({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || blocked}
      className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
    >
      {pending ? 'Subiendo' : 'Adjuntar grabación'}
    </button>
  );
}

/** How long to wait for the browser to report a length before giving up. */
const DURATION_TIMEOUT_MS = 5000;

/**
 * Reads the length in the browser, the only side that can do it cheaply.
 *
 * Some browsers never load metadata for a local file — media policy, a codec
 * they will not touch, a container they only parse while playing — and answer
 * with neither an event nor an error. The timeout is what keeps the form usable
 * in that case: an unknown duration is allowed, a form stuck on "reading" is
 * not.
 */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';

    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), DURATION_TIMEOUT_MS);

    audio.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null);
    });
    audio.addEventListener('error', () => finish(null));

    audio.src = url;
    audio.load();
  });
}

function UploadForm({ sessionId }: { sessionId: string }) {
  const [state, formAction] = useActionState<RecordingResult, FormData>(uploadRecording, {
    error: null,
    saved: false,
  });
  const [duration, setDuration] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [checked, setChecked] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const tooLong = duration !== null && duration > MAX_RECORDING_SECONDS;

  async function onFileChange() {
    const file = fileRef.current?.files?.[0] ?? null;
    setDuration(null);
    setChecked(false);

    if (!file) return;

    setReading(true);
    const seconds = await readDuration(file);
    setDuration(seconds);
    setChecked(true);
    setReading(false);
  }

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="durationSeconds" value={duration ?? ''} />

      <div>
        <label htmlFor="recording-file" className="mb-1.5 block text-sm">
          Archivo de audio o video
        </label>
        <input
          ref={fileRef}
          id="recording-file"
          name="file"
          type="file"
          required
          accept="audio/*,video/mp4,video/webm"
          onChange={onFileChange}
          className="w-full text-sm"
        />
        {reading ? (
          <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">Leyendo duración</p>
        ) : null}
        {!reading && checked && duration !== null ? (
          <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">
            Duración detectada: {formatDuration(duration)}
          </p>
        ) : null}
        {!reading && checked && duration === null ? (
          <p className="text-[color:var(--color-ink-muted)] mt-1.5 text-xs">
            No se pudo leer la duración en el navegador. Puedes subirla igual.
          </p>
        ) : null}
        {tooLong ? (
          <p role="alert" className="mt-1.5 text-xs">
            Esa grabación pasa de {MAX_RECORDING_SECONDS / 60} minutos.
          </p>
        ) : null}
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm">¿Por qué puedes usar esta grabación?</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="permission" value="own_permission" defaultChecked required />
            Tengo permiso para grabar la clase
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="permission" value="official_material" required />
            Es una grabación oficial de la clase
          </label>
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="permissionConfirmed"
          required
          className="mt-0.5 shrink-0"
          aria-describedby="permission-help"
        />
        Confirmo que tengo permiso para grabar o usar esta clase.
      </label>
      <p id="permission-help" className="text-[color:var(--color-ink-muted)] text-xs">
        Pulse no graba por su cuenta ni en segundo plano. Solo procesa lo que tú adjuntas.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <UploadButton blocked={tooLong} />
        <span className="text-[color:var(--color-ink-muted)] text-xs">
          Hasta {MAX_RECORDING_SECONDS / 60} minutos, 200 MB.
        </span>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function PlayButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline disabled:opacity-60"
    >
      {pending ? 'Abriendo' : 'Reproducir'}
    </button>
  );
}

/**
 * Playback opens on request rather than on render.
 *
 * The signed URL lives five minutes, so putting one in the page for every
 * recording would hand out links nobody asked for and expire them before most
 * are used.
 */
function RecordingRow({ recording }: { recording: Recording }) {
  const [state, formAction] = useActionState<PlaybackResult, FormData>(playRecording, {
    error: null,
    url: null,
    recordingId: null,
  });

  const detail = [
    describeRecordingType(recording.mimeType),
    recording.durationSeconds === null
      ? 'Duración desconocida'
      : formatDuration(recording.durationSeconds),
    formatSize(recording.sizeBytes),
  ]
    .filter((part) => part.length > 0)
    .join(' · ');

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-medium">
          {recording.originalFilename ?? 'Grabación de clase'}
        </span>
        <span className="text-[color:var(--color-ink-muted)] text-xs">
          {STATUS_LABEL[recording.status]}
        </span>

        <span className="ml-auto flex items-center gap-3">
          <form action={formAction}>
            <input type="hidden" name="recordingId" value={recording.id} />
            <PlayButton />
          </form>

          <form action={deleteRecording}>
            <input type="hidden" name="recordingId" value={recording.id} />
            <button
              type="submit"
              className="text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] text-xs underline-offset-4 hover:underline"
            >
              Eliminar
            </button>
          </form>
        </span>
      </div>

      <p className="text-[color:var(--color-ink-muted)] mt-1 text-xs">{detail}</p>

      {recording.status === 'failed' && recording.failureReason ? (
        <p className="mt-1 text-xs">No se pudo procesar: {recording.failureReason}</p>
      ) : null}

      {/* No captions yet: those come from the transcript, which Phase 2.5B builds. */}
      {state.url ? <audio controls src={state.url} className="mt-2 w-full" preload="none" /> : null}

      {state.error ? (
        <p role="alert" className="mt-1 text-xs">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

export function Recordings({
  sessionId,
  recordings,
}: {
  sessionId: string;
  recordings: Recording[];
}) {
  return (
    <section className="mt-8" aria-labelledby="recordings-heading">
      <h2 id="recordings-heading" className="text-sm font-medium">
        Grabaciones
      </h2>

      {recordings.length === 0 ? (
        <p className="text-[color:var(--color-ink-muted)] mt-2 text-sm">
          Todavía no hay grabaciones de esta clase.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-t border-[color:var(--color-border)]">
          {recordings.map((recording) => (
            <RecordingRow key={recording.id} recording={recording} />
          ))}
        </ul>
      )}

      <UploadForm sessionId={sessionId} />
    </section>
  );
}
