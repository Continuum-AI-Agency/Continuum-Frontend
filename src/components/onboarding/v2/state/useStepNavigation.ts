'use client';

// Onboarding's screen position and how a move between screens is saved. The next screen shows
// at once and its step saves behind the transition; a save that fails twice returns the user to
// the last saved step.
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { useOnboarding } from '@/components/onboarding/providers/OnboardingContext';
import { useToast } from '@/components/ui/ToastProvider';
import type { ScreenIndex } from '@/lib/onboarding/resumeScreen';

/** Long enough to ride out a transient failure (a dropped request, a rate-limit window edge). */
export const STEP_SAVE_RETRY_DELAY_MS = 1_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useStepNavigation(initialScreen: ScreenIndex) {
  const { updateState } = useOnboarding();
  const { show } = useToast();
  const tUi = useTranslations('onboarding');
  const [screen, setScreen] = useState<ScreenIndex>(initialScreen);
  const persistedStepRef = useRef<ScreenIndex>(initialScreen);
  const directionRef = useRef<1 | -1>(1);

  const navigate = useCallback(
    async (next: ScreenIndex): Promise<boolean> => {
      const from = screen;
      directionRef.current = next > from ? 1 : -1;
      setScreen(next);
      const completesCatalog = from === 2 && next === 3;
      if (next <= persistedStepRef.current && !completesCatalog) return true;

      const patch = { step: next, ...(completesCatalog ? { catalogCompleted: true } : {}) };
      try {
        await updateState(patch, { notify: false });
      } catch {
        await wait(STEP_SAVE_RETRY_DELAY_MS);
        try {
          await updateState(patch, { notify: false });
        } catch {
          // Only move them back if they are still on the step that did not save.
          setScreen((current) => {
            if (current !== next) return current;
            directionRef.current = -1;
            return persistedStepRef.current;
          });
          show({
            title: tUi('couldn_t_save_your_progress_4d3fb08'),
            description: tUi('saving_this_step_failed_twice_so_you_re_back__c9ad9e3'),
            variant: 'error',
          });
          return false;
        }
      }
      persistedStepRef.current = Math.max(persistedStepRef.current, next) as ScreenIndex;
      return true;
    },
    [screen, show, tUi, updateState],
  );

  const startOver = useCallback(() => {
    persistedStepRef.current = 0;
    directionRef.current = -1;
    setScreen(0);
  }, []);

  return { screen, direction: directionRef, navigate, startOver };
}
