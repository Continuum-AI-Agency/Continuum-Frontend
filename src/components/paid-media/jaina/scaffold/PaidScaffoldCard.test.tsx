/**
 * What a person reviewing a proposed campaign actually sees. The tree is seeded straight into the
 * query cache (the card reads Postgres, not the wire), and happy-dom measures every box at 0px —
 * which is the narrow floating panel on the canvas page, so the outline renders, not React Flow.
 *
 * Positive observables only: Frontend tests are not typechecked, so "it rendered" proves nothing.
 */

import { afterEach, describe, expect, it } from 'bun:test';
import type { JainaToolApprovalRequiredPayload } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { seededScaffoldState } from '@/lib/jaina/uiMessageProjection';
import type { PaidScaffoldNodeRow } from '@/lib/paid-media/scaffoldTree';
import { PaidScaffoldCard } from './PaidScaffoldCard';

afterEach(cleanup);

const VERSION = '55555555-5555-4555-8555-555555555555';

const node = (
  fields: Partial<PaidScaffoldNodeRow> & Pick<PaidScaffoldNodeRow, 'id' | 'level' | 'pathKey'>,
): PaidScaffoldNodeRow => ({
  parentId: null,
  ordinal: 0,
  name: fields.pathKey,
  productKey: null,
  angleKey: null,
  conceptKey: null,
  payload: {},
  status: 'pending',
  metaObjectId: null,
  metaCreativeId: null,
  errorMessage: null,
  attempt: 0,
  creativeAssetId: null,
  creativeMedia: null,
  dailyBudgetMinorUnits: null,
  ...fields,
});

const ROWS: PaidScaffoldNodeRow[] = [
  node({ id: 'c', level: 'campaign', pathKey: 'c0', name: 'Easy Fit | Summer' }),
  node({
    id: 'a1',
    parentId: 'c',
    level: 'adset',
    pathKey: 'c0/a0',
    name: 'Prospecting',
    payload: { targeting: { geo_locations: { countries: ['US'] } } },
    dailyBudgetMinorUnits: 6199,
  }),
  node({
    id: 'a2',
    parentId: 'c',
    level: 'adset',
    pathKey: 'c0/a1',
    ordinal: 1,
    name: 'Retargeting',
    dailyBudgetMinorUnits: 3000,
  }),
  node({ id: 'd1', parentId: 'a1', level: 'ad', pathKey: 'c0/a0/ad0' }),
  node({ id: 'd2', parentId: 'a2', level: 'ad', pathKey: 'c0/a1/ad0', creativeAssetId: 'asset-1' }),
];

const BUILD_APPROVAL: JainaToolApprovalRequiredPayload = {
  approvalId: 'appr_build',
  toolCallId: 'call_build',
  toolName: 'paid_scaffold_build',
  input: { scaffold_version_id: VERSION, content_hash: 'abc' },
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const renderCard = (props: Partial<ComponentProps<typeof PaidScaffoldCard>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // brandId '' keeps the currency read disabled, so nothing reaches for Supabase.
  client.setQueryData(['paid-scaffold-tree', VERSION], {
    versionId: VERSION,
    rows: ROWS,
    header: { scaffoldId: 'scaffold-1', brandId: '', adAccountId: null },
  });
  return render(
    <QueryClientProvider client={client}>
      <PaidScaffoldCard
        scaffold={seededScaffoldState(VERSION)}
        approval={null}
        resolution={null}
        denial={null}
        optimisticDecision={null}
        isStreaming={false}
        {...props}
      />
    </QueryClientProvider>,
  );
};

describe('PaidScaffoldCard', () => {
  it('calls a bare proposal a proposal, not a gate nobody can answer', () => {
    renderCard();
    expect(screen.getByText('Proposed — nothing on Meta yet')).toBeTruthy();
    expect(screen.queryByText('Awaiting your approval')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve & create (paused)' })).toBeNull();
  });

  it('asks for approval only when a gate is actually open, with the gate’s own label', () => {
    renderCard({ approval: BUILD_APPROVAL, onDecide: () => {} });
    expect(screen.getByText('Awaiting your approval')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve & create (paused)' })).toBeTruthy();
  });

  it('says the gate was declined from the resolution alone', () => {
    renderCard({
      resolution: {
        approvalId: 'appr_build',
        toolCallId: 'call_build',
        toolName: 'paid_scaffold_build',
        decision: 'denied',
      },
    });
    expect(screen.getByText('Declined — nothing created')).toBeTruthy();
  });

  it('counts from the rows even when the frame carried no summary', () => {
    renderCard();
    expect(screen.getByText(/1 campaign · 2 ad sets · 2 ads/)).toBeTruthy();
  });

  it('states the opening budget in the account currency', () => {
    renderCard();
    expect(screen.getByTestId('scaffold-opening-budget-total').textContent).toBe('$92/day');
    expect(screen.getByTestId('scaffold-opening-budget').textContent).toContain('across 2 ad sets');
  });

  it('names what would stop the build and the populate', () => {
    renderCard();
    expect(screen.getByTestId('scaffold-blocker-audience').textContent).toContain('Retargeting');
    expect(screen.getByTestId('scaffold-blocker-creative').textContent).toContain(
      '1 ad has no creative',
    );
  });

  it('links to the scaffold on the campaign canvas', () => {
    renderCard();
    expect(screen.getByTestId('scaffold-open-canvas').getAttribute('href')).toBe(
      '/scale/campaign-canvas?scaffold=scaffold-1',
    );
  });

  it('draws an outline, not an unreadable graph, in a narrow panel', () => {
    renderCard();
    const outline = screen.getByTestId('scaffold-outline');
    expect(outline.textContent).toContain('Easy Fit | Summer');
    expect(outline.textContent).toContain('Prospecting');
    expect(outline.textContent).toContain('$62/day');
    expect(outline.textContent).toContain('$30/day');
  });
});
