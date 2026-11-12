'use client';

import { useTranslations } from 'next-intl';

import React, { createContext, useCallback, useContext, useTransition } from 'react';
import {
  mutateOnboardingStateAction,
  resetOnboardingStateAction,
} from '@/app/[locale]/onboarding/actions';
import { useToast } from '@/components/ui/ToastProvider';
import { createSerializedMutationQueue } from '@/lib/onboarding/mutationQueue';
import type { OnboardingPatch, OnboardingState } from '@/lib/onboarding/state';
import { mergeOnboardingState } from '@/lib/onboarding/state';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { getSessionUser } from '@/lib/supabase/sessionUser';

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
  const tUi = useTranslations('onboarding');

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
      const user = await getSessionUser();
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
            title: tUi('m_0a44446762'),
            description: tUi('m_447945d50d'),
            variant: 'error',
          });
          throw error;
        } finally {
          setPendingCount((count) => Math.max(0, count - 1));
        }
      }),
    [brandId, show, tUi],
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
            title: tUi('m_c64a0943dc'),
            description: tUi('m_296ddc198a'),
            variant: 'success',
          });
        } catch (error) {
          stateRef.current = previous;
          startTransition(() => {
            setState(previous);
          });
          show({
            title: tUi('m_ca42c6fe10'),
            description: tUi('m_7ea9320aa7'),
            variant: 'error',
          });
          throw error;
        } finally {
          setPendingCount((count) => Math.max(0, count - 1));
        }
      }),
    [brandId, show, tUi],
  );

  const reloadState = useCallback((next: OnboardingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const isPending = pendingCount > 0 || isTransitionPending;

  return (
    <OnboardingContext.Provider
      value={{
        brandId,
        state,
        userId,
        isPending,
        updateState,
        resetState,
        reloadState,
      }}
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
  const tUi = useTranslations('onboarding');

  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboardingField must be used within an OnboardingProvider');
  }
  return selector(context);
}
