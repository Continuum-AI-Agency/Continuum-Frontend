import { afterEach, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useCalendarStore } from '@/lib/organic/store';
import { JobGrid } from './JobGrid';

const initialStoreState = useCalendarStore.getState();

afterEach(() => {
  cleanup();
  useCalendarStore.setState(initialStoreState, true);
});

it('exposes the queued-generation X as an accessible cancel action', () => {
  const onCancelAction = mock((_jobId: string) => {});
  render(
    <JobGrid
      jobs={[{ jobId: 'job-1', brandId: 'brand-1', status: 'queued' }]}
      onCancelAction={onCancelAction}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Cancel queued generation' }));

  expect(onCancelAction).toHaveBeenCalledWith('job-1');
});

it('prefers the fresh draft-derived thumbnail over the stale frame URL in restored sessions', () => {
  // The persisted draft (re-signed on calendar load) carries the FRESH URL; the
  // job frame carries the URL signed when the chat streamed — expired days later.
  useCalendarStore.setState({
    days: [
      {
        id: '2026-07-17',
        label: 'Fri',
        slots: [
          {
            id: 'draft-1',
            backendDraftId: 'draft-1',
            mediaSuggestion: {
              storyboard: [{ storageUrl: 'https://storage/fresh-signed.jpeg' }],
            },
          },
        ],
      },
    ],
  } as never);

  const { container } = render(
    <JobGrid
      jobs={[
        {
          jobId: 'job-2',
          brandId: 'brand-1',
          status: 'completed',
          draftId: 'draft-1',
          previewImages: ['https://storage/stale-frame-signed.jpeg'],
        } as never,
      ]}
    />,
  );

  const img = container.querySelector('img');
  expect(img?.getAttribute('src')).toBe('https://storage/fresh-signed.jpeg');
});
