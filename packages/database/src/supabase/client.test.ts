import { describe, expect, it } from 'vitest';
import { createPulseClient, readPublicConfig } from './client';

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
};

describe('readPublicConfig', () => {
  it('reads the url and publishable key', () => {
    expect(readPublicConfig(validEnv)).toEqual({
      url: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    });
  });

  it('names the missing variable so the fix is obvious', () => {
    expect(() => readPublicConfig({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: undefined })).toThrow(
      'NEXT_PUBLIC_SUPABASE_URL',
    );

    expect(() =>
      readPublicConfig({ ...validEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }),
    ).toThrow('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });

  it('treats a blank value as missing', () => {
    expect(() =>
      readPublicConfig({ ...validEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '   ' }),
    ).toThrow('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });

  // The legacy name silently produced a broken config once already.
  it('does not fall back to the legacy anon key name', () => {
    expect(() =>
      readPublicConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-value',
      }),
    ).toThrow('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });
});

describe('createPulseClient', () => {
  it('builds a client from a valid config', () => {
    const client = createPulseClient(readPublicConfig(validEnv));
    expect(typeof client.from).toBe('function');
    expect(typeof client.auth).toBe('object');
  });
});
