'use client';

import React, { createContext, useCallback, useContext, useTransition } from 'react';
import { mutateOnboardingStateAction, resetOnboardingStateAction } from '@/app/onboarding/actions';
import { useToast } from '@/components/ui/ToastProvider';
import { createSerializedMutationQueue } from '@/lib/onboarding/mutationQueue';
import type { OnboardingPatch, OnboardingState } from '@/lib/onboarding/state';
import { mergeOnboardingState } from '@/lib/onboarding/state';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type OnboardingContextValue = {
  brandId: string;
  state: OnboardingState;
  userId: string | null;
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
  const stateRef = React.useRef(initialState);
  const mutationQueue = React.useRef(createSerializedMutationQueue());
  const [userId, setUserId] = React.useState<string | null>(null);
  const [pendingCount, setPendingCount] = React.useState(0);
  const [isTransitionPending, startTransition] = useTransition();
  const { show } = useToast();

  React.useEffect(() => {
    const fetchUser = async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    fetchUser();
  }, []);

  const updateState = useCallback(
    (patch: OnboardingPatch) =>
      mutationQueue.current.enqueue(async () => {
        const previous = stateRef.current;
        const nextOptimistic = mergeOnboardingState(previous, patch);
        stateRef.current = nextOptimistic;
        setPendingCount((count) => count + 1);
        startTransition(() => {
          setState(nextOptimistic);
        });

        try {
          const serverNext = await mutateOnboardingStateAction(brandId, patch);
          stateRef.current = serverNext;
          startTransition(() => {
            setState(serverNext);
          });
        } catch (error) {
          stateRef.current = previous;
          startTransition(() => {
            setState(previous);
          });
          console.error('Failed to update onboarding state', error);
          show({
            title: 'Save failed',
            description: 'Could not update your changes.',
            variant: 'error',
          });
          throw error;
        } finally {
          setPendingCount((count) => Math.max(0, count - 1));
        }
      }),
    [brandId, show],
  );

  const resetState = useCallback(
    () =>
      mutationQueue.current.enqueue(async () => {
        const previous = stateRef.current;
        setPendingCount((count) => count + 1);
        try {
          const next = await resetOnboardingStateAction(brandId);
          stateRef.current = next;
          startTransition(() => {
            setState(next);
          });
          show({
            title: 'Reset complete',
            description: 'Onboarding state cleared.',
            variant: 'success',
          });
        } catch (error) {
          stateRef.current = previous;
          startTransition(() => {
            setState(previous);
          });
          show({ title: 'Reset failed', description: 'Could not clear state.', variant: 'error' });
          throw error;
        } finally {
          setPendingCount((count) => Math.max(0, count - 1));
        }
      }),
    [brandId, show],
  );

  const reloadState = useCallback((next: OnboardingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const isPending = pendingCount > 0 || isTransitionPending;

  return (
    <OnboardingContext.Provider
      value={{ brandId, state, userId, isPending, updateState, resetState, reloadState }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

// Selector hook — prevents re-renders when unsubscribed fields change.
// Note: React context does not suppress re-renders automatically;
// this improves ergonomics and co-locates the selector pattern.
// Full elimination requires context splitting (future work).
export function useOnboardingField<T>(selector: (ctx: OnboardingContextValue) => T): T {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboardingField must be used within an OnboardingProvider');
  }
  return selector(context);
}
