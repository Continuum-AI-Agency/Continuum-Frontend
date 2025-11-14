"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  loginAction,
  signupAction,
  logoutAction,
  recoveryAction,
  signInWithGoogleAction,
  signInWithLinkedInAction,
  sendMagicLinkAction,
} from "@/lib/auth/actions";
import type { LoginInput, SignupInput, RecoveryInput, MagicLinkInput } from "@/lib/auth/schemas";
import { openCenteredPopup, waitForPopupMessage } from "@/lib/popup";
import { buildOAuthStartUrl } from "@/lib/oauth";

export function useAuth() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isGooglePending, setIsGooglePending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const login = async (input: LoginInput): Promise<boolean> => {
    setError(null);
    
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await loginAction(input);
        
        if (!result.success) {
          setError(result.error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  };

  const signup = async (input: SignupInput): Promise<boolean> => {
    setError(null);
    
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await signupAction(input);
        
        if (!result.success) {
          setError(result.error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  };

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

  const recovery = async (input: RecoveryInput): Promise<boolean> => {
    setError(null);
    
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await recoveryAction(input);
        
        if (!result.success) {
          setError(result.error);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  };

  const signInWithGoogle = async () => {
    setError(null);

    const result = await signInWithGoogleAction();

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.push(result.data.url);
  };

  const signInWithLinkedIn = async () => {
    setError(null);

    const result = await signInWithLinkedInAction();

    if (!result.success) {
      setError(result.error);
      return;
    }

    router.push(result.data.url);
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

  const signInWithGooglePopup = async (): Promise<void> => {
    setError(null);
    setIsGooglePending(true);

    try {
      const url = buildOAuthStartUrl("google", "login");
      const popup = openCenteredPopup(url, "Continue with Google");

      if (!popup) {
        const result = await signInWithGoogleAction();
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push(result.data.url);
        return;
      }

      type OAuthSuccess = {
        type: "oauth:success";
        provider: string | null;
        context: string;
        accountId: string | null;
      };
      type OAuthError = {
        type: "oauth:error";
        provider: string | null;
        context: string;
        message: string;
      };

      const message = await Promise.race<OAuthSuccess | OAuthError>([
        waitForPopupMessage<OAuthSuccess>("oauth:success", {
          predicate: (m) => (m as OAuthSuccess).context === "login",
          timeoutMs: 120000,
        }),
        waitForPopupMessage<OAuthError>("oauth:error", {
          predicate: (m) => (m as OAuthError).context === "login",
          timeoutMs: 120000,
        }),
      ]);

      if ((message as OAuthError).type === "oauth:error") {
        const err = message as OAuthError;
        setError(err.message || "Authentication failed. Please try again");
        return;
      }

      try {
        popup.close();
      } catch {}

      router.refresh();
      const redirectTo = searchParams.get("redirectTo") || "/dashboard";
      router.replace(redirectTo);
    } catch {
      setError("Authentication failed. Please try again");
    } finally {
      setIsGooglePending(false);
    }
  };

  const clearError = () => setError(null);

  return {
    login,
    signup,
    logout,
    recovery,
    signInWithGoogle,
    signInWithLinkedIn,
    sendMagicLink,
    signInWithGooglePopup,
    isPending,
    isGooglePending,
    error,
    setError,
    clearError,
  };
}
