import { MAX_RECORDING_SECONDS, type Recording, type RecordingStatus } from '@pulse/types';

/**
 * The lifecycle of a recording, as rules rather than as a worker.
 *
 * Processing happens outside the request that uploads the file, so the only
 * thing shared between the upload, the queue and whatever runs the transcription
 * is agreement on which moves are legal. That agreement lives here, free of any
 * provider or scheduler.
 */

/** How many times a failed recording may be sent back through the pipeline. */
export const MAX_RECORDING_ATTEMPTS = 3;

const TRANSITIONS: Record<RecordingStatus, readonly RecordingStatus[]> = {
  uploaded: ['queued', 'failed'],
  queued: ['transcribing', 'failed'],
  transcribing: ['analyzing', 'failed'],
  analyzing: ['ready', 'failed'],
  // A finished recording can be sent through again, which is how a better
  // model or a corrected language setting gets applied.
  ready: ['queued'],
  failed: ['queued'],
};

export function canTransitionRecording(from: RecordingStatus, to: RecordingStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Work is under way and no one else should pick this recording up. */
export function isRecordingProcessing(status: RecordingStatus): boolean {
  return status === 'queued' || status === 'transcribing' || status === 'analyzing';
}

export function isRecordingTerminal(status: RecordingStatus): boolean {
  return status === 'ready' || status === 'failed';
}

/**
 * Whether the pipeline may be started.
 *
 * A recording already in flight is not startable, and a failed one stops being
 * startable once it has used its attempts: retrying forever costs money and
 * fixes nothing.
 */
export function canQueueRecording(recording: Pick<Recording, 'status' | 'attempts'>): boolean {
  if (isRecordingProcessing(recording.status)) return false;
  if (recording.status === 'failed') return recording.attempts < MAX_RECORDING_ATTEMPTS;
  return true;
}

export function isRecordingDurationAllowed(seconds: number | null): boolean {
  if (seconds === null) return true;
  return Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_RECORDING_SECONDS;
}

export { MAX_RECORDING_SECONDS };

/**
 * The file transcription should read.
 *
 * A video recording is never handed to transcription directly: the audio is
 * pulled out first and that is what gets processed, which keeps the cost tied
 * to the audio and lets the model be an audio model. The other two modes are
 * already audio, or are whatever the student uploaded, so the stored file is
 * the source. Null means the recording is not ready to transcribe yet.
 */
export function transcriptionSourcePath(
  recording: Pick<Recording, 'captureMode' | 'storagePath' | 'audioStoragePath' | 'hasVideo'>,
): string | null {
  if (recording.audioStoragePath !== null) return recording.audioStoragePath;
  if (recording.hasVideo) return null;
  return recording.storagePath;
}

/** A video recording needs its audio pulled out before anything can read it. */
export function needsAudioExtraction(
  recording: Pick<Recording, 'audioStoragePath' | 'hasVideo'>,
): boolean {
  return recording.hasVideo && recording.audioStoragePath === null;
}

/**
 * Whether there is any audio to transcribe at all.
 *
 * A display capture that came back without tab or system audio and without a
 * microphone is a silent video: worth keeping if the student wants it, but
 * nothing downstream can do anything with it.
 */
export function hasAudioSource(
  recording: Pick<Recording, 'captureMode' | 'hasSystemAudio' | 'hasMicrophone'>,
): boolean {
  if (recording.captureMode === 'upload') return true;
  return recording.hasSystemAudio || recording.hasMicrophone;
}
