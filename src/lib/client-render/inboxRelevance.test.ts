import { describe, expect, it } from 'bun:test';
import type { ClientRenderJob } from '@continuum/contracts';
import { shouldRefreshForRow } from './inboxRelevance';

const JOB_ID = 'de3e6121-89d0-49ed-ade8-733e68773003';
const OTHER_ID = 'f25c7e84-cada-49ae-86b5-eebdfc77a499';

const held = (overrides: Partial<ClientRenderJob> = {}): ClientRenderJob =>
  ({
    id: JOB_ID,
    brandId: '1d1eac52-2955-42bd-81b5-a47808214ae2',
    kind: 'planner_reel',
    state: 'rendering',
    sourceId: '9f6a58aa-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
    ...overrides,
  }) as ClientRenderJob;

// Realtime hands over the raw row, so the fixture is snake_case on purpose — a camelCase
// fixture would pass while the real payload silently matched nothing.
const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: JOB_ID,
  kind: 'planner_reel',
  state: 'rendering',
  brand_id: '1d1eac52-2955-42bd-81b5-a47808214ae2',
  progress: 0.4,
  ...overrides,
});

describe('shouldRefreshForRow', () => {
  it('ignores a progress-only write on a job we already hold in the same state', () => {
    expect(shouldRefreshForRow(row({ progress: 0.9 }), [held()], false)).toBe(false);
  });

  it('refreshes when a held job changes state', () => {
    expect(shouldRefreshForRow(row({ state: 'saving' }), [held()], false)).toBe(true);
  });

  it('refreshes for a job it has never seen', () => {
    expect(shouldRefreshForRow(row({ id: OTHER_ID }), [held()], false)).toBe(true);
  });

  it('refreshes when the inbox is open, so another tab s progress bar still ticks', () => {
    expect(shouldRefreshForRow(row({ progress: 0.9 }), [held()], true)).toBe(true);
  });

  // The url_ingest worker shares this table and heartbeats on its own service lease. It is
  // filtered server-side, so every one of its ticks would otherwise read as a new job.
  it('never refreshes for a url_ingest row, open inbox or not', () => {
    const ingest = row({ id: OTHER_ID, kind: 'url_ingest' });
    expect(shouldRefreshForRow(ingest, [held()], false)).toBe(false);
    expect(shouldRefreshForRow(ingest, [held()], true)).toBe(false);
  });

  it('refreshes for a service kind the browser cannot run but the inbox still lists', () => {
    expect(shouldRefreshForRow(row({ id: OTHER_ID, kind: 'server_reel' }), [held()], false)).toBe(
      true,
    );
  });

  // Erring toward the read: a payload we cannot reason about costs one GET; treating it as
  // irrelevant costs a job nobody hears about, which is the defect this queue keeps having.
  it('refreshes when the row carries no usable id', () => {
    expect(shouldRefreshForRow({ kind: 'planner_reel', state: 'ready' }, [held()], false)).toBe(
      true,
    );
  });

  it('refreshes when a held job has no counterpart state on the wire', () => {
    expect(shouldRefreshForRow(row({ state: null }), [held()], false)).toBe(true);
  });

  it('refreshes for any row when nothing is held yet', () => {
    expect(shouldRefreshForRow(row(), [], false)).toBe(true);
  });
});
