import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const syncMock = mock(() => {});

mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
}));

const emptyQuery = { isLoading: false, isError: false, error: null };

mock.module('@/lib/api/competitorSpy', () => ({
  useCompetitors: () => ({ data: [] }),
  useAdCounts: () => ({ data: {} }),
  useCompetitorSync: () => ({ mutate: syncMock, isPending: false }),
  useInstagramPosts: () => ({ ...emptyQuery, data: [] }),
  useInstagramCompetitorSearch: () => ({ ...emptyQuery, data: undefined }),
  useAdTimeline: () => ({ ...emptyQuery, data: [] }),
  useSavedInspirationPosts: () => ({ ...emptyQuery, data: [] }),
  useSaveInspirationUrl: () => ({ mutate: () => {}, isPending: false, isError: false }),
}));

import { InspirationBrowser } from './InspirationBrowser';

afterEach(() => {
  cleanup();
  syncMock.mockClear();
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
});
