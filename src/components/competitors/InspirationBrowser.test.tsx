import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const syncMock = mock(() => {});
const postsMock = mock((_params: { sort?: string; platform?: string }) => ({
  isLoading: false,
  isError: false,
  error: null,
  data: [],
}));

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

const emptyQuery = { isLoading: false, isError: false, error: null };

mock.module('@/lib/api/competitorSpy', () => ({
  useCompetitors: () => ({ data: [] }),
  useAdCounts: () => ({ data: {} }),
  useCompetitorSync: () => ({ mutate: syncMock, isPending: false }),
  useInstagramPosts: postsMock,
  useInstagramCompetitorSearch: () => ({ ...emptyQuery, data: undefined }),
  useAdTimeline: () => ({ ...emptyQuery, data: [] }),
  useSavedInspirationPosts: () => ({ ...emptyQuery, data: [] }),
  useSaveInspirationUrl: () => ({ mutate: () => {}, isPending: false, isError: false }),
}));

import { InspirationBrowser } from './InspirationBrowser';

afterEach(() => {
  cleanup();
  syncMock.mockClear();
  postsMock.mockClear();
});

describe('InspirationBrowser', () => {
  it('renders the Organic | Paid | All | Saved source toggle and a Sync button', () => {
    const { getByRole, getByText } = render(
      <InspirationBrowser brandId="b1" defaultSource="all" showRail showSync />,
    );
    expect(getByRole('button', { name: 'Organic' })).toBeDefined();
    expect(getByRole('button', { name: 'Paid' })).toBeDefined();
    expect(getByRole('button', { name: 'All' })).toBeDefined();
    expect(getByRole('button', { name: 'Saved' })).toBeDefined();
    expect(getByText('Sync')).toBeDefined();
  });

  it('reveals the paid status filter only after switching to Paid', () => {
    const { getByRole, queryByRole } = render(
      <InspirationBrowser brandId="b1" defaultSource="all" showSync />,
    );
    expect(queryByRole('button', { name: 'Active' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Paid' }));
    expect(getByRole('button', { name: 'Active' })).toBeDefined();
    expect(getByRole('button', { name: 'Paused' })).toBeDefined();
  });

  it('triggers a sync when Sync is clicked', () => {
    const { getByText } = render(<InspirationBrowser brandId="b1" showSync />);
    fireEvent.click(getByText('Sync'));
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it('shows the paste-a-URL form and the saved empty state on Saved', () => {
    const { getByRole, getByLabelText, getByText } = render(
      <InspirationBrowser brandId="b1" defaultSource="organic" />,
    );
    fireEvent.click(getByRole('button', { name: 'Saved' }));
    expect(getByLabelText('Instagram post URL')).toBeDefined();
    expect(getByText(/Nothing saved yet/)).toBeDefined();
  });

  it('switches Organic to a YouTube grid with raw-metric sorts only', () => {
    const { getByRole, queryByRole, getByText, queryByLabelText } = render(
      <InspirationBrowser brandId="b1" defaultSource="organic" />,
    );
    expect(getByRole('button', { name: 'Outlier' })).toBeDefined();
    expect(queryByLabelText('Search competitors')).not.toBeNull();
    expect(postsMock.mock.calls.at(-1)?.[0].platform).toBe('instagram');

    fireEvent.click(getByRole('button', { name: 'Outlier' }));
    fireEvent.click(getByRole('button', { name: 'YouTube' }));

    expect(getByRole('button', { name: 'Newest' })).toBeDefined();
    expect(getByRole('button', { name: 'Most viewed' })).toBeDefined();
    expect(queryByRole('button', { name: 'Outlier' })).toBeNull();
    expect(queryByRole('button', { name: 'For your brand' })).toBeNull();
    expect(queryByLabelText('Search competitors')).toBeNull();
    // Outlier has no YouTube meaning, so the grid asks for newest instead of a 400.
    expect(postsMock.mock.calls.at(-1)?.[0]).toMatchObject({ platform: 'youtube', sort: 'recent' });
    expect(getByText(/add a YouTube channel to a competitor/)).toBeDefined();

    fireEvent.click(getByRole('button', { name: 'Most viewed' }));
    expect(postsMock.mock.calls.at(-1)?.[0]).toMatchObject({ platform: 'youtube', sort: 'views' });
  });
});
