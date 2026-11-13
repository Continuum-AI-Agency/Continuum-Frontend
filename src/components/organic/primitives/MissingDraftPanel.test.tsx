import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { OrganicJobRetryResponse } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MissingDraftPanel } from './MissingDraftPanel';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const DRAFT_ID = '309195da-e102-492e-9fe5-0f36b7a781d3';
const NEW_DRAFT_ID = '33333333-3333-4333-8333-333333333333';

function renderPanel(recreate: (input: { draftId: string; brandId: string }) => Promise<unknown>) {
  const handlers = {
    onRecreated: mock((_id: string) => undefined),
    onDraftExists: mock(() => undefined),
    onCreatePost: mock(() => undefined),
    onClose: mock(() => undefined),
  };
  render(
    <MissingDraftPanel
      draftId={DRAFT_ID}
      brandId="brand-1"
      recreate={
        recreate as (input: {
          draftId: string;
          brandId: string;
        }) => Promise<OrganicJobRetryResponse>
      }
      {...handlers}
    />,
  );
  return handlers;
}

const recreateButton = () => screen.getByRole('button', { name: /Recreate draft/ });

describe('MissingDraftPanel', () => {
  afterEach(() => cleanup());

  it('says the post failed to save and offers one-click Recreate, never a blank panel', () => {
    renderPanel(mock(async () => ({})));
    expect(screen.getByText('This post failed to save')).toBeTruthy();
    expect(recreateButton()).toBeTruthy();
    expect(screen.getByText('Draft 309195da').getAttribute('title')).toBe(DRAFT_ID);
  });

  it('recreates into a real draft and hands its id back to select', async () => {
    const recreate = mock(async () => ({
      job: { jobId: 'job-1', status: 'queued', draftId: NEW_DRAFT_ID, error: null },
    }));
    const { onRecreated } = renderPanel(recreate);
    fireEvent.click(recreateButton());
    await waitFor(() => expect(onRecreated).toHaveBeenCalledWith(NEW_DRAFT_ID));
    expect(recreate).toHaveBeenCalledWith({ draftId: DRAFT_ID, brandId: 'brand-1' });
  });

  it('offers a new post when nothing generated the lost one', async () => {
    const { onCreatePost } = renderPanel(
      mock(async () => {
        throw new Error('no_generation_job');
      }),
    );
    fireEvent.click(recreateButton());
    const create = await screen.findByRole('button', { name: /Create a post/ });
    expect(screen.getByText(/Nothing generated this post/)).toBeTruthy();
    fireEvent.click(create);
    expect(onCreatePost).toHaveBeenCalledTimes(1);
  });

  it('reloads the Calendar when the row turns out to exist', async () => {
    const { onDraftExists } = renderPanel(
      mock(async () => {
        throw new Error('draft_exists');
      }),
    );
    fireEvent.click(recreateButton());
    await waitFor(() => expect(onDraftExists).toHaveBeenCalledTimes(1));
  });

  it('says it is still generating instead of failing when the job is mid-run', async () => {
    renderPanel(
      mock(async () => {
        throw new Error('not_retryable');
      }),
    );
    fireEvent.click(recreateButton());
    expect(await screen.findByText(/still being generated/)).toBeTruthy();
    expect((recreateButton() as HTMLButtonElement).disabled).toBe(true);
  });
});
