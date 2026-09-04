import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client creation.
 *
 * Two clients exist for a reason. The browser client carries the anon key and
 * is governed by row level security. The service client bypasses RLS and must
 * never be constructed anywhere its key could reach a browser bundle.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export type PulseSupabaseClient = SupabaseClient;

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function readPublicConfig(env: Record<string, string | undefined>): SupabaseConfig {
  return {
    url: requireValue('NEXT_PUBLIC_SUPABASE_URL', env['NEXT_PUBLIC_SUPABASE_URL']),
    anonKey: requireValue('NEXT_PUBLIC_SUPABASE_ANON_KEY', env['NEXT_PUBLIC_SUPABASE_ANON_KEY']),
  };
}

/** Client for signed in users. Every query stays subject to RLS. */
export function createPulseClient(config: SupabaseConfig): PulseSupabaseClient {
  return createClient(config.url, config.anonKey);
}

/**
 * Client for trusted server work such as scheduled jobs.
 *
 * The service role key bypasses row level security, so this throws when handed
 * to a browser rather than silently shipping an unrestricted client.
 */
export function createServiceClient(env: Record<string, string | undefined>): PulseSupabaseClient {
  if ('window' in globalThis) {
    throw new Error('The service client cannot be created in a browser');
  }

  const url = requireValue('SUPABASE_URL', env['SUPABASE_URL'] ?? env['NEXT_PUBLIC_SUPABASE_URL']);
  const serviceKey = requireValue('SUPABASE_SERVICE_ROLE_KEY', env['SUPABASE_SERVICE_ROLE_KEY']);

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
