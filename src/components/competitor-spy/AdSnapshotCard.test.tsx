import { afterEach, describe, expect, it } from 'bun:test';
import type { TimelineEntry } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { AdSnapshotCard } = await import('./AdSnapshotCard');

const entry = {
  snapshotId: 'ad-1',
  competitorId: 'competitor-1',
  competitorName: 'Acme',
  competitorSlug: 'acme',
  sourceAdId: 'source-ad-1',
  firstSeenAt: '2026-08-01T00:00:00.000Z',
  lastSeenAt: '2026-08-10T00:00:00.000Z',
  status: 'active',
  snapshotUrl: 'https://www.facebook.com/ads/library/?id=1',
  imageUrl: null,
  body: 'Full first line.\nFull second line.',
  cta: 'Shop now',
  platforms: ['instagram'],
  deliveryStart: null,
  deliveryStop: null,
  hasCreativeMedia: true,
} as TimelineEntry;

afterEach(cleanup);

describe('AdSnapshotCard details', () => {
  it('opens a keyboard-accessible full-copy and media viewer', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['competitor-spy', 'creative', entry.snapshotId],
      'https://cdn.example.com/ad.jpg',
    );
    render(
      <QueryClientProvider client={queryClient}>
        <AdSnapshotCard entry={entry} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View full ad details for Acme' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Full ad copy');
    expect(dialog.textContent).toContain('Full first line.\nFull second line.');
    expect(dialog.querySelector('img')?.getAttribute('alt')).toBe('Acme ad creative');
    expect(dialog.querySelector('a')?.getAttribute('href')).toContain('facebook.com/ads/library');
  });
});
