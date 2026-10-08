import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import { PostPicker } from './PostPicker';

afterEach(cleanup);

function post(overrides: Partial<OrganicPost> = {}): OrganicPost {
  return {
    id: 'post-1',
    caption: 'Our new drop is live',
    timestamp: '2026-09-20T12:00:00.000Z',
    mediaProductType: 'FEED',
    thumbnailUrl: 'https://cdn.test/thumb.jpg',
    ...overrides,
  };
}

function renderPicker(props: Partial<React.ComponentProps<typeof PostPicker>> = {}) {
  const onChange = mock(() => {});
  render(
    <PostPicker
      posts={[post()]}
      selectedIds={[]}
      isLoading={false}
      error={false}
      onChange={onChange}
      {...props}
    />,
  );
  return onChange;
}

describe('what a tile shows', () => {
  // The id is the machine's handle on a post, not a person's. Showing it was the
  // whole problem with the field this replaces.
  it('never shows the platform id', () => {
    renderPicker({ posts: [post({ id: '17912345678901234' })] });
    expect(screen.queryByText(/17912345678901234/)).toBeNull();
  });

  it('shows the caption and the day', () => {
    renderPicker({ posts: [post({ caption: 'Our new drop is live' })] });
    expect(screen.getByText('Our new drop is live')).toBeDefined();
    expect(screen.getByText(/20 Sep|Sep 20/)).toBeDefined();
  });

  it('labels a reel as a reel', () => {
    renderPicker({ posts: [post({ mediaProductType: 'REELS' })] });
    expect(screen.getByText('Reel')).toBeDefined();
  });

  it('says so when a post has no caption instead of leaving a blank', () => {
    renderPicker({ posts: [post({ caption: '' })] });
    expect(screen.getByText('No caption')).toBeDefined();
  });

  it('renders a post with no thumbnail without breaking', () => {
    renderPicker({ posts: [post({ thumbnailUrl: null, mediaUrl: null })] });
    expect(screen.getByRole('button', { pressed: false })).toBeDefined();
  });
});

