/**
 * What a recording file actually is, read from its own bytes.
 *
 * The browser's idea of a file's type is a guess from its extension, and for a
 * recording that guess decides two things that matter: the type it is stored
 * and served with, and whether it gets a video player or an audio one. Neither
 * should rest on a claim the server can check itself.
 *
 * This reads only the head of a file — enough to name the container and, for
 * the formats Pulse accepts, to see whether a video track is declared.
 */

export interface MediaProbe {
  /** The type to store and serve the file with. Always one the bucket allows. */
  mimeType: string;
  /**
   * Whether the file declares a video track.
   *
   * Null means the head did not settle it — an MP4 whose metadata sits at the
   * end, for instance. The caller decides what to do with an unknown rather
   * than being handed a guess dressed as a fact.
   */
  hasVideoTrack: boolean | null;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = '';
  for (let i = start; i < start + length && i < bytes.length; i++) {
    text += String.fromCharCode(bytes[i]!);
  }
  return text;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** Index of an ASCII needle in the head, or -1. */
function indexOfAscii(bytes: Uint8Array, needle: string, from = 0): number {
  const first = needle.charCodeAt(0);
  for (let i = from; i <= bytes.length - needle.length; i++) {
    if (bytes[i] !== first) continue;
    if (ascii(bytes, i, needle.length) === needle) return i;
  }
  return -1;
}

/** Matroska names its codecs in plain text, which is enough to see a video track. */
const MATROSKA_VIDEO_CODECS = ['V_VP8', 'V_VP9', 'V_AV1', 'V_MPEG4', 'V_MPEGH'];

function probeMatroska(head: Uint8Array): MediaProbe {
  const hasVideo = MATROSKA_VIDEO_CODECS.some((codec) => indexOfAscii(head, codec) !== -1);
  return { mimeType: hasVideo ? 'video/webm' : 'audio/webm', hasVideoTrack: hasVideo };
}

/**
 * Reads the handler type out of an ISO base media file.
 *
 * Every track carries an `hdlr` box naming what it handles; `vide` is a video
 * track and `soun` an audio one. The handler sits twelve bytes past the box
 * name. If no handler is in the head the metadata is at the end of the file,
 * which a recorder that never finalised may also produce, so the answer is
 * unknown rather than false.
 */
function probeIsoMedia(head: Uint8Array): MediaProbe {
  let index = indexOfAscii(head, 'hdlr');
  let sawVideo = false;
  let sawHandler = false;

  while (index !== -1) {
    const handler = ascii(head, index + 12, 4);
    if (handler === 'vide') {
      sawVideo = true;
      sawHandler = true;
    } else if (handler === 'soun') {
      sawHandler = true;
    }
    index = indexOfAscii(head, 'hdlr', index + 4);
  }

  if (!sawHandler) return { mimeType: 'video/mp4', hasVideoTrack: null };
  return { mimeType: sawVideo ? 'video/mp4' : 'audio/mp4', hasVideoTrack: sawVideo };
}

/**
 * Identifies a recording from the first bytes of the file.
 *
 * Returns null for anything Pulse does not accept, which is the same answer as
 * "do not store this": a file whose container cannot be named cannot be served
 * with a type that is true.
 */
export function probeRecordingMedia(head: Uint8Array): MediaProbe | null {
  if (head.length < 12) return null;

  // Matroska and WebM share the EBML header.
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return probeMatroska(head);

  if (ascii(head, 4, 4) === 'ftyp') return probeIsoMedia(head);

  if (ascii(head, 0, 4) === 'OggS') {
    // Theora is the only video codec that turns up in Ogg, and nothing Pulse
    // records produces it, so an Ogg file that claims video is not something to
    // store under a type that would be wrong.
    if (indexOfAscii(head, 'theora') !== -1) return null;
    return { mimeType: 'audio/ogg', hasVideoTrack: false };
  }

  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') {
    return { mimeType: 'audio/wav', hasVideoTrack: false };
  }

  if (ascii(head, 0, 4) === 'fLaC') {
    return { mimeType: 'audio/flac', hasVideoTrack: false };
  }

  // MP3: an ID3 tag, or a bare frame sync.
  if (ascii(head, 0, 3) === 'ID3') return { mimeType: 'audio/mpeg', hasVideoTrack: false };
  if (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) {
    return { mimeType: 'audio/mpeg', hasVideoTrack: false };
  }

  return null;
}

/** How many bytes are worth reading to identify a file. */
export const MEDIA_PROBE_BYTES = 256 * 1024;

/**
 * Which player a recording needs.
 *
 * `hasVideo` is set from the server's own probe of the file, so it is the first
 * answer. The stored MIME type is checked as well, because a row written before
 * the probe existed may carry a video type with the flag unset, and a video
 * shown in an audio element is a black nothing with a scrub bar.
 */
export function recordingPlayerKind(recording: {
  hasVideo: boolean;
  mimeType: string;
}): 'video' | 'audio' {
  if (recording.hasVideo) return 'video';
  return recording.mimeType.startsWith('video/') ? 'video' : 'audio';
}
