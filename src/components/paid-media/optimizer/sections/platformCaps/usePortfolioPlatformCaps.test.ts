import { describe, expect, it } from 'bun:test';
import { MissingRpcError } from '../platforms/multiplatformRead';
import {
  fetchPlatformCaps,
  GET_PLATFORM_CAPS_RPC,
  SET_PLATFORM_CAP_RPC,
  savePlatformCap,
} from './usePortfolioPlatformCaps';

const PORTFOLIO = '0be73981-6287-44ff-8b57-0d083e3e6625';

const client = (answer: { data: unknown; error: unknown }) => {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      return answer;
    },
  };
};

describe('fetchPlatformCaps', () => {
  it('reads one row per platform and drops a platform the Frontend does not know', async () => {
    const rpc = client({
      data: [
        { platform: 'meta', currency: 'MXN', daily_cap_minor: 50000, accounts: 1 },
        { platform: 'google_ads', currency: null, daily_cap_minor: null, accounts: 2 },
        { platform: 'snapchat', currency: 'USD', daily_cap_minor: 1, accounts: 1 },
      ],
      error: null,
    });
    expect(await fetchPlatformCaps(PORTFOLIO, rpc)).toEqual([
      { platform: 'meta', currency: 'MXN', dailyCapMinor: 50000, accounts: 1 },
      { platform: 'google_ads', currency: null, dailyCapMinor: null, accounts: 2 },
    ]);
    expect(rpc.calls).toEqual([{ fn: GET_PLATFORM_CAPS_RPC, args: { p_portfolio_id: PORTFOLIO } }]);
  });

  it('tells a missing RPC apart from a failed read', async () => {
    await expect(
      fetchPlatformCaps(PORTFOLIO, client({ data: null, error: { code: 'PGRST202' } })),
    ).rejects.toBeInstanceOf(MissingRpcError);
    const failed = fetchPlatformCaps(PORTFOLIO, client({ data: null, error: { code: '42501' } }));
    await expect(failed).rejects.toThrow('The platform limits could not be read.');
  });

  it('refuses a row whose cap is negative rather than showing it', async () => {
    const rpc = client({
      data: [{ platform: 'meta', currency: 'MXN', daily_cap_minor: -1, accounts: 1 }],
      error: null,
    });
    await expect(fetchPlatformCaps(PORTFOLIO, rpc)).rejects.toThrow(/unexpected shape/);
  });
});

describe('savePlatformCap', () => {
  it('sends the platform and the minor cap, null to clear', async () => {
    const rpc = client({ data: 60000, error: null });
    expect(await savePlatformCap(PORTFOLIO, 'google_ads', 60000, rpc)).toBe(60000);
    const cleared = client({ data: null, error: null });
    expect(await savePlatformCap(PORTFOLIO, 'meta', null, cleared)).toBeNull();
    expect(rpc.calls[0]).toEqual({
      fn: SET_PLATFORM_CAP_RPC,
      args: { p_portfolio_id: PORTFOLIO, p_platform: 'google_ads', p_daily_cap_minor: 60000 },
    });
    expect(cleared.calls[0]?.args?.['p_daily_cap_minor']).toBeNull();
  });

  it("surfaces the database's own refusal", async () => {
    const rpc = client({
      data: null,
      error: { code: '22023', message: 'optimizer: a platform daily cap cannot be negative' },
    });
    await expect(savePlatformCap(PORTFOLIO, 'meta', -1, rpc)).rejects.toThrow(
      'optimizer: a platform daily cap cannot be negative',
    );
  });
});
