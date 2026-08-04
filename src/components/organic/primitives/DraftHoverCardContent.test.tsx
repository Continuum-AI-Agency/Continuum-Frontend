import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';
import type { OrganicCalendarDraft } from './types';

// happy-dom does not expose SyntaxError on its window object, which crashes
// @testing-library/dom's querySelectorAll internals.
(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

// Real re-signing through the real hook — the media claim below is about whether an
// expired storage URL heals without a page reload, so the sign path stays live and
// only the HTTP boundary is stubbed.
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
    accountContext: { accountIds: {}, accountOptions: {}, brandId: 'brand-1' },
  }),
);

const { DraftHoverCardContent } = await import('./DraftHoverCardContent');
const { resetSignedUrlCache } = await import('@/lib/organic/hyperframeSign');

function baseDraft(overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft {
  return {
    id: 'draft-42',
    title: 'A post',
    summary: '',
    timeLabel: '9:00 AM',
    dateLabel: 'Mon, Jan 1',
    status: 'draft',
    platforms: ['instagram'],
    format: 'Post',
    objective: 'engagement',
    captionPreview: 'The caption the tester could not see',
    tags: [],
    mediaCount: 0,
    ...overrides,
  } as OrganicCalendarDraft;
}

const expiredMediaDraft = () =>
  baseDraft({
    publishingAssets: [
      {
        role: 'primary',
        kind: 'image',
        bucket: 'brand-profile-assets',
        storagePath: 'organic/brand-1/post.png',
        // Expired: this is what a persisted draft looks like an hour after it was made.
        storageUrl: '',
      },
    ],
  } as Partial<OrganicCalendarDraft>);

describe('DraftHoverCardContent', () => {
  beforeEach(() => {
    cleanup();
    requestMock.mockClear();
    resetSignedUrlCache();
  });

  afterAll(() => mock.restore());

  // #233a: the hover card rendered the gradient placeholder for any draft whose
  // signed URL had lapsed, and only a full page reload brought the media back.
  it('renders fresh media for a draft whose signed URL has expired — no reload', async () => {
    render(<DraftHoverCardContent draft={expiredMediaDraft()} />);

    // Before the re-sign resolves the resolver has nothing, so no <img> exists.
    const image = await waitFor(() => {
      const found = screen.getByRole('img');
      if (!found) throw new Error('no media rendered');
      return found;
    });
    expect(image.getAttribute('src')).toBe('https://signed.example.com/fresh.png');
  });

  it('keeps the preview compact and non-interactive', () => {
    render(<DraftHoverCardContent draft={baseDraft()} />);

    const preview = screen.getByTestId('planner-draft-hover-preview');
    expect(preview.className).toContain('w-[208px]');
    expect(preview.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders the caption when there is one', () => {
    render(<DraftHoverCardContent draft={baseDraft()} />);
    expect(screen.getByText('The caption the tester could not see')).toBeTruthy();
  });

  // An empty captionPreview (the persistence layer defaults it to '') used to render
  // an empty <p> — visually identical to a broken card.
  it('falls back to "No caption yet" for an empty caption', () => {
    render(<DraftHoverCardContent draft={baseDraft({ captionPreview: '   ' })} />);
    expect(screen.getByText('No caption yet')).toBeTruthy();
  });
});
