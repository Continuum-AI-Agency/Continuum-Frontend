import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CompetitorPostView } from './competitorPostView';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

interface RequestArgs {
  path: string;
  method?: string;
  body?: unknown;
}

// Post ids the fake backend reports as already saved. Mutated per-test to model a
// brand that has (or hasn't) saved this post before the component mounts.
let savedIds: string[] = [];
const saveCalls: RequestArgs[] = [];

const requestMock = mock((args: RequestArgs) => {
  if (args.path.includes('/inspiration/saved-ids')) {
    return Promise.resolve({ postIds: savedIds });
  }
  if (args.path.includes('/inspiration/save-to-library')) {
    saveCalls.push(args);
    const postId = (args.body as { post: { id: string } }).post.id;
    if (!savedIds.includes(postId)) savedIds = [...savedIds, postId];
    return Promise.resolve({ assetId: 'a1', alreadyExisted: false });
  }
  return Promise.reject(new Error(`unexpected path ${args.path}`));
});
mock.module('@/lib/api/http', () => ({ request: (args: RequestArgs) => requestMock(args) }));

const { SaveToLibraryButton } = await import('./SaveToLibraryButton');

const view: CompetitorPostView = {
  competitorId: 'c1',
  competitorName: 'Nike',
  instagramUsername: 'nike',
  post: {
    id: 'p1',
    shortcode: 'sc1',
    permalink: 'https://instagram.com/p/sc1',
    kind: 'reel',
    coverUrl: 'https://cdn/x.jpg',
    mediaCount: 1,
    items: [],
  },
};

function renderButton(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  savedIds = [];
  saveCalls.length = 0;
  requestMock.mockClear();
});

describe('SaveToLibraryButton', () => {
  it('renders a Library save affordance', () => {
    const { getByRole } = renderButton(<SaveToLibraryButton brandId="b1" view={view} />);
    expect(getByRole('button', { name: 'Save to Library' })).toBeDefined();
  });

  it('saves the post to the library with the full payload and shows Saved', async () => {
    const { getByRole, findByText } = renderButton(
      <SaveToLibraryButton brandId="b1" view={view} />,
    );
    fireEvent.click(getByRole('button', { name: 'Save to Library' }));

    await waitFor(() => expect(saveCalls).toHaveLength(1));
    expect(saveCalls[0].body).toEqual({
      brandId: 'b1',
      competitorId: 'c1',
      competitorName: 'Nike',
      instagramUsername: 'nike',
      post: view.post,
    });
    expect(await findByText('Saved')).toBeDefined();
  });

  it('passes null competitorId for ad-hoc search posts (no tracked competitor)', async () => {
    const searchView: CompetitorPostView = { ...view, competitorId: undefined };
    const { getByRole } = renderButton(<SaveToLibraryButton brandId="b1" view={searchView} />);
    fireEvent.click(getByRole('button', { name: 'Save to Library' }));
    await waitFor(() => expect(saveCalls).toHaveLength(1));
    expect(saveCalls[0].body).toMatchObject({ competitorId: null });
  });

  it('shows Saved on mount when the post is already in the library', async () => {
    savedIds = ['p1'];
    const { findByText, getByRole } = renderButton(
      <SaveToLibraryButton brandId="b1" view={view} />,
    );
    expect(await findByText('Saved')).toBeDefined();
    fireEvent.click(getByRole('button', { name: 'Save to Library' }));
    // Already saved → clicking must not re-issue a save.
    expect(saveCalls).toHaveLength(0);
  });
});
