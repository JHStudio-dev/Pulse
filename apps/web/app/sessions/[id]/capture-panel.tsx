'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_RECORDING_SECONDS } from '@pulse/core';
import {
  baseMimeType,
  CaptureError,
  isDisplayCaptureSupported,
  isMicrophoneCaptureSupported,
  pickRecordingType,
  releaseCapture,
  startMicrophoneCapture,
  startVirtualCapture,
  type CaptureStream,
} from '@/lib/capture';
import { formatDuration } from '@/lib/recordings';
import { uploadRecording, type RecordingResult } from './recording-actions';

/**
 * Direct capture for one class.
 *
 * A virtual class records the tab, window or screen the student picks in the
 * browser's own dialog; a class in a room records the microphone. Both need the
 * student to confirm they may record, and both need a second, separate consent
 * from the browser itself. Neither can start without a click.
 */

type Phase = 'idle' | 'starting' | 'recording' | 'saving';

interface Outcome {
  hasSystemAudio: boolean;
  hasMicrophone: boolean;
}

const START_LABEL: Record<'virtual_meeting' | 'in_person_audio', string> = {
  virtual_meeting: 'Elegir qué compartir y grabar',
  in_person_audio: 'Grabar micrófono',
};

export function CapturePanel({
  sessionId,
  mode,
  onSaved,
}: {
  sessionId: string;
  mode: 'virtual_meeting' | 'in_person_audio';
  onSaved: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [confirmed, setConfirmed] = useState(false);
  const [withMicrophone, setWithMicrophone] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);

  const captureRef = useRef<CaptureStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  // Feature detection has to wait for the browser: on the server there is no
  // navigator, and guessing would render the wrong panel first.
  useEffect(() => {
    setSupported(
      mode === 'virtual_meeting' ? isDisplayCaptureSupported() : isMicrophoneCaptureSupported(),
    );
  }, [mode]);

  useEffect(() => {
    if (phase !== 'recording') return;

    const timer = setInterval(() => {
      const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) stopRecording();
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // A recording left running when the screen goes away would hold the
  // microphone or the shared surface open with nothing watching it.
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state === 'recording') recorder.stop();
      if (captureRef.current) releaseCapture(captureRef.current);
    };
  }, []);

  async function save(blob: Blob, seconds: number, result: Outcome) {
    setPhase('saving');

    const type =
      baseMimeType(blob.type) || (mode === 'virtual_meeting' ? 'video/webm' : 'audio/webm');
    const extension = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

    const data = new FormData();
    data.set('sessionId', sessionId);
    data.set('permissionConfirmed', 'on');
    data.set('permission', 'own_permission');
    data.set('captureMode', mode);
    data.set('hasVideo', String(mode === 'virtual_meeting'));
    data.set('hasSystemAudio', String(result.hasSystemAudio));
    data.set('hasMicrophone', String(result.hasMicrophone));
    data.set('durationSeconds', String(seconds));
    data.set('file', new File([blob], `clase-${stamp}.${extension}`, { type }));

    const outcomeState: RecordingResult = await uploadRecording(
      { error: null, saved: false },
      data,
    );

    setPhase('idle');
    setElapsed(0);
    setConfirmed(false);
    setOutcome(null);

    if (outcomeState.error !== null) {
      setError(outcomeState.error);
      return;
    }

    setError(null);
    onSaved();
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }

  async function start() {
    setError(null);
    setPhase('starting');

    let capture: CaptureStream;
    try {
      capture =
        mode === 'virtual_meeting'
          ? await startVirtualCapture(withMicrophone)
          : await startMicrophoneCapture();
    } catch (caught) {
      setPhase('idle');
      const reason = caught instanceof CaptureError ? caught.reason : 'failed';
      setError(
        reason === 'denied'
          ? 'El navegador no dio permiso para capturar.'
          : reason === 'unsupported'
            ? 'Este navegador no puede capturar aquí.'
            : 'No se pudo iniciar la captura.',
      );
      return;
    }

    const result: Outcome = {
      hasSystemAudio: capture.hasSystemAudio,
      hasMicrophone: capture.hasMicrophone,
    };

    // A silent video cannot be transcribed and would only look like a recording
    // that worked. Refuse it here rather than after the upload.
    if (!result.hasSystemAudio && !result.hasMicrophone) {
      releaseCapture(capture);
      setPhase('idle');
      setError(
        'La captura llegó sin audio de la reunión y sin micrófono. Activa "Compartir audio" en el diálogo del navegador o incluye tu micrófono.',
      );
      return;
    }

    const type = pickRecordingType(mode === 'virtual_meeting');
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(capture.stream, type === '' ? undefined : { mimeType: type });
    } catch {
      releaseCapture(capture);
      setPhase('idle');
      setError('Este navegador no puede grabar ese formato.');
      return;
    }

    chunksRef.current = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });

    recorder.addEventListener('stop', () => {
      const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || type });
      chunksRef.current = [];
      releaseCapture(capture);
      captureRef.current = null;
      void save(blob, seconds, result);
    });

    // The browser's own "stop sharing" control ends the track. Honour it, or the
    // recording would run on against a surface nobody is sharing any more.
    for (const track of capture.stream.getTracks()) {
      track.addEventListener('ended', stopRecording);
    }

    captureRef.current = capture;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setOutcome(result);
    setElapsed(0);
    recorder.start(5000);
    setPhase('recording');
  }

  if (supported === false) {
    return (
      <p className="text-[color:var(--color-ink-muted)] mt-3 text-sm">
        {mode === 'virtual_meeting'
          ? 'Este navegador no permite capturar una pestaña o pantalla. Puedes subir el archivo de la grabación.'
          : 'Este navegador no da acceso al micrófono. Puedes subir el archivo de la grabación.'}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {phase === 'recording' ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full bg-[color:var(--color-accent)]"
            />
            <span className="font-mono text-lg tabular-nums" aria-live="off">
              {formatDuration(elapsed)}
            </span>
            <span className="text-sm">Grabando</span>
            <button
              type="button"
              onClick={stopRecording}
              className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] ml-auto rounded-md px-4 py-2 text-sm font-medium"
            >
              Detener y guardar
            </button>
          </div>

          {mode === 'virtual_meeting' && outcome && !outcome.hasSystemAudio ? (
            <p className="text-sm">
              Tu navegador no compartió el audio de la reunión. Se está grabando solo tu micrófono,
              así que la voz del profesor puede no quedar registrada.
            </p>
          ) : null}
        </>
      ) : (
        <>
          {mode === 'virtual_meeting' ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withMicrophone}
                onChange={(event) => setWithMicrophone(event.target.checked)}
              />
              Incluir también mi micrófono
            </label>
          ) : null}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 shrink-0"
            />
            Confirmo que tengo permiso para grabar esta clase.
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={start}
              disabled={!confirmed || phase !== 'idle'}
              className="bg-[color:var(--color-accent)] text-[color:var(--color-accent-ink)] rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {phase === 'starting'
                ? 'Pidiendo permiso'
                : phase === 'saving'
                  ? 'Guardando'
                  : START_LABEL[mode]}
            </button>
            <span className="text-[color:var(--color-ink-muted)] text-xs">
              {mode === 'virtual_meeting'
                ? 'Tú eliges la pestaña, ventana o pantalla en el diálogo del navegador.'
                : 'Solo audio del micrófono, sin video.'}
            </span>
          </div>

          <p className="text-[color:var(--color-ink-muted)] text-xs">
            Pulse nunca inicia una grabación por su cuenta ni elige qué compartir.
          </p>
        </>
      )}

      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
