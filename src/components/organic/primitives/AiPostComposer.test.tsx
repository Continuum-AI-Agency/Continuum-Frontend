import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

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
