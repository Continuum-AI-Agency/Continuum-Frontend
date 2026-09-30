/**
 * The re-run spec, derived from blocks shaped like the four production rows in
 * brand_profiles.jaina_dashboards (read 2026-09-23): a hand-authored metric grid with no
 * tool, a computed grid with dates and `last_7d`, a get_top_ads table whose entity label
 * is the account, and a creative-intel set whose period is empty strings under `d30` and
 * whose entity label is a plain account name with the id only in row_meta.
 */

import { describe, expect, test } from 'bun:test';
import { jainaDashboardSchema } from './jaina-dashboard';
import {
  dashboardSpecSchema,
  deriveDashboardSpec,
  rangeFromJainaPeriod,
  rangeFromJainaWindowLabel,
} from './jaina-dashboard-spec';
import type { CheckpointBlockV2Lenient } from './jaina-report';

const block = (fields: Record<string, unknown>): CheckpointBlockV2Lenient =>
  ({
    scope: 'account',
    title: 'A block',
    priority: 'secondary',
    ...fields,
  }) as CheckpointBlockV2Lenient;

const handAuthoredGrid = block({
  block_id: 'mg_costo_conversacion_top',
  category: 'metric_grid',
  provenance: { source: 'computed', tool: null, period: null, entity_label: null },
  metrics: [{ label: 'Cañadas // $99 Primer Mes', value: 12 }],
});

const weeklyGrid = block({
  block_id: 'composed_72842552d8',
  category: 'metric_grid',
  provenance: {
    source: 'computed',
    tool: 'get_meta_overview_summary',
    period: { since: '2026-09-13', until: '2026-09-19', requested_label: 'last_7d' },
    entity_label: 'account-521903353286118',
  },
  dataset_id: 'ds_cf0840ff',
  metrics: [
    { label: 'Spend', value: 100 },
    { label: 'Ctr', value: 1.2 },
    { label: 'Roas', value: 2 },
  ],
});

const topAdsTable = block({
  block_id: 'composed_c5515ac174',
  category: 'data_table',
  provenance: {
    source: 'computed',
    tool: 'get_top_ads',
    period: { since: '2026-08-20', until: '2026-09-18', requested_label: 'last_30d' },
    entity_label: 'act_521903353286118',
  },
  dataset_id: 'ds_e24b33de',
  columns: [{ key: 'creative' }, { key: 'spend' }, { key: 'cost_per_messaging_conversation' }],
  rows: [{ creative: 'x', spend: 1, cost_per_messaging_conversation: 2 }],
  row_meta: [
    { entity_id: '120252387327720236', entity_type: 'ad', ad_account_id: 'act_521903353286118' },
  ],
});

const angleChart = block({
  block_id: 'composed_38ff52f9c6',
  category: 'chart',
  scope: 'creative_angle',
  provenance: {
    source: 'computed',
    tool: 'get_paid_creative_intel',
    period: { since: '', until: '', requested_label: 'd30' },
    entity_label: 'Easyfit',
  },
  dataset_id: 'ds_638aef19',
  chart_config: { delivered_spend: { label: 'Delivered spend' } },
  category_key: 'angle',
  data: [{ angle: 'Low-barrier entry offer', delivered_spend: 7692.13 }],
  data_meta: [{ account_name: 'Easyfit', ad_account_id: 'act_521903353286118' }],
});

const creativeActions = block({
  block_id: 'composed_de958e7927',
  category: 'insight_list',
  provenance: {
    source: 'computed',
    tool: 'get_paid_creative_intel',
    period: { since: '', until: '', requested_label: 'd30' },
    entity_label: 'act_521903353286118',
  },
  items: [{ item_type: 'action', title: 'Pause', summary: 'CPA 3.2x', severity: 'risk' }],
});

const scopeFrame = block({
  block_id: 'scope',
  category: 'data_scope',
  dates: '2026-08-20 → 2026-09-18',
  source: 'api',
  notes: [],
});

