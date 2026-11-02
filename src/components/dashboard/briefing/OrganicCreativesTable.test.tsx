import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

// APP-SWEEP-organic-top-creatives-skeleton-forever: a brand with no Instagram or YouTube
// account left the Home's organic "Top creatives" table on its loading skeleton for good
// (24 loading markers after 45 s on Easy Fit), because "no account" kept the posts state idle
// and idle rendered as loading. With no account there is nothing to load: the table says
// which connection it needs.
const fetchOrganicAnalytics = mock(async () => ({ posts: [] }));
mock.module('@/lib/api/organicAnalytics.client', () => ({ fetchOrganicAnalytics }));
mock.module('@/hooks/useOrganicInsights', () => ({
  useOrganicInsights: () => ({ awareness: null }),
}));
mock.module('@/hooks/useOrganicPostDetail', () => ({
  useOrganicPostDetail: () => ({
    requestPostDetail: () => undefined,
    loadingPostId: null,
    postDetailsById: {},
  }),
}));

const { OrganicCreativesTable } = await import('./OrganicCreativesTable');

afterEach(() => {
  cleanup();
  fetchOrganicAnalytics.mockClear();
});

describe('OrganicCreativesTable', () => {
  it('names the missing connection instead of loading forever when the brand has no account', async () => {
    const { findByText } = render(<OrganicCreativesTable accounts={[]} brandId="brand-1" />);

    await findByText('Connect an Instagram or YouTube account to see your top creatives.');
    expect(fetchOrganicAnalytics).not.toHaveBeenCalled();
  });
});
