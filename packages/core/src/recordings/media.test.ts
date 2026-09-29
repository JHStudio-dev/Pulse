import { describe, expect, it } from 'vitest';
import { probeRecordingMedia, recordingPlayerKind } from './media';

/** Builds a head that starts with the given bytes and then some ASCII. */
function head(signature: number[], text = '', padTo = 64): Uint8Array {
  const bytes = new Uint8Array(Math.max(padTo, signature.length + text.length));
  bytes.set(signature, 0);
  for (let i = 0; i < text.length; i++) bytes[signature.length + i] = text.charCodeAt(i);
  return bytes;
}

const EBML = [0x1a, 0x45, 0xdf, 0xa3];

/** An ISO base media head: four size bytes, `ftyp`, then the boxes that follow. */
function isoHead(text: string): Uint8Array {
  return head([0, 0, 0, 0x18], `ftyp${text}`);
}

describe('probeRecordingMedia', () => {
  it('reads a WebM with a video codec as video', () => {
    const probe = probeRecordingMedia(head(EBML, 'webmB\u0002V_VP9\u0001A_OPUS'));
    expect(probe).toEqual({ mimeType: 'video/webm', hasVideoTrack: true });
  });

  it('reads a WebM with only an audio codec as audio', () => {
    const probe = probeRecordingMedia(head(EBML, 'webmB\u0002A_OPUS'));
    expect(probe).toEqual({ mimeType: 'audio/webm', hasVideoTrack: false });
  });

  it('recognises the other Matroska video codecs', () => {
    for (const codec of ['V_VP8', 'V_AV1', 'V_MPEG4/ISO/AVC']) {
      expect(probeRecordingMedia(head(EBML, `webm${codec}`))?.hasVideoTrack).toBe(true);
    }
  });

  it('reads an MP4 video handler as video', () => {
    const probe = probeRecordingMedia(
      isoHead('isomhdlr\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000vide'),
    );
    expect(probe).toEqual({ mimeType: 'video/mp4', hasVideoTrack: true });
  });

  it('reads an MP4 with only a sound handler as audio', () => {
    const probe = probeRecordingMedia(
      isoHead('M4A hdlr\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000soun'),
    );
    expect(probe).toEqual({ mimeType: 'audio/mp4', hasVideoTrack: false });
  });

  it('finds the video handler even when an audio track comes first', () => {
    const probe = probeRecordingMedia(
      isoHead(
        'isomhdlr\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000sounXXXXhdlr\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000vide',
      ),
    );
    expect(probe?.hasVideoTrack).toBe(true);
  });

  it('does not guess when an MP4 keeps its metadata out of the head', () => {
    const probe = probeRecordingMedia(isoHead('isommdat'));
    expect(probe).toEqual({ mimeType: 'video/mp4', hasVideoTrack: null });
  });

  it('identifies the audio containers', () => {
    expect(probeRecordingMedia(head([], 'OggS\u0000\u0002OpusHead'))).toEqual({
      mimeType: 'audio/ogg',
      hasVideoTrack: false,
    });
    expect(probeRecordingMedia(head([], 'RIFF\u0000\u0000\u0000\u0000WAVEfmt '))).toEqual({
      mimeType: 'audio/wav',
      hasVideoTrack: false,
    });
    expect(probeRecordingMedia(head([], 'fLaC\u0000\u0000\u0000\u0022'))).toEqual({
      mimeType: 'audio/flac',
      hasVideoTrack: false,
    });
    expect(probeRecordingMedia(head([], 'ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000'))).toEqual({
      mimeType: 'audio/mpeg',
      hasVideoTrack: false,
    });
    expect(probeRecordingMedia(head([0xff, 0xfb, 0x90, 0x00]))).toEqual({
      mimeType: 'audio/mpeg',
      hasVideoTrack: false,
    });
  });

  it('refuses an Ogg carrying video, which Pulse has no type for', () => {
    expect(probeRecordingMedia(head([], 'OggS\u0000\u0002\u0080theora'))).toBeNull();
  });

  it('refuses anything it cannot name', () => {
    expect(probeRecordingMedia(head([], 'not a media file at all'))).toBeNull();
    expect(probeRecordingMedia(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('recordingPlayerKind', () => {
  it('gives a video recording a video player', () => {
    expect(recordingPlayerKind({ hasVideo: true, mimeType: 'video/webm' })).toBe('video');
  });

  it('gives a microphone recording an audio player', () => {
    expect(recordingPlayerKind({ hasVideo: false, mimeType: 'audio/webm' })).toBe('audio');
  });

  it('trusts a video MIME type even when the flag was never set', () => {
    expect(recordingPlayerKind({ hasVideo: false, mimeType: 'video/mp4' })).toBe('video');
  });
});
