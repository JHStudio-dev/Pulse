import { readPublicConfig } from '@pulse/database';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Client for server components, route handlers and server actions.
 *
 * The session lives in cookies so a server render can read it. Writing cookies
 * throws inside a Server Component; the middleware refreshes the session, so
 * that case is safe to ignore here.
 */
export async function createClient() {
  const config = readPublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component; the middleware handles the refresh.
        }
      },
    },
  });
}
