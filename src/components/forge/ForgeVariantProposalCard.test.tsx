/**
 * ForgeVariantProposalCard against a mocked save: every change, recolour included, reads as a
 * saved → proposed row under column headers, a failed save is announced, and the retry replays
 * the same save instead of forking a second variant.
 */

import { afterEach, expect, mock, test } from 'bun:test';
import type { ForgeVariantProposal, SaveTemplateRevisionRequest } from '@continuum/contracts';

const saves: SaveTemplateRevisionRequest[] = [];
let failNext = false;
mock.module('@/lib/library/templateSources', () => ({
  saveTemplateRevision: async (_assetId: string, request: SaveTemplateRevisionRequest) => {
    saves.push(request);
    if (failNext) {
      failNext = false;
      throw new Error('The forge is busy: try again.');
    }
    return { replayed: false, revision: { id: crypto.randomUUID(), number: 1 } };
  },
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ForgeVariantProposalCard } from './ForgeVariantProposalCard';

const proposal: ForgeVariantProposal = {
  toolCallId: 'call-1',
  proposalId: '11111111-1111-4111-8111-111111111111',
  name: 'Summer — warm',
  rationale: 'For the summer sale.',
  parentRevisionId: '44444444-4444-4444-8444-444444444444',
  compId: 1,
  edits: {
    layers: [{ compId: 1, layerId: 2, text: 'Summer ends Sunday' }],
    slots: [],
    orders: [],
    recolor: { palette: ['#ff6600', '#003366'], minChroma: 0.1 },
  },
  changes: [
    {
      compId: 1,
      layerId: 2,
      layer: 'Headline',
      field: 'text',
      from: 'New season',
      to: 'Summer ends Sunday',
    },
  ],
  svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
  warnings: [],
};

function renderCard() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ForgeVariantProposalCard
        assetId="33333333-3333-4333-8333-333333333333"
        brandId="22222222-2222-4222-8222-222222222222"
        proposal={proposal}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  saves.length = 0;
  failNext = false;
});

test('every change, recolour included, is a saved → proposed row under column headers', () => {
  renderCard();
  expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
    'Layer',
    'Property',
    'Saved → proposed',
  ]);
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows.map((row) => row.textContent)).toEqual([
    'Headlinetext“New season” → “Summer ends Sunday”',
    'Every layercoloursas saved → #ff6600, #003366',
  ]);
});

test('a failed save is announced, and the retry replays the same save', async () => {
  failNext = true;
  renderCard();
  fireEvent.click(screen.getByRole('button', { name: 'Save as variant' }));
  expect((await screen.findByRole('alert')).textContent).toBe('The forge is busy: try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Save as variant' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saved as variant'));
  expect(saves).toHaveLength(2);
  expect(saves[1]?.idempotencyKey).toBe(saves[0]?.idempotencyKey as string);
  expect(saves[1]).toMatchObject({ name: 'Summer — warm', edits: proposal.edits });
});
