/**
 * Recording upload rules, enforced on the server.
 *
 * The bucket applies the same size and type limits, so a caller who skips the
 * form still cannot store something the rules forbid. This layer exists to turn
 * a rejection into a sentence the student can act on.
 */

/** Matches the bucket limit. The project wide limit may be lower. */
export const MAX_RECORDING_BYTES = 200 * 1024 * 1024;

export const ALLOWED_RECORDING_TYPES: ReadonlyMap<string, string> = new Map([
  ['audio/mpeg', 'MP3'],
  ['audio/mp4', 'M4A'],
  ['audio/x-m4a', 'M4A'],
  ['audio/aac', 'AAC'],
  ['audio/ogg', 'OGG'],
  ['audio/opus', 'Opus'],
  ['audio/webm', 'WebM'],
  ['audio/wav', 'WAV'],
  ['audio/x-wav', 'WAV'],
  ['audio/flac', 'FLAC'],
  ['video/mp4', 'MP4'],
  ['video/webm', 'WebM'],
]);

export function describeRecordingType(mimeType: string): string {
  return ALLOWED_RECORDING_TYPES.get(mimeType) ?? 'Audio';
}

/** "1:32:10" or "04:20". Null duration reads as unknown at the call site. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
