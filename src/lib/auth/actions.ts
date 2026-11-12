'use server';

import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCookieLocale, restoreAccountLocale } from '@/i18n/server';
import { resolveHeadersOrigin } from '@/lib/server/origin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  IMPERSONATION_COOKIE,
  isImpersonationMarked,
  SIGN_OUT_EVERYWHERE_REFUSED_WHILE_IMPERSONATING,
} from './impersonation';
import { buildAuthCallbackUrl, resolveAuthRedirectPath } from './redirect';
import type { EmailCodeInput, MagicLinkInput, PasswordSignInInput } from './schemas';
import { emailCodeSchema, magicLinkSchema, passwordSignInSchema } from './schemas';

async function resolveRuntimeSiteUrl(): Promise<string> {
  const headerStore = await headers();
  const fallback = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return resolveHeadersOrigin(headerStore, fallback);
}

type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string };

const SAFE_ERROR_MESSAGES = {
  'Invalid login credentials': 'invalidCredentials',
  'Email not confirmed': 'emailNotConfirmed',
  'User already registered': 'alreadyRegistered',
  'Token has expired or is invalid': 'expiredCode',
  'Invalid email address': 'invalidEmail',
  'Password is required': 'requiredPassword',
  'Enter the code from your email': 'emailCodeRequired',
  'Invalid input': 'invalidInput',
  'Failed to initialize Google sign-in. Please try again': 'googleInitFailed',
} as const;

async function getSafeErrorMessage(error: Error | { message: string }): Promise<string> {
  const t = await getTranslations({
    locale: await getCookieLocale(),
    namespace: 'auth',
  });
  const message = error.message;

  if (Object.hasOwn(SAFE_ERROR_MESSAGES, message)) {
    return t(SAFE_ERROR_MESSAGES[message as keyof typeof SAFE_ERROR_MESSAGES]);
  }

  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return t('networkError');
  }

  console.error('[AUTH_ERROR] Unmapped error:', {
    message,
    timestamp: new Date().toISOString(),
  });

  return t('unexpectedError');
}

// Sign out ends THIS browser's session only. auth-js defaults to 'global', which ended every
// session of the account on every device — the customer's own devices too, when an admin pressed
// it under an impersonation link (PP-DT-C-signout-ends-every-device).
export async function logoutAction(): Promise<ActionResult> {
  return endSessions('local');
}

// Sign out of all devices (Settings → Profile). A session opened from an impersonation link is
// refused before anything is signed out: it would end the customer's sessions on their devices.
export async function logoutEverywhereAction(): Promise<ActionResult> {
  if (isImpersonationMarked(await cookies())) {
    return {
      success: false,
      error: SIGN_OUT_EVERYWHERE_REFUSED_WHILE_IMPERSONATING,
    };
  }

  return endSessions('global');
}

async function endSessions(scope: 'local' | 'global'): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();

  try {
    const { error } = await supabase.auth.signOut({ scope });

    if (error) {
      return {
        success: false,
        error: await getSafeErrorMessage(error),
      };
    }

    cookieStore.delete(IMPERSONATION_COOKIE);
    revalidatePath('/', 'layout');
    redirect('/login');
  } catch (error) {
    if ((error as Error).message?.includes('NEXT_REDIRECT')) {
      throw error;
    }

    return {
      success: false,
      error: await getSafeErrorMessage(error as Error),
    };
  }
}

export async function signInWithGoogleAction(
  redirectTo?: string,
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createSupabaseServerClient();
  const siteUrl = await resolveRuntimeSiteUrl();
  const oauthRedirectTo = buildAuthCallbackUrl({ siteUrl, next: redirectTo });

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
        error: await getSafeErrorMessage(error),
      };
    }

    if (!data.url) {
      return {
        success: false,
        error: await getSafeErrorMessage({
          message: 'Failed to initialize Google sign-in. Please try again',
        }),
      };
    }

    return {
      success: true,
      data: { url: data.url },
    };
  } catch (error) {
    return {
      success: false,
      error: await getSafeErrorMessage(error as Error),
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
      error: await getSafeErrorMessage({
        message: validation.error.issues[0]?.message || 'Invalid input',
      }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = await resolveRuntimeSiteUrl();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validation.data.email,
      password: validation.data.password,
    });

    if (error) {
      return {
        success: false,
        error: await getSafeErrorMessage(error),
      };
    }

    if (data?.user) await restoreAccountLocale(data.user.user_metadata);
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
      error: await getSafeErrorMessage(error as Error),
    };
  }
}

export async function sendMagicLinkAction(input: MagicLinkInput): Promise<ActionResult> {
  const validation = magicLinkSchema.safeParse(input);

  if (!validation.success) {
    return {
      success: false,
      error: await getSafeErrorMessage({
        message: validation.error.issues[0]?.message || 'Invalid input',
      }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = await resolveRuntimeSiteUrl();
  const emailRedirectTo = buildAuthCallbackUrl({
    siteUrl,
    next: validation.data.redirectTo,
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
        error: await getSafeErrorMessage(error),
      };
    }

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: await getSafeErrorMessage(error as Error),
    };
  }
}

export async function verifyEmailCodeAction(
  input: EmailCodeInput,
): Promise<ActionResult<{ redirectPath: string }>> {
  const validation = emailCodeSchema.safeParse(input);

  if (!validation.success) {
    return {
      success: false,
      error: await getSafeErrorMessage({
        message: validation.error.issues[0]?.message || 'Invalid input',
      }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const siteUrl = await resolveRuntimeSiteUrl();

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: validation.data.email,
      token: validation.data.token,
      type: 'email',
    });

    if (error) {
      return {
        success: false,
        error: await getSafeErrorMessage(error),
      };
    }

    if (data?.user) await restoreAccountLocale(data.user.user_metadata);
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
      error: await getSafeErrorMessage(error as Error),
    };
  }
}
