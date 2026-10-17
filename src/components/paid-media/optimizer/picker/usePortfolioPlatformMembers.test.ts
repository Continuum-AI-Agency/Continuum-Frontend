import { describe, expect, it } from 'bun:test';
import { MissingRpcError } from '../sections/platforms/multiplatformRead';
import {
  ADD_MEMBERS_RPC,
  fetchPortfolioMembers,
  LIST_MEMBERS_RPC,
  REMOVE_MEMBER_RPC,
  saveGoogleMembers,
} from './usePortfolioPlatformMembers';

const PORTFOLIO = '5f765de6-f0e5-468f-b90d-a55b79a598a6';

function client(answers: Record<string, { data: unknown; error: unknown }[]>) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      return answers[fn]?.shift() ?? { data: null, error: null };
    },
  };
}

describe('fetchPortfolioMembers', () => {
  it('reads each member with its catalog name and type', async () => {
    const rpc = client({
      [LIST_MEMBERS_RPC]: [
        {
          data: [
            {
              platform: 'google_ads',
              account_id: '5251780631',
              entity_id: '20553834868',
              level: 'campaign',
              name: 'Campaña Pasarela de pago',
              channel_type: 'SEARCH',
              missing_since: null,
            },
          ],
          error: null,
        },
      ],
    });
    expect(await fetchPortfolioMembers(PORTFOLIO, rpc)).toEqual([
      {
        platform: 'google_ads',
        accountId: '5251780631',
        entityId: '20553834868',
        level: 'campaign',
        name: 'Campaña Pasarela de pago',
        channelType: 'SEARCH',
      },
    ]);
    expect(rpc.calls).toEqual([{ fn: LIST_MEMBERS_RPC, args: { p_portfolio_id: PORTFOLIO } }]);
  });

  it('tells a missing RPC apart from a failed read', async () => {
    await expect(
      fetchPortfolioMembers(
        PORTFOLIO,
        client({ [LIST_MEMBERS_RPC]: [{ data: null, error: { code: 'PGRST202' } }] }),
      ),
    ).rejects.toBeInstanceOf(MissingRpcError);
    await expect(
      fetchPortfolioMembers(
        PORTFOLIO,
        client({ [LIST_MEMBERS_RPC]: [{ data: null, error: { code: '42501' } }] }),
      ),
    ).rejects.toThrow("The portfolio's campaigns could not be read.");
  });
});

describe('saveGoogleMembers', () => {
  it('adds in one call through the wizard path, then removes each', async () => {
    const rpc = client({});
    await saveGoogleMembers(
      PORTFOLIO,
      {
        accountId: '5251780631',
        add: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
        remove: ['c'],
      },
      rpc,
    );
    expect(rpc.calls.map((call) => call.fn)).toEqual([ADD_MEMBERS_RPC, REMOVE_MEMBER_RPC]);
    expect(rpc.calls[0]?.args).toEqual({
      p_portfolio_id: PORTFOLIO,
      p_members: [
        {
          platform: 'google_ads',
          account_id: '5251780631',
          entity_id: 'a',
          level: 'campaign',
          name: 'A',
        },
        {
          platform: 'google_ads',
          account_id: '5251780631',
          entity_id: 'b',
          level: 'campaign',
          name: 'B',
        },
      ],
    });
    expect(rpc.calls[1]?.args).toEqual({
      p_portfolio_id: PORTFOLIO,
      p_platform: 'google_ads',
      p_entity_id: 'c',
    });
  });

  it('stops at the first refusal, in the database’s words, and removes nothing after a refused add', async () => {
    const rpc = client({
      [ADD_MEMBERS_RPC]: [
        {
          data: null,
          error: {
            code: '23505',
            message: 'optimizer: google_ads campaign a is already in portfolio x',
          },
        },
      ],
    });
    await expect(
      saveGoogleMembers(
        PORTFOLIO,
        { accountId: '5251780631', add: [{ id: 'a', name: 'A' }], remove: ['c'] },
        rpc,
      ),
    ).rejects.toThrow('is already in portfolio x');
    expect(rpc.calls.map((call) => call.fn)).toEqual([ADD_MEMBERS_RPC]);
  });
});