describe('choosing', () => {
  it('adds a post that was not chosen', () => {
    const onChange = renderPicker({ posts: [post({ id: 'a' })], selectedIds: [] });
    fireEvent.click(screen.getByRole('button', { pressed: false }));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('removes a post that was already chosen', () => {
    const onChange = renderPicker({ posts: [post({ id: 'a' })], selectedIds: ['a'] });
    fireEvent.click(screen.getByRole('button', { pressed: true }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('keeps the other choices when one is toggled', () => {
    const onChange = renderPicker({
      posts: [post({ id: 'a' }), post({ id: 'b' })],
      selectedIds: ['b'],
    });
    fireEvent.click(screen.getAllByRole('button', { pressed: false })[0]);
    expect(onChange).toHaveBeenCalledWith(['b', 'a']);
  });

  it('counts what is chosen against what is offered', () => {
    renderPicker({ posts: [post({ id: 'a' }), post({ id: 'b' })], selectedIds: ['a'] });
    expect(screen.getByText('1 chosen of 2')).toBeDefined();
  });

  it('clears every choice at once', () => {
    const onChange = renderPicker({ posts: [post({ id: 'a' })], selectedIds: ['a'] });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('a chosen post the list cannot show', () => {
  // Dropping ids the picker cannot display would silently change a rule just by
  // opening it — the rule would quietly stop watching a post nobody unticked.
  it('says how many are older than the list, and keeps them', () => {
    renderPicker({ posts: [post({ id: 'a' })], selectedIds: ['a', 'old-1', 'old-2'] });
    expect(screen.getByText(/2 chosen posts outside this list/i)).toBeDefined();
  });

  it('uses the singular for one', () => {
    renderPicker({ posts: [post({ id: 'a' })], selectedIds: ['a', 'old-1'] });
    expect(screen.getByText(/1 chosen post outside this list/i)).toBeDefined();
  });

  it('drops only the unshowable ones when asked', () => {
    const onChange = renderPicker({ posts: [post({ id: 'a' })], selectedIds: ['a', 'old-1'] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenCalledWith(['a']);
  });

  it('says nothing when every choice is on screen', () => {
    renderPicker({ posts: [post({ id: 'a' })], selectedIds: ['a'] });
    expect(screen.queryByText(/outside this list/i)).toBeNull();
  });
});

describe('the states before a grid', () => {
  it('shows placeholders while loading', () => {
    renderPicker({ isLoading: true });
    expect(screen.queryByRole('button', { pressed: false })).toBeNull();
  });

  // The rule must not look emptied because a fetch failed.
  it('says the rule keeps its posts when the fetch failed', () => {
    renderPicker({ error: true, selectedIds: ['a'] });
    expect(screen.getByText(/keeps whichever posts it already had/i)).toBeDefined();
  });

  it('says the account has no posts rather than showing an empty grid', () => {
    renderPicker({ posts: [] });
    expect(screen.getByText(/no published posts found/i)).toBeDefined();
  });
});

describe('loading more history', () => {
  // The route returns at most 25 posts per request, so a client who posts daily
  // could otherwise never reach anything older than a couple of weeks.
  it('offers to load older posts when there are more windows', () => {
    renderPicker({ hasMore: true, onLoadMore: () => {} });
    expect(screen.getByRole('button', { name: /load older posts/i })).toBeDefined();
  });

  it('offers nothing when the history is exhausted', () => {
    renderPicker({ hasMore: false, onLoadMore: () => {} });
    expect(screen.queryByRole('button', { name: /load older posts/i })).toBeNull();
  });

  it('asks for the next window when clicked', () => {
    const onLoadMore = mock(() => {});
    render(
      <PostPicker
        posts={[post()]}
        selectedIds={[]}
        isLoading={false}
        error={false}
        hasMore
        onLoadMore={onLoadMore}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /load older posts/i }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('cannot be asked twice while a window is in flight', () => {
    renderPicker({ hasMore: true, isLoadingMore: true, onLoadMore: () => {} });
    const button = screen.getByRole('button', { name: /loading/i });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  // The grid is already drawn, so a second window must not blank it.
  it('keeps the posts on screen while more are loading', () => {
    renderPicker({
      posts: [post({ caption: 'Already here' })],
      hasMore: true,
      isLoadingMore: true,
      onLoadMore: () => {},
    });
    expect(screen.getByText('Already here')).toBeDefined();
  });
});

describe('an empty window', () => {
  // Short-circuiting to "no posts" hid the only way out of a window that simply
  // held nothing — which is what a post from nine days ago produced.
  it('still offers to look further back', () => {
    renderPicker({ posts: [], hasMore: true, onLoadMore: () => {} });
    expect(screen.getByRole('button', { name: /look further back/i })).toBeDefined();
  });

  it('says the stretch is empty rather than the account is', () => {
    renderPicker({ posts: [], hasMore: true, onLoadMore: () => {} });
    expect(screen.getByText(/no posts in this stretch/i)).toBeDefined();
    expect(screen.queryByText(/no published posts found/i)).toBeNull();
  });

  it('says the account has none only once the history is exhausted', () => {
    renderPicker({ posts: [], hasMore: false });
    expect(screen.getByText(/no published posts found/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /look further back/i })).toBeNull();
  });
});

describe('no account at all', () => {
  // "No account" and "no posts" produced the same sentence, which sent us looking
  // for missing posts twice before anyone suspected the account.
  it('says the account is missing, not that it has no posts', () => {
    renderPicker({ hasAccount: false, posts: [] });
    expect(screen.getByText(/no instagram account is connected/i)).toBeDefined();
    expect(screen.queryByText(/no published posts found/i)).toBeNull();
  });

  it('says it before anything else, even while a fetch would be loading', () => {
    renderPicker({ hasAccount: false, posts: [], isLoading: true });
    expect(screen.getByText(/no instagram account is connected/i)).toBeDefined();
  });
});

describe('refreshing past the cache', () => {
  // The analytics read is cached upstream, so a window read while a token was
  // briefly dead stays empty until someone asks again.
  it('offers a refresh from the empty state', () => {
    renderPicker({ posts: [], hasMore: false, onRefresh: () => {} });
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDefined();
  });

  it('offers a refresh above the grid too', () => {
    renderPicker({ posts: [post()], onRefresh: () => {} });
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDefined();
  });

  it('asks for the re-read when clicked', () => {
    const onRefresh = mock(() => {});
    render(
      <PostPicker
        posts={[post()]}
        selectedIds={[]}
        isLoading={false}
        error={false}
        onRefresh={onRefresh}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('cannot be asked twice while re-reading', () => {
    renderPicker({ posts: [post()], isRefreshing: true, onRefresh: () => {} });
    expect(screen.getByRole('button', { name: /reading/i }).hasAttribute('disabled')).toBe(true);
  });

  it('shows nothing to press when no refresh is wired', () => {
    renderPicker({ posts: [post()] });
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();
  });
});
