import { afterEach, describe, expect, it } from 'bun:test';
import type { LiveChangePreviewPayload } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LIVE_BATCH_PREVIEW } from '@/lib/campaign-canvas/lectura.fixtures';
import { portfolioOfParts } from '@/lib/campaign-canvas/portfolio';
import { liveChangeVersionsOf } from '@/lib/campaign-canvas/versions';
import { PortfolioCompanion } from './PortfolioCompanion';

afterEach(cleanup);

const other: LiveChangePreviewPayload = {
  ...LIVE_BATCH_PREVIEW,
  approvalId: 'appr_other',
  partId: 'live-change:appr_other',
  nodes: LIVE_BATCH_PREVIEW.nodes.map((node) => ({
    ...node,
    id: `o-${node.id}`,
    parentId: node.parentId ? `o-${node.parentId}` : null,
    name: node.level === 'campaign' ? 'OTRA // VENTAS' : node.name,
  })),
};

describe('PortfolioCompanion', () => {
  it('lists every campaign, opens one in Read, and goes back', () => {
    const portfolio = portfolioOfParts({ liveChangePreviews: [LIVE_BATCH_PREVIEW, other] });
    render(<PortfolioCompanion portfolio={portfolio} />);
    expect(screen.getByTestId('portfolio-headline').textContent).toBe('2 campaigns · 6 changes');
    fireEvent.click(screen.getByTestId('portfolio-row-live:o-1201'));
    expect(screen.getByTestId('portfolio-breadcrumb').textContent).toContain('OTRA // VENTAS');
    expect(screen.getByTestId('lectura-view')).toBeTruthy();
    expect(screen.getByTestId('lectura-change-o-2202').getAttribute('data-mark')).toBe('paused');
    fireEvent.click(screen.getByTestId('portfolio-back'));
    expect(screen.getByTestId('portfolio-band')).toBeTruthy();
  });

  it('draws a row’s version line and compares with the previous version', () => {
    const v2: LiveChangePreviewPayload = {
      ...LIVE_BATCH_PREVIEW,
      approvalId: 'appr_v2',
      partId: 'live-change:appr_v2',
      nodes: LIVE_BATCH_PREVIEW.nodes.filter(
        (node) => node.id !== '2202' && node.parentId !== '2202',
      ),
    };
    const thread = [
      { liveChangePreviews: [LIVE_BATCH_PREVIEW] },
      { liveChangePreviews: [v2, other] },
    ];
    const portfolio = portfolioOfParts(thread[1] ?? {});
    render(
      <PortfolioCompanion
        portfolio={portfolio}
        versionsByRow={{ 'live:1201': liveChangeVersionsOf(thread, '1201') }}
        initialRowId="live:1201"
      />,
    );
    expect(screen.getByTestId('version-v2').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('version-compare'));
    expect(screen.getByTestId('version-compare-summary').textContent).toContain('1 removed');
    expect(screen.getByTestId('lectura-change-2202').getAttribute('data-mark')).toBe('removed');
  });
});
