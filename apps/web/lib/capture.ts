/**
 * Direct capture in the browser.
 *
 * Two modes, because a virtual class and a room are not the same problem. A
 * virtual class is captured from a tab, window or screen the student picks in
 * the browser's own dialog, and the meeting audio rides along with it when the
 * browser allows. A class in a room is the microphone and nothing else.
 *
 * Nothing here starts on its own. Every entry point needs the student to act,
 * and the browser shows its own permission prompt on top of that, which is
 * exactly the guarantee that matters: Pulse cannot pick the surface, cannot
 * start unattended, and cannot hide that it is recording.
 */

export interface CaptureStream {
  stream: MediaStream;
  hasVideo: boolean;
  hasSystemAudio: boolean;
  hasMicrophone: boolean;
  /** Closed with the stream; kept so the mix does not get collected mid-recording. */
  audioContext: AudioContext | null;
  /** Streams to stop alongside the mixed one. */
  sources: MediaStream[];
}

export class CaptureError extends Error {
  readonly reason: 'unsupported' | 'denied' | 'failed';

  constructor(reason: 'unsupported' | 'denied' | 'failed', message: string) {
    super(message);
    this.name = 'CaptureError';
    this.reason = reason;
  }
}

export function isDisplayCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function isMicrophoneCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

/** The first container the browser admits it can record. */
export function pickRecordingType(wantsVideo: boolean): string {
  const candidates = wantsVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/**
 * Drops the codec parameters from a recorder MIME type.
 *
 * MediaRecorder reports `video/webm;codecs=vp9,opus`, while the storage bucket
 * matches on the bare type. Uploading the full string is rejected as a
 * disallowed type, which reads like a permissions problem and is not one.
 */
export function baseMimeType(type: string): string {
  return type.split(';')[0]?.trim() ?? '';
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * Captures a browser surface the student chooses, with its audio when offered.
 *
 * The surface is never chosen here: `getDisplayMedia` opens the browser's own
 * picker and Pulse only receives what comes back. Audio is requested, but many
 * browsers return display video with no tab or system audio at all, so what
 * actually arrived is reported rather than assumed.
 */
export async function startVirtualCapture(withMicrophone: boolean): Promise<CaptureStream> {
  if (!isDisplayCaptureSupported()) {
    throw new CaptureError('unsupported', 'display capture unavailable');
  }

  let display: MediaStream;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      // Asking is free; whether it arrives is the browser's decision.
      audio: true,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new CaptureError(
      name === 'NotAllowedError' ? 'denied' : 'failed',
      'display capture refused',
    );
  }

  const hasSystemAudio = display.getAudioTracks().length > 0;
  const sources: MediaStream[] = [display];

  let microphone: MediaStream | null = null;
  if (withMicrophone) {
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      sources.push(microphone);
    } catch {
      // A refused microphone is not a refused recording: the display capture
      // still stands, and the caller reports what it ended up with.
      microphone = null;
    }
  }

  const audioSources = sources.filter((source) => source.getAudioTracks().length > 0);

  // One track each way is enough on its own; two have to be mixed, because a
  // MediaRecorder records a single audio track.
  let audioContext: AudioContext | null = null;
  let audioTracks: MediaStreamTrack[] = [];

  if (audioSources.length === 1) {
    audioTracks = audioSources[0]!.getAudioTracks();
  } else if (audioSources.length > 1) {
    audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    for (const source of audioSources) {
      audioContext.createMediaStreamSource(source).connect(destination);
    }
    audioTracks = destination.stream.getAudioTracks();
  }

  const stream = new MediaStream([...display.getVideoTracks(), ...audioTracks]);

  return {
    stream,
    hasVideo: display.getVideoTracks().length > 0,
    hasSystemAudio,
    hasMicrophone: microphone !== null,
    audioContext,
    sources,
  };
}

/** Microphone only. A class in a room needs no video. */
export async function startMicrophoneCapture(): Promise<CaptureStream> {
  if (!isMicrophoneCaptureSupported()) {
    throw new CaptureError('unsupported', 'microphone capture unavailable');
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return {
      stream,
      hasVideo: false,
      hasSystemAudio: false,
      hasMicrophone: true,
      audioContext: null,
      sources: [stream],
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new CaptureError(name === 'NotAllowedError' ? 'denied' : 'failed', 'microphone refused');
  }
}

/** Releases every device the capture was holding. */
export function releaseCapture(capture: CaptureStream): void {
  stopStream(capture.stream);
  for (const source of capture.sources) stopStream(source);
  void capture.audioContext?.close();
}