describe('rangeFromJainaWindowLabel', () => {
  test('maps the three Jaina spellings of a trailing window onto the shared presets', () => {
    expect(rangeFromJainaWindowLabel('d7')).toEqual({ kind: 'preset', preset: 'd7' });
    expect(rangeFromJainaWindowLabel('last_30d')).toEqual({ kind: 'preset', preset: 'd30' });
    expect(rangeFromJainaWindowLabel('14d')).toEqual({ kind: 'preset', preset: 'd14' });
    expect(rangeFromJainaWindowLabel(' Last_3d ')).toEqual({ kind: 'preset', preset: 'd3' });
  });
  test('has no preset for calendar or lifetime presets, or for nothing', () => {
    expect(rangeFromJainaWindowLabel('this_month')).toBeNull();
    expect(rangeFromJainaWindowLabel('last_28d')).toBeNull();
    expect(rangeFromJainaWindowLabel('maximum')).toBeNull();
    expect(rangeFromJainaWindowLabel(null)).toBeNull();
    expect(rangeFromJainaWindowLabel('')).toBeNull();
  });
});

describe('rangeFromJainaPeriod', () => {
  test('concrete dates win over the label; the label stands in for empty dates', () => {
    expect(
      rangeFromJainaPeriod({
        since: '2026-09-13',
        until: '2026-09-19',
        requested_label: 'last_7d',
      }),
    ).toEqual({ kind: 'custom', from: '2026-09-13', to: '2026-09-19' });
    expect(rangeFromJainaPeriod({ since: '', until: '', requested_label: 'd30' })).toEqual({
      kind: 'preset',
      preset: 'd30',
    });
    expect(
      rangeFromJainaPeriod({ since: null, until: null, requested_label: 'this_month' }),
    ).toBeNull();
    expect(rangeFromJainaPeriod(null)).toBeNull();
  });
});

