// The in-flight feed is the answer to "I started something and walked away". These tests
// hold the two things that made the old per-page tickers untrustworthy: a row must name the
// WORK (not a job id or a bare platform), and a failure must offer the way out rather than
// just reporting itself.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

mock.module('next/navigation', () => ({ useRouter: () => ({ push: mock() }) }));

import { InFlightSection } from './InFlightSection';
import type { InFlightJob, UseInFlightJobsResult } from './useInFlightJobs';

const organicJob = (over: Partial<InFlightJob> = {}): InFlightJob => ({
  key: 'organic:job-1',
  source: 'organic',
  jobId: 'job-1',
  title: 'Cold-wash care Reel',
  badge: 'instagram',
  meta: 'Mon, Aug 25',
  stateLine: 'Copywriter · Writing copy · 45%',
  tone: 'active',
  active: true,
  diagnostic: null,
  error: null,
  href: null,
  canCancel: true,
  canRetry: false,
  canDownload: false,
  sortAt: 2,
  ...over,
});

const reportJob = (over: Partial<InFlightJob> = {}): InFlightJob => ({
  key: 'jaina:report-1',
  source: 'jaina',
  jobId: 'report-1',
  title: 'Performance report',
  badge: 'Jaina',
  meta: null,
  stateLine: 'Writing KPIs',
  tone: 'active',
  active: true,
  diagnostic: null,
  error: null,
  href: '/scale?tab=jaina',
  canCancel: false,
  canRetry: false,
  canDownload: false,
  sortAt: 1,
  ...over,
});

const feed = (jobs: InFlightJob[], over: Partial<UseInFlightJobsResult> = {}) =>
  ({
    jobs,
    runningCount: jobs.filter((j) => j.active).length,
    windowStats: null,
    cancel: mock(),
    retry: mock(),
    download: mock(),
    ...over,
  }) satisfies UseInFlightJobsResult;

afterEach(() => cleanup());

describe('the in-flight feed', () => {
  it('shows organic generations and Jaina reports in one list', () => {
    render(<InFlightSection feed={feed([organicJob(), reportJob()])} />);
    expect(screen.getByText('Cold-wash care Reel')).toBeTruthy();
    expect(screen.getByText('Performance report')).toBeTruthy();
    expect(screen.getByText('2 running')).toBeTruthy();
  });

  it('names the work and where it has got to, never a job id', () => {
    const { container } = render(<InFlightSection feed={feed([organicJob()])} />);
    expect(screen.getByText('Copywriter · Writing copy · 45%')).toBeTruthy();
    expect(container.textContent).not.toContain('job-1');
  });

  // The old ticker reported failures and stopped there; the retry endpoint existed the
  // whole time with nothing calling it.
  it('offers the retry on a failed row and calls it with that row', () => {
    const retry = mock();
    const failed = organicJob({
      active: false,
      tone: 'error',
      stateLine: 'Failed',
      error: 'image model returned no candidates',
      canCancel: false,
      canRetry: true,
    });
    render(<InFlightSection feed={feed([failed], { retry })} />);

    expect(screen.getByText('image model returned no candidates')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0]?.[0]).toMatchObject({ jobId: 'job-1' });
  });

  it('lets running work be stopped, and does not offer to stop finished work', () => {
    const cancel = mock();
    render(<InFlightSection feed={feed([organicJob()], { cancel })} />);
    fireEvent.click(screen.getByLabelText('Stop Cold-wash care Reel'));
    expect(cancel).toHaveBeenCalledTimes(1);
    cleanup();

    render(<InFlightSection feed={feed([organicJob({ active: false, canCancel: false })])} />);
    expect(screen.queryByLabelText('Stop Cold-wash care Reel')).toBeNull();
  });

  it('opens a finished report rather than navigating to it', () => {
    const download = mock();
    render(
      <InFlightSection
        feed={feed(
          [reportJob({ active: false, tone: 'live', stateLine: 'Ready', canDownload: true })],
          {
            download,
          },
        )}
      />,
    );
    fireEvent.click(screen.getByText('Open'));
    expect(download).toHaveBeenCalledTimes(1);
  });

  // An empty section would draw a header and a rule over nothing, which reads as broken.
  it('renders nothing at all when there is no work', () => {
    const { container } = render(<InFlightSection feed={feed([])} />);
    expect(container.firstChild).toBeNull();
  });
});
