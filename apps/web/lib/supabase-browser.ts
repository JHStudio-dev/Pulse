'use client';

import { readPublicConfig } from '@pulse/database';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Client for browser components.
 *
 * Next inlines NEXT_PUBLIC_ values at build time, so the variables are read
 * from an explicit object rather than by iterating process.env.
 */
export function createClient() {
  const config = readPublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return createBrowserClient(config.url, config.publishableKey);
}
