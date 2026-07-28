import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// The HTTP client is the seam under test: the whole point of moving re-signing into a
// shared hook is that N surfaces rendering the same durable pair cost ONE sign POST.
// Mocking `hyperframeSign` instead would mock away the cache being measured.
const requestMock = mock((_args: { path: string; method?: string; body?: unknown }) =>
  Promise.resolve<unknown>({
    signedUrl: 'https://signed.example.com/fresh.png',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }),
);

mock.module('@/lib/api/http', () => ({
  request: requestMock,
  http: { request: requestMock },
}));

mock.module('@/lib/organic/store', () =>
  createCalendarStoreStub({
    accountContext: { accountIds: {}, accountOptions: {}, brandId: 'brand-from-store' },
  }),
);

const { useDraftWithFreshMedia } = await import('./useDraftWithFreshMedia');
const { resetSignedUrlCache } = await import('@/lib/organic/hyperframeSign');

const DURABLE_PATH = 'organic/brand/post-1.png';

function draftWithDurablePair(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-1',
    title: 'A post',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jan 1',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'engagement',
    captionPreview: 'caption',
    tags: [],
    mediaCount: 1,
    publishingAssets: [
      {
        role: 'primary',
        kind: 'image',
        bucket: 'brand-profile-assets',
        storagePath: DURABLE_PATH,
        // The decayed state a persisted draft is read back in: the upload-time
        // signed URL has lapsed, so the surface resolves to nothing until re-signed.
        storageUrl: '',
      },
    ],
    ...overrides,
  } as OrganicCalendarDraft;
}

function Consumer({
  draft,
  label,
  brandProfileId,
}: {
  draft: OrganicCalendarDraft;
  label: string;
  brandProfileId?: string;
}) {
  const fresh = useDraftWithFreshMedia(draft, brandProfileId);
  return <span data-testid={label}>{fresh.publishingAssets?.[0]?.storageUrl ?? ''}</span>;
}

const signPosts = () =>
  requestMock.mock.calls.filter(([args]) => args.path === '/api/organic/agent/hyperframes/sign')
    .length;

describe('useDraftWithFreshMedia', () => {
  beforeEach(() => {
    cleanup();
    requestMock.mockClear();
    resetSignedUrlCache();
  });

  afterAll(() => mock.restore());

  it('re-signs a decayed durable pair and hands the surface a fresh URL', async () => {
    render(<Consumer draft={draftWithDurablePair()} label="one" brandProfileId="brand-1" />);

    await waitFor(() =>
      expect(screen.getByTestId('one').textContent).toBe('https://signed.example.com/fresh.png'),
    );
    expect(requestMock).toHaveBeenCalledWith({
      path: '/api/organic/agent/hyperframes/sign',
      method: 'POST',
      body: { brandId: 'brand-1', bucket: 'brand-profile-assets', path: DURABLE_PATH },
    });
  });

  // The reason the seam is a hook rather than an async resolver: the month chip, the
  // list row and the preview panel all render the same draft, and each mounts its own
  // copy of this hook. Without the sign cache that is one POST per surface.
  it('issues exactly ONE sign POST for two consumers of the same durable pair', async () => {
    const draft = draftWithDurablePair();
    render(
      <>
        <Consumer draft={draft} label="a" brandProfileId="brand-1" />
        <Consumer draft={draft} label="b" brandProfileId="brand-1" />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('a').textContent).toBe('https://signed.example.com/fresh.png'),
    );
    await waitFor(() =>
      expect(screen.getByTestId('b').textContent).toBe('https://signed.example.com/fresh.png'),
    );

    expect(signPosts()).toBe(1);
  });

  it('serves a later consumer from the cache without a second POST', async () => {
    const draft = draftWithDurablePair();
    render(<Consumer draft={draft} label="first" brandProfileId="brand-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('first').textContent).toBe('https://signed.example.com/fresh.png'),
    );
    expect(signPosts()).toBe(1);

    cleanup();
    render(<Consumer draft={draft} label="second" brandProfileId="brand-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('second').textContent).toBe('https://signed.example.com/fresh.png'),
    );
    expect(signPosts()).toBe(1);
  });

  // Surfaces deep in the calendar tree (a month chip, a list row) never receive the
  // brand id as a prop — that is exactly why they used to render stale media.
  it('falls back to the planner account context when no brandProfileId is passed', async () => {
    render(<Consumer draft={draftWithDurablePair()} label="fallback" />);

    await waitFor(() =>
      expect(screen.getByTestId('fallback').textContent).toBe(
        'https://signed.example.com/fresh.png',
      ),
    );
    expect(requestMock).toHaveBeenCalledWith({
      path: '/api/organic/agent/hyperframes/sign',
      method: 'POST',
      body: {
        brandId: 'brand-from-store',
        bucket: 'brand-profile-assets',
        path: DURABLE_PATH,
      },
    });
  });

  it('signs nothing for a draft with no durable pair', async () => {
    render(
      <Consumer
        draft={draftWithDurablePair({ publishingAssets: undefined })}
        label="empty"
        brandProfileId="brand-1"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('empty')).toBeTruthy());
    expect(signPosts()).toBe(0);
  });
});
