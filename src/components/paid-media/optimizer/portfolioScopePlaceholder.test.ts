import { describe, expect, it } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { QueryClient } from '@tanstack/react-query';
import { cachedPortfolioScope, optimizerQueryKeys, type PortfolioScope } from './useOptimizerData';

const portfolio = (id: string, account: string) =>
  ({ id, ad_account_id: account, name: id }) as unknown as PortfolioListItem;

const rows = [portfolio('p1', 'act_111'), portfolio('p2', 'act_222')];
const seeded: PortfolioScope = {
  portfolios: [rows[0] as PortfolioListItem],
  brandPortfolios: rows,
  brandPortfolioCount: 2,
  otherAccountIds: ['act_222'],
  droppedRowCount: 0,
};

describe('cachedPortfolioScope — the account flip paints from the read already in hand', () => {
  it("re-scopes the brand's cached portfolios to the account the page settled on", () => {
    const client = new QueryClient();
    client.setQueryData(optimizerQueryKeys.portfolios('brand-1', 'act_111'), seeded);
    const scope = cachedPortfolioScope(client, 'brand-1', 'act_222');
    expect(scope?.portfolios.map((row) => row.id)).toEqual(['p2']);
    expect(scope?.otherAccountIds).toEqual(['act_111']);
    expect(scope?.brandPortfolioCount).toBe(2);
  });

  it('has nothing to offer for a brand never read, or another brand', () => {
    const client = new QueryClient();
    expect(cachedPortfolioScope(client, 'brand-1', 'act_111')).toBeUndefined();
    client.setQueryData(optimizerQueryKeys.portfolios('brand-2', 'act_111'), seeded);
    expect(cachedPortfolioScope(client, 'brand-1', 'act_111')).toBeUndefined();
  });
});
