"use client";

import React, { createContext, useContext, useOptimistic, useTransition, useCallback } from "react";
import type { OnboardingState, OnboardingPatch } from "@/lib/onboarding/state";
import { mutateOnboardingStateAction, resetOnboardingStateAction } from "@/app/onboarding/actions";
import { mergeOnboardingState } from "@/lib/onboarding/state";
import { useToast } from "@/components/ui/ToastProvider";

type OnboardingContextValue = {
  brandId: string;
  state: OnboardingState;
  isPending: boolean;
  updateState: (patch: OnboardingPatch) => Promise<void>;
  resetState: () => Promise<void>;
  reloadState: (next: OnboardingState) => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

type OnboardingProviderProps = {
  brandId: string;
  initialState: OnboardingState;
  children: React.ReactNode;
};

export function OnboardingProvider({ brandId, initialState, children }: OnboardingProviderProps) {
  const [state, setState] = React.useState<OnboardingState>(initialState);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  const updateState = useCallback(async (patch: OnboardingPatch) => {
    startTransition(async () => {
      const nextOptimistic = mergeOnboardingState(state, patch);
      setState(nextOptimistic);

      try {
        const serverNext = await mutateOnboardingStateAction(brandId, patch);
        setState(serverNext);
      } catch (error) {
        console.error("Failed to update onboarding state", error);
        show({ title: "Save failed", description: "Could not update your changes.", variant: "error" });
      }
    });
  }, [brandId, state, show]);

  const resetState = useCallback(async () => {
    startTransition(async () => {
      try {
        const next = await resetOnboardingStateAction(brandId);
        setState(next);
        show({ title: "Reset complete", description: "Onboarding state cleared.", variant: "success" });
      } catch (error) {
        show({ title: "Reset failed", description: "Could not clear state.", variant: "error" });
      }
    });
  }, [brandId, show]);

  const reloadState = useCallback((next: OnboardingState) => {
    setState(next);
  }, []);

  return (
    <OnboardingContext.Provider value={{ brandId, state, isPending, updateState, resetState, reloadState }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
