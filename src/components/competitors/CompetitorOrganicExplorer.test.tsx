import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

let feedData: { items: unknown[]; syncFaults: unknown[] } = { items: [], syncFaults: [] };

const postsMock = mock((_params: unknown) => ({
  isLoading: false,
  isError: false,
  error: null,
  data: feedData,
}));

mock.module('@/lib/api/competitorSpy', () => ({
  useInstagramCompetitorSearch: () => ({ isLoading: false, isError: false, error: null, data: undefined }),
  useInstagramPosts: postsMock,
}));

import { CompetitorOrganicExplorer } from './CompetitorOrganicExplorer';

afterEach(() => {
  cleanup();
  feedData = { items: [], syncFaults: [] };
});

describe('CompetitorOrganicExplorer sync-fault banner', () => {
  it('banners faulted handles with the connection guidance instead of silent dead tiles', () => {
    feedData = {
      items: [],
      syncFaults: [
        {
          competitorId: '22222222-2222-4222-8222-222222222222',
          competitorName: "Domino's",
          instagramUsername: 'dominos',
          kind: 'permission_denied',
        },
      ],
    };
    const { getByText } = render(<CompetitorOrganicExplorer brandId="b1" />);
    expect(getByText(/Live previews for @dominos are unavailable/)).toBeDefined();
    expect(getByText(/not permitted for your connected account/)).toBeDefined();
  });

  it('stays silent when the feed has no sync faults', () => {
    const { queryByText } = render(<CompetitorOrganicExplorer brandId="b1" />);
    expect(queryByText(/Live previews for/)).toBeNull();
  });

  it('hides the fault banner while an ad-hoc handle search is active', () => {
    feedData = {
      items: [],
      syncFaults: [
        {
          competitorId: '22222222-2222-4222-8222-222222222222',
          competitorName: "Domino's",
          instagramUsername: 'dominos',
          kind: 'permission_denied',
        },
      ],
    };
    const { container, getByLabelText, queryByText } = render(
      <CompetitorOrganicExplorer brandId="b1" />,
    );
    fireEvent.change(getByLabelText('Search competitors'), { target: { value: 'nike' } });
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);
    expect(queryByText(/Live previews for/)).toBeNull();
    expect(queryByText(/Showing results for/)).not.toBeNull();
  });
});
