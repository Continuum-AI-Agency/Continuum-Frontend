// What the account read envelope must survive, now that it carries a refresh block.
//
// The Frontend promotes before the migration is applied, so for a window the RPC answers
// without `refresh` at all. That window must render — silently, with no control — rather than
// throwing or claiming a state nobody reported.

import { describe, expect, it, mock } from 'bun:test';

const rpc = mock(async () => ({ data: null, error: null }));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ rpc, schema: () => ({ rpc }), functions: { invoke: rpc } }),
}));

const { AccountReadEnvelopeSchema, AccountReadRefreshSchema } = await import(
  '../../useOptimizerData'
);

const READY = {
  id: 'r1',
  utc_day: '2026-09-21',
  ready_at: '2026-09-21T00:03:30.000Z',
  model: 'deterministic',
  prompt_version: 'v1',
  read: {
    candidates: [],
    guards: [],
    narrative: 'Nothing to move today.',
    starved: [],
    assumptions: [],
    ceiling_defaults: {},
    deck: null,
  },
};

describe('the account read envelope', () => {
  it('parses a row from an RPC that has never heard of refresh', () => {
    const parsed = AccountReadEnvelopeSchema.parse(READY);
    expect(parsed?.ready_at).toBe('2026-09-21T00:03:30.000Z');
    expect(parsed?.refresh).toBeNull();
  });

  it('carries the refresh block through when the RPC sends one', () => {
    const parsed = AccountReadEnvelopeSchema.parse({
      ...READY,
      refresh: {
        state: 'queued',
        requested_at: '2026-09-21T12:00:00.000Z',
        requests_used: 1,
        requests_left: 2,
        can_request: false,
        retry_after: null,
        reason: 'already_running',
      },
    });
    expect(parsed?.refresh?.state).toBe('queued');
    expect(parsed?.refresh?.can_request).toBe(false);
    // The words already on screen survive the re-read that is running behind them.
    expect(parsed?.read?.narrative).toBe('Nothing to move today.');
  });

  it('keeps an envelope whose read has not landed yet, so a first read can be announced', () => {
    const parsed = AccountReadEnvelopeSchema.parse({
      id: null,
      utc_day: null,
      ready_at: null,
      model: null,
      prompt_version: null,
      read: null,
      refresh: {
        state: 'queued',
        requested_at: null,
        requests_used: 0,
        requests_left: 3,
        can_request: false,
        retry_after: null,
        reason: 'already_running',
      },
    });
    expect(parsed?.read).toBeNull();
    expect(parsed?.refresh?.state).toBe('queued');
  });

  it('degrades a refresh block whose shape has moved on to one that claims nothing', () => {
    const parsed = AccountReadEnvelopeSchema.parse({ ...READY, refresh: { state: 42 } });
    // Field by field, so a block the Backend has since widened does not empty the whole thing.
    // What matters is that it offers no control and asserts no state it was not told.
    expect(parsed?.refresh?.state).toBe('none');
    expect(parsed?.refresh?.can_request).toBe(false);
    expect(parsed?.read?.narrative).toBe('Nothing to move today.');
  });

  it('reads a state it does not recognise as no state at all', () => {
    const parsed = AccountReadRefreshSchema.parse({
      state: 'composting',
      requested_at: null,
      requests_used: 0,
      requests_left: 3,
      can_request: false,
      retry_after: null,
      reason: null,
    });
    expect(parsed?.state).toBe('none');
  });
});
