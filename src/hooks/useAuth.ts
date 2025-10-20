"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  loginAction,
  signupAction,
  logoutAction,
  recoveryAction,
  signInWithGoogleAction,
} from "@/lib/auth/actions";
import type { LoginInput, SignupInput, RecoveryInput } from "@/lib/auth/schemas";

export function useAuth() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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

  const clearError = () => setError(null);

  return {
    login,
    signup,
    logout,
    recovery,
    signInWithGoogle,
    isPending,
    error,
    setError,
    clearError,
  };
}

