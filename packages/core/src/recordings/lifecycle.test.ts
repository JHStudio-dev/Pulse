import { describe, expect, it } from 'vitest';
import {
  canQueueRecording,
  canTransitionRecording,
  isRecordingDurationAllowed,
  isRecordingProcessing,
  isRecordingTerminal,
  MAX_RECORDING_ATTEMPTS,
  MAX_RECORDING_SECONDS,
} from './lifecycle';

describe('canTransitionRecording', () => {
  it('walks the pipeline in order', () => {
    expect(canTransitionRecording('uploaded', 'queued')).toBe(true);
    expect(canTransitionRecording('queued', 'transcribing')).toBe(true);
    expect(canTransitionRecording('transcribing', 'analyzing')).toBe(true);
    expect(canTransitionRecording('analyzing', 'ready')).toBe(true);
  });

  it('refuses to skip a step', () => {
    expect(canTransitionRecording('uploaded', 'transcribing')).toBe(false);
    expect(canTransitionRecording('queued', 'ready')).toBe(false);
  });

  it('allows failing from any working state', () => {
    expect(canTransitionRecording('uploaded', 'failed')).toBe(true);
    expect(canTransitionRecording('queued', 'failed')).toBe(true);
    expect(canTransitionRecording('transcribing', 'failed')).toBe(true);
    expect(canTransitionRecording('analyzing', 'failed')).toBe(true);
  });

  it('lets a finished or failed recording be queued again', () => {
    expect(canTransitionRecording('ready', 'queued')).toBe(true);
    expect(canTransitionRecording('failed', 'queued')).toBe(true);
  });

  it('does not resurrect a finished recording into the middle of the pipeline', () => {
    expect(canTransitionRecording('ready', 'transcribing')).toBe(false);
    expect(canTransitionRecording('failed', 'ready')).toBe(false);
  });
});

describe('isRecordingProcessing', () => {
  it('covers every state where work is under way', () => {
    expect(isRecordingProcessing('queued')).toBe(true);
    expect(isRecordingProcessing('transcribing')).toBe(true);
    expect(isRecordingProcessing('analyzing')).toBe(true);
  });

  it('excludes the states where nothing is running', () => {
    expect(isRecordingProcessing('uploaded')).toBe(false);
    expect(isRecordingProcessing('ready')).toBe(false);
    expect(isRecordingProcessing('failed')).toBe(false);
  });
});

describe('isRecordingTerminal', () => {
  it('is true once the pipeline has stopped', () => {
    expect(isRecordingTerminal('ready')).toBe(true);
    expect(isRecordingTerminal('failed')).toBe(true);
    expect(isRecordingTerminal('uploaded')).toBe(false);
  });
});

describe('canQueueRecording', () => {
  it('accepts a freshly uploaded recording', () => {
    expect(canQueueRecording({ status: 'uploaded', attempts: 0 })).toBe(true);
  });

  it('refuses one that is already in flight', () => {
    expect(canQueueRecording({ status: 'transcribing', attempts: 1 })).toBe(false);
  });

  it('lets a failed recording be retried until it runs out of attempts', () => {
    expect(canQueueRecording({ status: 'failed', attempts: MAX_RECORDING_ATTEMPTS - 1 })).toBe(
      true,
    );
    expect(canQueueRecording({ status: 'failed', attempts: MAX_RECORDING_ATTEMPTS })).toBe(false);
  });

  it('allows reprocessing a finished recording', () => {
    expect(canQueueRecording({ status: 'ready', attempts: 1 })).toBe(true);
  });
});

describe('isRecordingDurationAllowed', () => {
  it('accepts an unknown duration, which a browser cannot always read', () => {
    expect(isRecordingDurationAllowed(null)).toBe(true);
  });

  it('accepts a class up to the limit', () => {
    expect(isRecordingDurationAllowed(1)).toBe(true);
    expect(isRecordingDurationAllowed(MAX_RECORDING_SECONDS)).toBe(true);
  });

  it('rejects anything longer than the limit', () => {
    expect(isRecordingDurationAllowed(MAX_RECORDING_SECONDS + 1)).toBe(false);
  });

  it('rejects values that are not a real length', () => {
    expect(isRecordingDurationAllowed(0)).toBe(false);
    expect(isRecordingDurationAllowed(-60)).toBe(false);
    expect(isRecordingDurationAllowed(Number.NaN)).toBe(false);
    expect(isRecordingDurationAllowed(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
