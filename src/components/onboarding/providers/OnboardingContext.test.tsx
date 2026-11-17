import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import * as actions from '@/app/onboarding/actions';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { createDefaultOnboardingState } from '@/lib/onboarding/state';
import * as client from '@/lib/supabase/client';
import { OnboardingProvider, useOnboarding } from './OnboardingContext';

const restorers: Array<() => void> = [];
afterEach(() => {
  cleanup();
  for (const restore of restorers.splice(0)) restore();
});

function setup(saveError: Error) {
  const auth = spyOn(client, 'createSupabaseBrowserClient').mockReturnValue({
    auth: { getSession: async () => ({ data: { session: null } }) },
  } as unknown as ReturnType<typeof client.createSupabaseBrowserClient>);
  const save = spyOn(actions, 'mutateOnboardingStateAction').mockRejectedValue(saveError);
  const reload = spyOn(window.location, 'reload').mockImplementation(() => {});
  restorers.push(
    () => auth.mockRestore(),
    () => save.mockRestore(),
    () => reload.mockRestore(),
  );

  let onboarding: ReturnType<typeof useOnboarding>;
  function Probe() {
    onboarding = useOnboarding();
    return <span data-testid="step">{onboarding.state.step}</span>;
  }
  render(
    <ToastProvider>
      <OnboardingProvider
        brandId="brand-1"
        initialState={{ ...createDefaultOnboardingState(), step: 3 }}
      >
        <Probe />
      </OnboardingProvider>
    </ToastProvider>,
  );
  return { reload, save: (step: number) => onboarding.updateState({ step }) };
}

describe('OnboardingProvider.updateState', () => {
  // After a deploy, a tab opened earlier still posts the old build's Server Action ids and the new
  // build answers 404 (prod, 2026-11-10: Continue on step 3, three times). No retry from that tab
  // can save, so it reloads onto the current build and resumes from the last saved step.
  it('reloads the page when the Server Action belongs to an older deployment', async () => {
    const { reload, save } = setup(
      new UnrecognizedActionError('Server Action "60888d96" was not found on the server.'),
    );

    await act(async () => {
      await expect(save(4)).rejects.toBeInstanceOf(UnrecognizedActionError);
    });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Save failed')).toBeNull();
    expect(screen.getByTestId('step').textContent).toBe('3');
  });

  it('keeps an ordinary failed save on the page with its error toast', async () => {
    const { reload, save } = setup(new Error('offline'));

    await act(async () => {
      await expect(save(4)).rejects.toThrow('offline');
    });

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText('Save failed')).toBeTruthy();
    expect(screen.getByTestId('step').textContent).toBe('3');
  });
});
