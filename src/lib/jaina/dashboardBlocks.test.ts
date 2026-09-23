/**
 * What a saved dashboard keeps of its report: the scope frame, first, always.
 *
 * Four production rows carried no `data_scope` block and a null `window_label`; the only
 * window that survived was one a person typed into the name. These pin the three outcomes
 * a save can have — the frame is visible, the frame was hidden, the report has no frame —
 * and the order a reopen reads a row back in.
 */

import { describe, expect, test } from 'bun:test';
import {
  DASHBOARD_SCOPE_MISSING_MESSAGE,
  findDataScopeBlock,
  orderDashboardBlocks,
  prepareDashboardBlocks,
} from './dashboardBlocks';
import type { CheckpointBlockV2 } from './schemas';

const scopeFrame = {
  block_id: 'scope',
  category: 'data_scope',
  scope: 'current_account',
  title: 'Scope',
  priority: 1,
  provenance: null,
  dates: '2026-08-23 → 2026-09-21',
  timezone: 'America/Mexico_City',
  source: 'api',
  notes: [],
} as unknown as CheckpointBlockV2;

const grid = {
  block_id: 'grid',
  category: 'metric_grid',
  scope: 'current_account',
  title: 'Key metrics',
  priority: 0,
  provenance: null,
  metrics: [],
} as unknown as CheckpointBlockV2;

const prose = {
  block_id: 'prose',
  category: 'narrative',
  scope: 'current_account',
  title: 'What moved',
  priority: 0,
  provenance: null,
  body: 'Reels took share.',
  highlights: [],
  citations: [],
} as unknown as CheckpointBlockV2;

describe('prepareDashboardBlocks', () => {
  test('keeps the visible scope frame first and names the window from it', () => {
    const plan = prepareDashboardBlocks({ blocks: [scopeFrame, grid, prose] }, [grid, scopeFrame]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.blocks.map((block) => block.block_id)).toEqual(['scope', 'grid']);
    expect(plan.windowLabel).toBe('2026-08-23 → 2026-09-21');
  });

  test('pairs every kept block with its re-run spec, in the same order, never guessing one', () => {
    const plan = prepareDashboardBlocks({ blocks: [scopeFrame, grid, prose] }, [prose, grid]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.spec.version).toBe(1);
    expect(plan.spec.blocks.map((entry) => entry.block_id)).toEqual(['scope', 'prose', 'grid']);
    // None of these fixtures records a tool, so none is re-runnable — and each says why.
    expect(plan.spec.blocks.map((entry) => entry.spec)).toEqual([null, null, null]);
    expect(plan.spec.blocks[0]?.reason).toMatch(/composed/);
    expect(plan.spec.blocks[1]?.reason).toBe('no tool recorded');
  });

  test('injects the report frame when the person hid it, so no figure is saved naked', () => {
    const plan = prepareDashboardBlocks({ blocks: [scopeFrame, grid, prose] }, [prose, grid]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.blocks.map((block) => block.block_id)).toEqual(['scope', 'prose', 'grid']);
    expect(plan.windowLabel).toBe('2026-08-23 → 2026-09-21');
  });

  test('refuses a report that states no window, naming what is missing', () => {
    const plan = prepareDashboardBlocks({ blocks: [grid, prose] }, [grid, prose]);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.missing).toBe('data_scope');
    expect(plan.message).toBe(DASHBOARD_SCOPE_MISSING_MESSAGE);
    expect(plan.message).toContain('period');
  });
});

describe('orderDashboardBlocks', () => {
  test('moves a scope frame stored after the figures to the front, and keeps the rest', () => {
    expect(orderDashboardBlocks([grid, prose, scopeFrame]).map((block) => block.block_id)).toEqual([
      'scope',
      'grid',
      'prose',
    ]);
  });

  test('changes nothing on a row with no frame', () => {
    expect(orderDashboardBlocks([prose, grid]).map((block) => block.block_id)).toEqual([
      'prose',
      'grid',
    ]);
  });
});

describe('findDataScopeBlock', () => {
  test('finds the frame wherever it sits and reports none honestly', () => {
    expect(findDataScopeBlock([grid, scopeFrame])?.block_id).toBe('scope');
    expect(findDataScopeBlock([grid])).toBeNull();
  });
});
