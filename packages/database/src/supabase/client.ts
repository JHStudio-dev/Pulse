import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client creation.
 *
 * The publishable key is safe to ship to the browser: it identifies the project
 * and nothing more. Row level security decides what each request may read or
 * write, so this key on its own grants no access to another student's data.
 *
 * There is no server client yet. Nothing in Pulse needs to bypass RLS, and a
 * secret key is worth adding only when a scheduled job actually requires one.
 */

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
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
    publishableKey: requireValue(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
    ),
  };
}

/** Client for the browser and for server rendering. Every query stays under RLS. */
export function createPulseClient(config: SupabaseConfig): PulseSupabaseClient {
  return createClient(config.url, config.publishableKey);
}
