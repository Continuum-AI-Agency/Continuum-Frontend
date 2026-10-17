import { afterEach, expect, test } from 'bun:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import { BackgroundJobsProvider, useBackgroundJobs } from './BackgroundJobsProvider';

afterEach(cleanup);

test('a superseded job cannot replace a newer completed result', async () => {
  let run: ReturnType<typeof useBackgroundJobs>['start'];
  function Consumer() {
    const jobs = useBackgroundJobs();
    run = jobs.start;
    return <output>{String(jobs.jobs.agentPreview.data ?? '')}</output>;
  }
  render(
    <BackgroundJobsProvider>
      <Consumer />
    </BackgroundJobsProvider>,
  );
  let finishOld: (value: string) => void = () => {};
  const old = new Promise<string>((resolve) => {
    finishOld = resolve;
  });
  let first: Promise<string | null>;
  await act(async () => {
    first = run('agentPreview', () => old);
  });
  await act(async () => {
    await run('agentPreview', async () => 'new result');
  });
  await act(async () => {
    finishOld('old result');
    await first;
  });
  expect(screen.getByRole('status').textContent).toBe('new result');
});
