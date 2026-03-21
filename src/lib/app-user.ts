/**
 * WHY: Resolve BetterAuth users to the app-level `users` table primary key.
 *
 * BetterAuth user IDs can be non-UUID for legacy accounts, while app tables
 * (study_sessions, understanding_state) use `users.id` as UUID. This helper
 * returns a stable app UUID for the current authenticated user.
 */

import { createServerClient } from '@/lib/supabase';

interface AuthUserLike {
  id: string;
  email?: string | null;
}

const UUID_V4_OR_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_V4_OR_V7_REGEX.test(value);
}

export async function resolveAppUserId(user: AuthUserLike): Promise<string> {
  const supabase = createServerClient();

  // Fast path: UUID auth IDs can map directly to app users.id.
  if (isUuid(user.id)) {
    const { data: existingById } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (existingById) return existingById.id;

    if (!user.email) {
      throw new Error('Authenticated user email is required to initialize profile.');
    }

    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert({ id: user.id, email: user.email })
      .select('id')
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to initialize user profile: ${insertError?.message ?? 'no data returned'}`);
    }

    return inserted.id;
  }

  // Legacy non-UUID BetterAuth IDs: map through email to app users table.
  if (!user.email) {
    throw new Error('Authenticated user email is required to resolve app user ID.');
  }

  const { data: existingByEmail } = await supabase
    .from('users')
    .select('id')
    .eq('email', user.email)
    .maybeSingle();

  if (existingByEmail) return existingByEmail.id;

  const { data: insertedByEmail, error: insertByEmailError } = await supabase
    .from('users')
    .insert({ email: user.email })
    .select('id')
    .single();

  if (insertByEmailError || !insertedByEmail) {
    throw new Error(`Failed to initialize user profile: ${insertByEmailError?.message ?? 'no data returned'}`);
  }

  return insertedByEmail.id;
}