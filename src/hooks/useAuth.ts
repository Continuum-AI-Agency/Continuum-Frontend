'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  logoutAction,
  sendMagicLinkAction,
  signInWithGoogleAction,
  signInWithPasswordAction,
} from '@/lib/auth/actions';
import type { MagicLinkInput, PasswordSignInInput } from '@/lib/auth/schemas';
import { buildOAuthStartUrl } from '@/lib/oauth';
import { openCenteredPopup, waitForPopupMessage } from '@/lib/popup';

type UseAuthOptions = {
  initialError?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(options?.initialError ?? null);
  const [isGooglePending, setIsGooglePending] = useState(false);
  const router = useRouter();

  const logout = async (): Promise<boolean> => {
    setError(null);

    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await logoutAction();

        if (!result.success) {
          setError(result.error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  };

  const sendMagicLink = async (input: MagicLinkInput): Promise<boolean> => {
    setError(null);

    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await sendMagicLinkAction(input);

        if (!result.success) {
          setError(result.error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  };

  const signInWithPassword = async (input: PasswordSignInInput): Promise<boolean> => {
    setError(null);

    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await signInWithPasswordAction(input);

        if (!result.success) {
          setError(result.error);
          resolve(false);
          return;
        }

        // The action set the session cookie server-side; refresh so the server
        // tree re-renders as authenticated before navigating.
        router.refresh();
        router.replace(result.data.redirectPath);
        resolve(true);
      });
    });
  };

  const signInWithGooglePopup = async (redirectTo?: string): Promise<void> => {
    setError(null);
    setIsGooglePending(true);

    try {
      const url = buildOAuthStartUrl('google', 'login', { popup: true });
      const popup = openCenteredPopup(url, 'Continue with Google');

      if (!popup) {
        const result = await signInWithGoogleAction(redirectTo);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push(result.data.url);
        return;
      }

      type OAuthSuccess = {
        type: 'oauth:success';
        provider: string | null;
        context: string;
        accountId: string | null;
      };
      type OAuthError = {
        type: 'oauth:error';
        provider: string | null;
        context: string;
        message: string;
      };

      const message = await Promise.race<OAuthSuccess | OAuthError>([
        waitForPopupMessage<OAuthSuccess>('oauth:success', {
          predicate: (m) => (m as OAuthSuccess).context === 'login',
          timeoutMs: 120000,
        }),
        waitForPopupMessage<OAuthError>('oauth:error', {
          predicate: (m) => (m as OAuthError).context === 'login',
          timeoutMs: 120000,
        }),
      ]);

      if ((message as OAuthError).type === 'oauth:error') {
        const err = message as OAuthError;
        setError(err.message || 'Authentication failed. Please try again');
        return;
      }

      try {
        popup.close();
      } catch {}

      router.refresh();
      const nextRedirect = redirectTo ?? '/dashboard';
      router.replace(nextRedirect);
    } catch {
      setError('Authentication failed. Please try again');
    } finally {
      setIsGooglePending(false);
    }
  };

  const clearError = () => setError(null);

  return {
    logout,
    sendMagicLink,
    signInWithPassword,
    signInWithGooglePopup,
    isPending,
    isGooglePending,
    error,
    setError,
    clearError,
  };
}
