"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  loginAction,
  signupAction,
  logoutAction,
  recoveryAction,
  signInWithGoogleAction,
} from "@/lib/auth/actions";
import type { LoginInput, SignupInput, RecoveryInput } from "@/lib/auth/schemas";
import { openCenteredPopup, waitForPopupMessage } from "@/lib/popup";

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

  const signInWithGooglePopup = async (): Promise<void> => {
    setError(null);
    setIsGooglePending(true);

    try {
      const url = `/oauth/start?provider=google&context=login`;
      const popup = openCenteredPopup(url, "Continue with Google");

      // Fallback: popup blocked by the browser
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

      // Success: session cookies are set by the callback route
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
    signInWithGooglePopup,
    isPending,
    isGooglePending,
    error,
    setError,
    clearError,
  };
}

