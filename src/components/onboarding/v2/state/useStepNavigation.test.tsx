import { afterEach, expect, spyOn, test } from 'bun:test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import * as actions from '@/app/onboarding/actions';
import { OnboardingProvider } from '@/components/onboarding/providers/OnboardingContext';
import { ToastProvider } from '@/components/ui/ToastProvider';
import type { ScreenIndex } from '@/lib/onboarding/resumeScreen';
import { createDefaultOnboardingState, mergeOnboardingState } from '@/lib/onboarding/state';
import * as client from '@/lib/supabase/client';
import { STEP_SAVE_RETRY_DELAY_MS, useStepNavigation } from './useStepNavigation';

const restorers: Array<() => void> = [];
afterEach(() => {
  cleanup();
  for (const restore of restorers.splice(0)) restore();
});

function setup(saveOutcomes: Array<'fail' | 'ok'>) {
  const auth = spyOn(client, 'createSupabaseBrowserClient').mockReturnValue({
    auth: { getSession: async () => ({ data: { session: null } }) },
  } as unknown as ReturnType<typeof client.createSupabaseBrowserClient>);
  const outcomes = [...saveOutcomes];
  const save = spyOn(actions, 'mutateOnboardingStateAction').mockImplementation(
    async (_brandId, patch) => {
      if (outcomes.shift() === 'fail') throw new Error('over_request_rate_limit');
      return mergeOnboardingState(createDefaultOnboardingState(), patch);
    },
  );
  const consoleError = spyOn(console, 'error').mockImplementation(() => {});
  restorers.push(
    () => auth.mockRestore(),
    () => save.mockRestore(),
    () => consoleError.mockRestore(),
  );

  let navigate!: (next: ScreenIndex) => Promise<boolean>;
  function Probe() {
    const nav = useStepNavigation(1);
    navigate = nav.navigate;
    return <output data-testid="screen">{nav.screen}</output>;
  }
  render(
    <ToastProvider>
      <OnboardingProvider brandId="brand-1" initialState={createDefaultOnboardingState()}>
        <Probe />
      </OnboardingProvider>
    </ToastProvider>,
  );
  return { save, navigate: (next: ScreenIndex) => navigate(next) };
}

const shownScreen = () => screen.getByTestId('screen').textContent;
const retryWindow = { timeout: STEP_SAVE_RETRY_DELAY_MS * 3 };

test('keeps the user on the new step when the save succeeds on its one retry', async () => {
  const { save, navigate } = setup(['fail', 'ok']);

  let advanced: boolean | undefined;
  await act(async () => {
    advanced = await navigate(2);
  });

  expect(advanced).toBe(true);
  expect(shownScreen()).toBe('2');
  expect(save).toHaveBeenCalledTimes(2);
  expect(save.mock.calls[1]).toEqual(['brand-1', { step: 2 }]);
  expect(screen.queryByText('Save failed')).toBeNull();
  expect(screen.queryByText('Couldn’t save your progress')).toBeNull();
});

test('waits before the retry instead of re-sending at once', async () => {
  const { save, navigate } = setup(['fail', 'ok']);

  let pending!: Promise<boolean>;
  act(() => {
    pending = navigate(2);
  });
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, STEP_SAVE_RETRY_DELAY_MS / 2));
  expect(save).toHaveBeenCalledTimes(1);
  expect(shownScreen()).toBe('2');

  await act(async () => {
    await pending;
  });
  expect(save).toHaveBeenCalledTimes(2);
});

test('returns to the last saved step and says why when the retry fails too', async () => {
  const { save, navigate } = setup(['fail', 'fail']);

  let advanced: boolean | undefined;
  await act(async () => {
    advanced = await navigate(2);
  });

  expect(advanced).toBe(false);
  expect(save).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(shownScreen()).toBe('1'), retryWindow);
  expect(await screen.findByText('Couldn’t save your progress')).toBeTruthy();
  expect(screen.queryByText('Save failed')).toBeNull();
});

test('does not save when moving back to a step that is already saved', async () => {
  const { save, navigate } = setup([]);

  await act(async () => {
    await navigate(0);
  });

  expect(shownScreen()).toBe('0');
  expect(save).not.toHaveBeenCalled();
});
