import { afterEach, expect, spyOn, test } from 'bun:test';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as actions from '@/app/onboarding/actions';
import { OnboardingProvider } from '@/components/onboarding/providers/OnboardingContext';
import { ToastProvider } from '@/components/ui/ToastProvider';
import * as logos from '@/lib/onboarding/internalizeLogo';
import { createDefaultOnboardingState, mergeOnboardingState } from '@/lib/onboarding/state';
import * as client from '@/lib/supabase/client';
import { BackgroundJobsProvider, useBackgroundJobs } from './BackgroundJobsProvider';
import { JobPersistor } from './JobPersistor';

const restorers: Array<() => void> = [];
afterEach(() => {
  cleanup();
  for (const restore of restorers.splice(0)) restore();
});

function setup() {
  const auth = spyOn(client, 'createSupabaseBrowserClient').mockReturnValue({
    auth: { getSession: async () => ({ data: { session: null } }) },
  } as unknown as ReturnType<typeof client.createSupabaseBrowserClient>);
  const logo = spyOn(logos, 'internalizeLogo').mockResolvedValue(null);
  const save = spyOn(actions, 'mutateOnboardingStateAction').mockImplementation(
    async (_brandId, patch) => mergeOnboardingState(createDefaultOnboardingState(), patch),
  );
  restorers.push(
    () => auth.mockRestore(),
    () => logo.mockRestore(),
    () => save.mockRestore(),
  );
  let jobs: ReturnType<typeof useBackgroundJobs>;
  function Probe() {
    jobs = useBackgroundJobs();
    return <JobPersistor />;
  }
  render(
    <ToastProvider>
      <OnboardingProvider brandId="brand-1" initialState={createDefaultOnboardingState()}>
        <BackgroundJobsProvider>
          <Probe />
        </BackgroundJobsProvider>
      </OnboardingProvider>
    </ToastProvider>,
  );
  return { save, logo, jobs: () => jobs };
}

test('failed persistence waits before retrying', async () => {
  const { save, jobs } = setup();
  save.mockRejectedValue(new Error('offline'));
  await act(async () => {
    await jobs().start('scrape', async () => ({
      url: 'https://acme.com',
      title: 'Acme',
      colors: [],
    }));
  });
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(save).toHaveBeenCalledTimes(1);
});

test('an old logo download cannot replace the current source logo', async () => {
  const { save, logo, jobs } = setup();
  let finish: (path: string) => void = () => {};
  logo.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    await jobs().start('scrape', async () => ({
      url: 'https://old.com',
      title: 'Old',
      logoUrl: 'https://old.com/logo.png',
      colors: [],
    }));
  });
  await waitFor(() => expect(logo).toHaveBeenCalledTimes(1));
  await act(async () => {
    await jobs().start('scrape', async () => ({
      url: 'https://new.com',
      title: 'New',
      logoUrl: 'https://new.com/logo.png',
      colors: [],
    }));
  });
  await act(async () => {
    finish('old/stored-logo.png');
  });
  expect(save.mock.calls.some(([, patch]) => patch.brand?.logoPath === 'old/stored-logo.png')).toBe(
    false,
  );
});