describe('deriveDashboardSpec', () => {
  const spec = deriveDashboardSpec([
    scopeFrame,
    handAuthoredGrid,
    weeklyGrid,
    topAdsTable,
    angleChart,
    creativeActions,
  ]);

  test('is a valid spec with one entry per block, in order', () => {
    expect(dashboardSpecSchema.safeParse(spec).success).toBe(true);
    expect(spec.blocks.map((entry) => entry.block_id)).toEqual([
      'scope',
      'mg_costo_conversacion_top',
      'composed_72842552d8',
      'composed_c5515ac174',
      'composed_38ff52f9c6',
      'composed_de958e7927',
    ]);
  });

  test('a computed grid with dates: the tool, the account from its label, its metric labels, the dated window', () => {
    expect(spec.blocks[2]).toEqual({
      block_id: 'composed_72842552d8',
      category: 'metric_grid',
      reason: null,
      spec: {
        tool: 'get_meta_overview_summary',
        entity: { id: 'act_521903353286118', level: 'account', name: 'account-521903353286118' },
        metrics: ['Spend', 'Ctr', 'Roas'],
        range: { kind: 'custom', from: '2026-09-13', to: '2026-09-19' },
        derived: null,
      },
    });
  });

  test('a table whose rows are ads is a query over the account, with its column keys', () => {
    expect(spec.blocks[3]?.spec).toEqual({
      tool: 'get_top_ads',
      entity: { id: 'act_521903353286118', level: 'account', name: 'act_521903353286118' },
      metrics: ['creative', 'spend', 'cost_per_messaging_conversation'],
      range: { kind: 'custom', from: '2026-08-20', to: '2026-09-18' },
      derived: null,
    });
  });

  test('empty dates under a d30 label become the d30 preset; a named account resolves through data_meta', () => {
    expect(spec.blocks[4]?.spec).toEqual({
      tool: 'get_paid_creative_intel',
      entity: { id: 'act_521903353286118', level: 'account', name: 'Easyfit' },
      metrics: ['delivered_spend'],
      range: { kind: 'preset', preset: 'd30' },
      derived: null,
    });
  });

  test('an insight list is re-runnable but derived: its severity was judged against the old window', () => {
    expect(spec.blocks[5]?.spec).toMatchObject({
      tool: 'get_paid_creative_intel',
      metrics: [],
      range: { kind: 'preset', preset: 'd30' },
      derived: 'severity',
    });
  });

  test('a block with no tool on record is null with the reason, never guessed', () => {
    expect(spec.blocks[1]).toEqual({
      block_id: 'mg_costo_conversacion_top',
      category: 'metric_grid',
      spec: null,
      reason: 'no tool recorded',
    });
  });

  test('the scope frame is composed, not fetched', () => {
    expect(spec.blocks[0]?.spec).toBeNull();
    expect(spec.blocks[0]?.reason).toMatch(/composed/);
  });

  test('an entity with a name but no id anywhere is null with the name in the reason', () => {
    const [entry] = deriveDashboardSpec([
      block({
        block_id: 'named',
        category: 'chart',
        provenance: {
          source: 'computed',
          tool: 'get_paid_creative_intel',
          period: { since: '', until: '', requested_label: 'd30' },
          entity_label: 'Easyfit',
        },
        chart_config: { spend: {} },
        data_meta: null,
      }),
    ]).blocks;
    expect(entry).toMatchObject({ spec: null, reason: 'entity "Easyfit" carries no id' });
  });

  test('a window with neither dates nor a trailing-day label is null and names the label', () => {
    const [entry] = deriveDashboardSpec([
      block({
        block_id: 'month',
        category: 'metric_grid',
        provenance: {
          source: 'computed',
          tool: 'get_meta_overview_summary',
          period: { since: null, until: null, requested_label: 'this_month' },
          entity_label: 'act_1',
        },
        metrics: [],
      }),
    ]).blocks;
    expect(entry).toMatchObject({ spec: null, reason: expect.stringContaining('"this_month"') });
  });

  test('goal pacing falls back to its own flight dates and is derived as pacing', () => {
    const [entry] = deriveDashboardSpec([
      block({
        block_id: 'pacing',
        category: 'goal_pacing',
        provenance: {
          source: 'computed',
          tool: 'get_meta_overview_summary',
          period: null,
          entity_label: 'act_1',
        },
        period_start: '2026-09-01',
        period_end: '2026-09-30',
      }),
    ]).blocks;
    expect(entry?.spec).toMatchObject({
      range: { kind: 'custom', from: '2026-09-01', to: '2026-09-30' },
      derived: 'pacing',
    });
  });

  test('a comparison names its tool through its citations and is derived as comparison', () => {
    const [entry] = deriveDashboardSpec([
      block({
        block_id: 'cmp',
        category: 'comparison',
        provenance: {
          source: 'model',
          tool: null,
          period: { since: '2026-09-01', until: '2026-09-14', requested_label: null },
          entity_label: 'act_1',
        },
        pairs: [{ label: 'ROAS', before: 1, after: 2 }],
        citations: [
          { id: 'c1', tool: 'get_key_metrics', cache_key: null, label: '' },
          { id: 'c2', tool: 'get_key_metrics', cache_key: null, label: '' },
        ],
      }),
    ]).blocks;
    expect(entry?.spec).toMatchObject({
      tool: 'get_key_metrics',
      metrics: ['ROAS'],
      derived: 'severity',
    });
  });

  test('a block citing several tools is null: one spec cannot re-issue two calls', () => {
    const [entry] = deriveDashboardSpec([
      block({
        block_id: 'multi',
        category: 'narrative',
        provenance: null,
        body: 'x',
        citations: [
          { id: 'c1', tool: 'get_key_metrics', cache_key: null, label: '' },
          { id: 'c2', tool: 'get_top_ads', cache_key: null, label: '' },
        ],
      }),
    ]).blocks;
    expect(entry).toMatchObject({
      spec: null,
      reason: 'cites 2 tools (get_key_metrics, get_top_ads)',
    });
  });
});

describe('jainaDashboardSchema.spec', () => {
  const row = {
    id: '4bc1599a-e987-4d7a-aa90-acba967c6a09',
    brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
    name: 'Key Metrics',
    blocks: [weeklyGrid],
    created_at: '2026-09-23T00:00:00Z',
    updated_at: '2026-09-23T00:00:00Z',
  };
  test('a row read before the column exists parses with spec null', () => {
    expect(jainaDashboardSchema.parse(row).spec).toBeNull();
  });
  test('a row with a spec keeps it; a malformed spec fails the row', () => {
    const spec = deriveDashboardSpec([weeklyGrid]);
    expect(jainaDashboardSchema.parse({ ...row, spec }).spec).toEqual(spec);
    expect(
      jainaDashboardSchema.safeParse({ ...row, spec: { version: 1, blocks: [{ block_id: 'x' }] } })
        .success,
    ).toBe(false);
  });
});
