/**
 * WHY: Typed Supabase client factory for server and browser contexts.
 *
 * Supabase requires different clients depending on context: the server client uses
 * the service role key (bypasses RLS, full DB access — never send to browser) while
 * the browser client uses the anon key (subject to RLS policies). Centralising both
 * factories here ensures we never accidentally use the wrong key in the wrong context,
 * and the Database generic keeps all queries type-safe against the Supabase schema.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server client — use in API routes and server components.
 * Uses the service role key: bypasses RLS, has full DB access.
 * Never expose this to the browser.
 */
export function createServerClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Browser client — use in client components.
 * Uses the anon key: subject to RLS policies.
 */
export function createBrowserClient() {
  return createClient<Database>(supabaseUrl, supabaseAnonKey);
}

/**
 * Singleton browser client for use outside React components
 * (e.g., utility functions, non-component modules).
 */
let browserClientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserClient() {
  if (!browserClientInstance) {
    browserClientInstance = createBrowserClient();
  }
  return browserClientInstance;
}
