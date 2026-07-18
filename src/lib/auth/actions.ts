'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveHeadersOrigin } from '@/lib/server/origin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveAuthRedirect, resolveAuthRedirectPath } from './redirect';
import type { MagicLinkInput, PasswordSignInInput } from './schemas';
import { magicLinkSchema, passwordSignInSchema } from './schemas';

async function resolveRuntimeSiteUrl(): Promise<string> {
  const headerStore = await headers();
  const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return resolveHeadersOrigin(headerStore, fallback);
}

type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string };

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Invalid email or password',
  'Email not confirmed': 'Please verify your email address before logging in',
  'User already registered': 'An account with this email already exists',
};

function getSafeErrorMessage(error: Error | { message: string }): string {
  const message = error.message;

  if (SAFE_ERROR_MESSAGES[message]) {
    return SAFE_ERROR_MESSAGES[message];
  }

  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return 'Network error. Please check your connection and try again';
  }

  console.error('[AUTH_ERROR] Unmapped error:', {
    message,
    timestamp: new Date().toISOString(),
  });

  return 'An unexpected error occurred. Please try again';
}

export async function logoutAction(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: getSafeErrorMessage(error),
      };
    }

    cookieStore.delete('is_impersonating');
    revalidatePath('/', 'layout');
    redirect('/login');
  } catch (error) {
    if ((error as Error).message?.includes('NEXT_REDIRECT')) {
      throw error;
    }

    return {
      success: false,
      error: getSafeErrorMessage(error as Error),
    };
  }
}

export async function signInWithGoogleAction(
  redirectTo?: string,
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createSupabaseServerClient();
  const siteUrl = await resolveRuntimeSiteUrl();
  const oauthRedirectTo = resolveAuthRedirect({
    requestedRedirect: redirectTo,
    siteUrl,
    fallbackPath: '/callback',
  });

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: oauthRedirectTo,
      },
    });

    if (error) {
      return {
        success: false,
        error: getSafeErrorMessage(error),
      };
    }

    if (!data.url) {
      return {
        success: false,
        error: 'Failed to initialize Google sign-in. Please try again',
      };
    }

    return {
      success: true,
      data: { url: data.url },
    };
  } catch (error) {
    return {
      success: false,
      error: getSafeErrorMessage(error as Error),
    };
  }
}

export async function signInWithPasswordAction(
  input: PasswordSignInInput,
): Promise<ActionResult<{ redirectPath: string }>> {
  const validation = passwordSignInSchema.safeParse(input);

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message || 'Invalid input',
    };
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = await resolveRuntimeSiteUrl();

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: validation.data.email,
      password: validation.data.password,
    });

    if (error) {
      return {
        success: false,
        error: getSafeErrorMessage(error),
      };
    }

    revalidatePath('/', 'layout');

    return {
      success: true,
      data: {
        redirectPath: resolveAuthRedirectPath({
          requestedRedirect: validation.data.redirectTo,
          siteUrl,
        }),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: getSafeErrorMessage(error as Error),
    };
  }
}

export async function sendMagicLinkAction(input: MagicLinkInput): Promise<ActionResult> {
  const validation = magicLinkSchema.safeParse(input);

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message || 'Invalid input',
    };
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = await resolveRuntimeSiteUrl();
  const emailRedirectTo = resolveAuthRedirect({
    requestedRedirect: validation.data.redirectTo,
    siteUrl,
    fallbackPath: '/callback',
  });

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: validation.data.email,
      options: {
        emailRedirectTo,
        shouldCreateUser: true,
      },
    });

    if (error) {
      return {
        success: false,
        error: getSafeErrorMessage(error),
      };
    }

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: getSafeErrorMessage(error as Error),
    };
  }
}
