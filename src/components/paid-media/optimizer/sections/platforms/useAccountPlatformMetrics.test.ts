import { describe, expect, it } from 'bun:test';
import { EASY_FIT_MP1 } from './__fixtures__/accountPlatformMetrics';
import { isMissingRpcError, MissingRpcError } from './multiplatformRead';
import { fetchAccountPlatformMetrics, metricsStateOf } from './useAccountPlatformMetrics';

function client(answer: { data: unknown; error: unknown }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve(answer);
    },
  };
}

describe('fetchAccountPlatformMetrics', () => {
  it('calls the producer with the brand and window and parses the frame', async () => {
    const fake = client({ data: EASY_FIT_MP1, error: null });
    const metrics = await fetchAccountPlatformMetrics('brand-1', 'd7', fake);
    expect(fake.calls).toEqual([
      {
        fn: 'optimizer_get_account_platform_metrics',
        args: { p_brand_id: 'brand-1', p_window: 'd7' },
      },
    ]);
    expect(metrics.decisions_waiting).toBe(6);
  });

  it('tells a missing RPC apart from a failed one', async () => {
    await expect(
      fetchAccountPlatformMetrics('b', 'd7', client({ data: null, error: { code: 'PGRST202' } })),
    ).rejects.toBeInstanceOf(MissingRpcError);
    const failed = fetchAccountPlatformMetrics(
      'b',
      'd7',
      client({ data: null, error: { code: '42501' } }),
    );
    await expect(failed).rejects.toThrow('Could not read the multi-platform numbers.');
    await expect(failed).rejects.not.toBeInstanceOf(MissingRpcError);
  });

  it('refuses a frame the contract refuses', async () => {
    const broken = {
      ...EASY_FIT_MP1,
      totals_by_platform: EASY_FIT_MP1.totals_by_platform.slice(1),
    };
    await expect(
      fetchAccountPlatformMetrics('b', 'd7', client({ data: broken, error: null })),
    ).rejects.toThrow('shape this page does not know');
  });
});

describe('metricsStateOf', () => {
  it('maps each query outcome to its own state', () => {
    expect(metricsStateOf({ data: undefined, error: null, isError: false })).toEqual({
      status: 'loading',
    });
    expect(
      metricsStateOf({ data: undefined, error: new MissingRpcError('x'), isError: true }),
    ).toEqual({ status: 'unavailable' });
    expect(metricsStateOf({ data: undefined, error: new Error('boom'), isError: true })).toEqual({
      status: 'error',
      message: 'boom',
    });
    expect(metricsStateOf({ data: EASY_FIT_MP1, error: null, isError: false }).status).toBe(
      'ready',
    );
  });
});

describe('isMissingRpcError', () => {
  it('holds for PostgREST and Postgres "function not found" only', () => {
    expect(isMissingRpcError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingRpcError({ code: '42883' })).toBe(true);
    expect(isMissingRpcError({ code: '42501' })).toBe(false);
    expect(isMissingRpcError(null)).toBe(false);
    expect(isMissingRpcError('PGRST202')).toBe(false);
  });
});
