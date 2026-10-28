import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen, within } from '@testing-library/react';
import {
  FIXTURE_NOW,
  portfolioMetricsFixture,
} from '../attribution/__fixtures__/portfolioMetricsFixture';
import { ByPlatformView } from './ByPlatform';
import { fetchPortfolioMetrics } from './usePortfolioMetrics';

afterEach(cleanup);

function rowFor(platform: string): HTMLElement {
  const row = screen
    .getAllByTestId('by-platform-row')
    .find((element) => element.dataset.platform === platform);
  if (!row) throw new Error(`no row for ${platform}`);
  return row;
}

describe('ByPlatformView', () => {
  it('renders one text row per platform with cost, results and share, spend and share, state', () => {
    render(
      <ByPlatformView
        now={FIXTURE_NOW}
        state={{ status: 'ready', metrics: portfolioMetricsFixture() }}
      />,
    );
    expect(screen.getAllByTestId('by-platform-row')).toHaveLength(3);
    // The one picture is the mixed portfolio's spend-share bar; the rows are its data table.
    expect(screen.getAllByRole('img')).toEqual([screen.getByTestId('mixed-spend-bar')]);
    const google = rowFor('google_ads');
    expect(within(google).getByTestId('platform-chip').textContent).toContain('Google');
    expect(within(google).getByTestId('by-platform-cost').textContent).toBe('$34.42 MXN per lead');
    expect(within(google).getByTestId('by-platform-results').textContent).toBe('118 · 55%');
    expect(within(google).getByTestId('by-platform-spend').textContent).toBe('$4,062 MXN · 46%');
    expect(within(google).getByTestId('by-platform-state').textContent).toBe('on target');
    expect(within(rowFor('tiktok_ads')).getByTestId('by-platform-state').textContent).toBe(
      '106% over target',
    );
    expect(within(rowFor('meta')).getByTestId('by-platform-state').dataset.state).toBe('over');
  });

  it('names the platform source once in the header, with read age and coverage', () => {
    render(
      <ByPlatformView
        now={FIXTURE_NOW}
        state={{ status: 'ready', metrics: portfolioMetricsFixture() }}
      />,
    );
    expect(screen.getByTestId('by-platform-attribution').textContent).toBe(
      "7 days · Attribution: Each platform's own · read 3 h ago · 100%",
    );
    expect(screen.queryAllByTestId('by-platform-own-count')).toHaveLength(0);
    expect(screen.getByTestId('by-platform').textContent?.match(/Attribution:/g)).toHaveLength(1);
  });

  it('under a spreadsheet, counts by the sheet and keeps the platform count beside it in grey', () => {
    render(
      <ByPlatformView
        now={FIXTURE_NOW}
        state={{ status: 'ready', metrics: portfolioMetricsFixture({ used: 'spreadsheet' }) }}
      />,
    );
    expect(screen.getByTestId('by-platform-attribution').textContent).toBe(
      '7 days · Attribution: Spreadsheet · read 3 h ago · 92%',
    );
    const meta = rowFor('meta');
    expect(within(meta).getByTestId('by-platform-results').textContent).toContain('52 · 28%');
    const own = within(meta).getByTestId('by-platform-own-count');
    expect(own.textContent).toBe('78 by Meta');
    expect(own.className).toContain('text-muted-foreground');
    expect(within(meta).getByTestId('by-platform-cost').textContent).toBe(
      '$66.44 MXN per lead · Spreadsheet',
    );
  });

  it('says why a configured sheet is not the one in use', () => {
    render(
      <ByPlatformView
        now={FIXTURE_NOW}
        state={{
          status: 'ready',
          metrics: portfolioMetricsFixture({
            used: 'platform',
            configured: 'spreadsheet',
            fallback: 'coverage',
          }),
        }}
      />,
    );
    expect(screen.getByTestId('by-platform-fallback').textContent).toBe(
      "Spreadsheet is set up, but it covers less than 80% of what spent, so each platform's own count is used.",
    );
  });

  it('reads "no target set" when the portfolio has no target', () => {
    render(
      <ByPlatformView
        now={FIXTURE_NOW}
        state={{ status: 'ready', metrics: portfolioMetricsFixture({ targetCpa: null }) }}
      />,
    );
    for (const state of screen.getAllByTestId('by-platform-state')) {
      expect(state.textContent).toBe('no target set');
    }
  });

  it('tells a mixed portfolio as one story: a spend-share bar, the spend summed, no blended cost', () => {
    render(
      <ByPlatformView
        now={FIXTURE_NOW}
        state={{ status: 'ready', metrics: portfolioMetricsFixture() }}
      />,
    );
    const bar = screen.getByTestId('mixed-spend-bar');
    expect(bar.getAttribute('aria-label')).toBe('Share of spend: Meta 39%, Google 46%, TikTok 15%');
    expect(
      [...bar.querySelectorAll('[data-platform]')].map((part) =>
        part.getAttribute('data-platform'),
      ),
    ).toEqual(['meta', 'google_ads', 'tiktok_ads']);
    expect(screen.getByTestId('mixed-spend-total').textContent).toBe(
      '$8,817 MXN spent across 3 platforms. Cost per lead stays per platform: each one counts its leads its own way, so they are not blended.',
    );
    // No cost per result for the portfolio as a whole: only the three rows carry one.
    expect(screen.getByTestId('by-platform').textContent?.match(/per lead/g)).toHaveLength(4);
  });

  it('says no cross-platform move is proposed: nothing calls G27 yet', () => {
    render(
      <ByPlatformView
        now={FIXTURE_NOW}
        state={{ status: 'ready', metrics: portfolioMetricsFixture({ used: 'spreadsheet' }) }}
      />,
    );
    expect(screen.getByTestId('cross-platform-move').textContent).toContain(
      'Move between platforms: no move proposed.',
    );
    expect(screen.getByTestId('mixed-spend-total').textContent).toContain(
      'Cost per lead stays per platform, in the rows above.',
    );
  });

  it('keeps a Meta-only portfolio on today’s screens: renders nothing', () => {
    const { container } = render(
      <ByPlatformView
        now={FIXTURE_NOW}
        state={{ status: 'ready', metrics: portfolioMetricsFixture({ platforms: ['meta'] }) }}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('says "not available yet" only for a portfolio known to hold a member off Meta', () => {
    render(<ByPlatformView nonMetaMember now={FIXTURE_NOW} state={{ status: 'unavailable' }} />);
    expect(screen.getByTestId('multiplatform-unavailable').textContent).toContain(
      "aren't available yet",
    );
  });

  it('keeps a Meta-only portfolio on today’s screens while the RPC is missing or failing: renders nothing', () => {
    for (const status of ['unavailable', 'error'] as const) {
      const { container } = render(<ByPlatformView now={FIXTURE_NOW} state={{ status }} />);
      expect(container.innerHTML).toBe('');
      cleanup();
    }
  });

  it('says the read failed on an error, and renders nothing while loading', () => {
    render(<ByPlatformView nonMetaMember now={FIXTURE_NOW} state={{ status: 'error' }} />);
    expect(screen.getByTestId('by-platform-error').textContent).toContain('failed');
    cleanup();
    const { container } = render(
      <ByPlatformView nonMetaMember now={FIXTURE_NOW} state={{ status: 'loading' }} />,
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('fetchPortfolioMetrics', () => {
  it('calls optimizer_get_portfolio_metrics and parses with PortfolioMetricsSchema', async () => {
    const metrics = portfolioMetricsFixture();
    const calls: unknown[] = [];
    const result = await fetchPortfolioMetrics('0b8f0c55-1d2e-4c3b-8a9f-6e5d4c3b2a10', 'd7', {
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        return { data: metrics, error: null };
      },
    });
    expect(calls).toEqual([
      [
        'optimizer_get_portfolio_metrics',
        { p_portfolio_id: '0b8f0c55-1d2e-4c3b-8a9f-6e5d4c3b2a10', p_window: 'd7' },
      ],
    ]);
    expect(result.by_platform).toHaveLength(3);
  });

  it('throws MissingRpcError when the function is not deployed, a plain Error otherwise', async () => {
    const missing = fetchPortfolioMetrics('p', 'd7', {
      rpc: async () => ({ data: null, error: { code: 'PGRST202' } }),
    });
    await expect(missing).rejects.toMatchObject({ name: 'MissingRpcError' });
    const malformed = fetchPortfolioMetrics('p', 'd7', {
      rpc: async () => ({ data: { by_platform: 'nope' }, error: null }),
    });
    await expect(malformed).rejects.toThrow('unexpected shape');
  });
});
