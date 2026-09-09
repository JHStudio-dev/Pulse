'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { credentialsSchema } from '@pulse/validation';
import { createClient } from '@/lib/supabase-server';

/**
 * Authentication actions.
 *
 * Errors come back as a value rather than a thrown exception, so a form can
 * show them without losing what the student already typed.
 */

export interface AuthResult {
  error: string | null;
}

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
}

export async function signIn(_previous: AuthResult, formData: FormData): Promise<AuthResult> {
  const parsed = readCredentials(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Supabase does not distinguish a wrong password from an unknown account.
    return { error: 'Correo o contraseña incorrectos' };
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signUp(_previous: AuthResult, formData: FormData): Promise<AuthResult> {
  const parsed = readCredentials(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
  }

  const origin = (await headers()).get('origin');
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return { error: error.message };
  }

  redirect('/signup?check=1');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
