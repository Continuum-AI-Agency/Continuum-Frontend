import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { TIKTOK_DOC_SHAPED_ENVELOPE } from './__fixtures__/tiktokSnapshots';
import { TikTokAdsTabView } from './TikTokAdsTab';
import { buildTikTokOverview, TikTokSnapshotsEnvelopeSchema } from './tiktokAdsOverviewModel';

afterEach(cleanup);

const envelope = TikTokSnapshotsEnvelopeSchema.parse(TIKTOK_DOC_SHAPED_ENVELOPE);
const overview = buildTikTokOverview(envelope);

function text(container: HTMLElement, testId: string): string {
  const node = container.querySelector(`[data-testid="${testId}"]`);
  if (!node) throw new Error(`no ${testId}`);
  return node.textContent ?? '';
}

describe('TikTokAdsTabView — a connected advertiser', () => {
  it('says what TikTok spent and what each result kind cost, from the snapshots read', () => {
    const { container } = render(<TikTokAdsTabView state={{ status: 'ready', overview }} />);
    expect(text(container, 'tiktok-headline')).toBe(
      'TikTok spent 8,542 MXN in 7 days: 101 leads at 64.83 MXN and 30 conversations at 66.50 MXN.',
    );
    expect(
      container.querySelector('[data-testid="tiktok-read"]')?.getAttribute('data-source'),
    ).toBe('tiktok-snapshots');
    expect(text(container, 'tiktok-subline')).toContain('7000…0001');
  });

  it('renders the spend, results and cost tiles', () => {
    const { container } = render(<TikTokAdsTabView state={{ status: 'ready', overview }} />);
    expect(text(container, 'tiktok-tile-spend')).toContain('8,542 MXN');
    expect(text(container, 'tiktok-tile-spend')).toContain('3 campaigns · 5 ad groups');
    expect(text(container, 'tiktok-tile-results')).toContain('Leads');
    expect(text(container, 'tiktok-tile-results')).toContain('101');
    expect(text(container, 'tiktok-tile-results')).toContain('also 30 conversations');
    expect(text(container, 'tiktok-tile-cost')).toContain('Cost per lead');
    expect(text(container, 'tiktok-tile-cost')).toContain('64.83 MXN');
    expect(text(container, 'tiktok-tile-cost')).toContain('66.50 MXN per conversation');
    expect(container.querySelector('[data-testid="tiktok-tile-unclassified"]')).toBeNull();
  });

  it('lists the top ad groups by spend, each with its campaign, results and cost', () => {
    const { getAllByTestId } = render(<TikTokAdsTabView state={{ status: 'ready', overview }} />);
    const rows = getAllByTestId('tiktok-adgroup-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('EF | Smart+ | Leads (ad group)');
    expect(rows[0]?.textContent).toContain('4,655 MXN');
    expect(rows[0]?.textContent).toContain('76 leads');
    expect(rows[1]?.textContent).toContain('30 conversations');
    expect(rows[2]?.textContent).toContain('62.73 MXN each');
  });

  it('carries every figure with its provenance', () => {
    const { getAllByTestId } = render(<TikTokAdsTabView state={{ status: 'ready', overview }} />);
    const keys = getAllByTestId('figure').map((node) => node.getAttribute('data-figure'));
    expect(keys).toContain('tiktok.spend');
    expect(keys).toContain('tiktok.tiles.cost');
    for (const node of getAllByTestId('figure')) {
      expect(node.getAttribute('data-figure-window')).toBe('d7');
    }
  });

  it('prices nothing when TikTok reported no currency', () => {
    const unpriced = { ...overview, currency: null };
    const { container, queryByTestId } = render(
      <TikTokAdsTabView state={{ status: 'ready', overview: unpriced }} />,
    );
    expect(text(container, 'tiktok-headline')).toBe(
      'TikTok reported no currency for this advertiser, so nothing is priced.',
    );
    expect(queryByTestId('tiktok-tiles')).toBeNull();
  });
});

describe('TikTokAdsTabView — no advertiser, or no read', () => {
  it("keeps today's not-connected state, with no numbers", () => {
    const { getByTestId, queryAllByTestId } = render(
      <TikTokAdsTabView state={{ status: 'not-connected' }} />,
    );
    expect(getByTestId('tiktok-empty').textContent).toContain("TikTok Ads isn't connected yet");
    expect(getByTestId('tiktok-empty').textContent).not.toMatch(/\d/);
    expect(queryAllByTestId('figure')).toHaveLength(0);
  });

  it('says it is reading, and names a failed read', () => {
    const loading = render(<TikTokAdsTabView state={{ status: 'loading' }} />);
    expect(loading.getByTestId('tiktok-loading').textContent).toBe('Reading TikTok Ads…');
    loading.unmount();
    const failed = render(
      <TikTokAdsTabView state={{ status: 'error', message: 'No access to this brand' }} />,
    );
    expect(failed.getByTestId('tiktok-error').textContent).toBe('No access to this brand');
  });
});
