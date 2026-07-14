import { afterEach, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { JobGrid } from './JobGrid';

afterEach(cleanup);

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
