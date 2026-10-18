import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render as renderInDom,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import * as http from '@/lib/api/http';
import * as oneShotPost from '@/lib/organic/oneShotPost';
import { publishAccountsKey } from '@/lib/organic/publishTargets';

import type { Trend } from '@/lib/organic/trends';

// Radix Dialog observes DOM mutations; happy-dom exposes MutationObserver on
// window but not on the bun global (same shim as AssignmentsDialog.test.tsx).
global.MutationObserver = window.MutationObserver;

// Leaf network hooks only — never mock the calendar store or shared UI modules
// (bun mock.module is process-wide).
mock.module('./useOneShotEvidence', () => ({
  useOneShotEvidence: () => ({ metrics: [], insights: [], angles: [], loading: false }),
}));
mock.module('@/lib/creative-assets/useStudioLibraryBrowser', () => ({
  useStudioLibraryBrowser: () => ({
    assets: [],
    loading: false,
    hasMore: false,
    loadMore: () => {},
  }),
}));

import { AiPostComposer } from './AiPostComposer';

const candidate = (id: string, platform: string, handle: string) => ({
  id,
  platform,
  handle,
  displayName: null,
  avatarUrl: null,
  needsReauth: false,
  isDefault: true,
});

// The brand's posting accounts, already cached: the composer names them, never their ids.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
queryClient.setQueryData(publishAccountsKey('brand-1'), {
  accounts: [
    candidate('acct-ig', 'instagram', 'acme_a'),
    candidate('acct-tt', 'tiktok', 'acme_tt'),
  ],
});
function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
const render = (ui: ReactElement) => renderInDom(ui, { wrapper: Providers });

const SEED_UUID = '0b6fbf2e-8f6f-4a5f-9d5e-2f4f6f8a1c3d';

const trends: Trend[] = [
  {
    id: SEED_UUID,
    title: 'Durable Trend With Real Id',
    summary: 'Backend-persisted trend.',
    momentum: 'rising',
    platforms: ['instagram'],
    tags: ['ai'],
  },
  {
    id: 'trend-slug-seeded',
    title: 'Seeded Slug Trend',
    summary: 'Cannot anchor a durable job.',
    momentum: 'stable',
    platforms: ['instagram'],
    tags: [],
  },
];

function renderComposer(initialTrendIds?: string[]) {
  return render(
    <AiPostComposer
      open
      onOpenChange={() => {}}
      brandProfileId="brand-1"
      platform="instagram"
      scheduledAt="2026-07-20T12:00:00.000Z"
      trends={trends}
      initialTrendIds={initialTrendIds}
    />,
  );
}

describe('AiPostComposer trend seeding', () => {
  afterEach(() => {
    cleanup();
  });

  it('pre-selects a seeded uuid trend chip', () => {
    renderComposer([SEED_UUID]);
    const chip = screen.getByRole('button', { name: 'Durable Trend With Real Id' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('filters non-uuid seeds and leaves other chips unselected', () => {
    renderComposer(['trend-slug-seeded']);
    const chip = screen.getByRole('button', { name: 'Durable Trend With Real Id' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    // The slug trend is not taggable at all, so it renders no chip to select.
    expect(screen.queryByRole('button', { name: 'Seeded Slug Trend' })).toBeNull();
  });

  it('starts with no selected trends when unseeded', () => {
    renderComposer();
    const chip = screen.getByRole('button', { name: 'Durable Trend With Real Id' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('AiPostComposer format', () => {
  afterEach(() => {
    cleanup();
    mock.restore();
  });

  it('sends the Story the user picked, which the agent would never choose on its own', async () => {
    // A spy, not mock.module: the module mock is process-wide and would leak into
    // oneShotPost's own tests.
    const create = spyOn(oneShotPost, 'createOneShotPost').mockResolvedValue(
      {} as Awaited<ReturnType<typeof oneShotPost.createOneShotPost>>,
    );
    renderComposer();

    fireEvent.change(screen.getByLabelText('Direction'), {
      target: { value: 'Behind the scenes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Story' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create post' }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].format).toBe('story');
  });
});

// C6: the composer posted to one platform, named by nothing but its key.
describe('AiPostComposer platforms', () => {
  afterEach(() => {
    cleanup();
    mock.restore();
  });

  it('names the account each selected platform posts to, by handle', () => {
    renderComposer();
    expect(
      screen.getByRole('button', { name: 'Change platforms — Instagram selected' }),
    ).toBeTruthy();
    const target = document.querySelector('[data-composer-target="instagram"]');
    expect(target?.textContent).toBe('Instagram: @acme_a');
    expect(document.body.textContent).not.toContain('acct-ig');
  });

  it('writes the post for the first platform, then adds the others to its group', async () => {
    const create = spyOn(oneShotPost, 'createOneShotPost').mockResolvedValue({
      status: 'created',
      draftId: 'row-1',
      jobId: null,
      caption: null,
      scheduledAt: '2026-07-20T12:00:00.000Z',
      platform: 'instagram',
      placement: {},
    } as Awaited<ReturnType<typeof oneShotPost.createOneShotPost>>);
    const fanOut = spyOn(http, 'request').mockResolvedValue({
      sourceId: 'row-1',
      sourcePlatform: 'instagram',
      groupId: 'group-1',
      members: [],
      removed: [],
      retained: [],
    });
    renderComposer();

    fireEvent.click(screen.getByRole('button', { name: /^Change platforms/ }));
    fireEvent.click(
      within(screen.getByRole('menu')).getByRole('menuitemcheckbox', { name: 'TikTok' }),
    );
    expect(document.querySelector('[data-composer-target="tiktok"]')?.textContent).toBe(
      'TikTok: @acme_tt',
    );
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'Launch day' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create post' }));

    await waitFor(() => expect(fanOut).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0].platform).toBe('instagram');
    expect(fanOut.mock.calls[0][0]).toMatchObject({
      path: '/api/organic/calendar/drafts/row-1/fan-out',
      method: 'POST',
      // The new TikTok row posts as the account the composer named, not the server's pick.
      body: {
        platforms: ['instagram', 'tiktok'],
        accounts: { instagram: 'acct-ig', tiktok: 'acct-tt' },
      },
    });
  });
});
