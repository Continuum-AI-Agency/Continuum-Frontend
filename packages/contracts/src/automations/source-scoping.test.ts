// Paid scoping precedence, and the parse-time guards around it.

import { describe, expect, test } from 'bun:test';
import {
  type AutomationSourceKind,
  automationSourceKindSchema,
  automationSourceQuerySchemas,
  automationWorkflowNodeSchema,
  parseAutomationSourceQuery,
  resolveAutomationPaidAnalyticsScope,
} from '.';

const paidQuery = (overrides: Record<string, unknown> = {}) =>
  automationSourceQuerySchemas.paid_analytics.parse({ level: 'campaign', ...overrides });

const scopeOf = (
  overrides: Record<string, unknown> = {},
  node: { mode?: 'live' | 'pinned'; pinnedIds?: string[] } = {},
) =>
  resolveAutomationPaidAnalyticsScope({
    mode: node.mode ?? 'live',
    pinnedIds: node.pinnedIds ?? [],
    query: paidQuery(overrides),
  });

const sourceNode = (source: AutomationSourceKind, config: Record<string, unknown> = {}) =>
  automationWorkflowNodeSchema.safeParse({
    id: 'src',
    type: 'source',
    label: 'Data source',
    position: { x: 0, y: 0 },
    config: { source, ...config },
  });

describe('source query defaults', () => {
  // The editor calls parseAutomationSourceQuery(kind, {}) the moment a user
  // picks a kind, and re-parses a stored node's query on every render. Any
  // required field throws inside React with no user action available, which
  // reads to the user as the workspace breaking. No kind may have one; a field
  // that must be filled belongs in publish readiness, not in the parse.
  test('every source kind parses from an empty query', () => {
    const broken: string[] = [];
    for (const kind of automationSourceKindSchema.options) {
      const parsed = automationSourceQuerySchemas[kind].safeParse({});
      if (!parsed.success) broken.push(kind);
    }

    expect(broken).toEqual([]);
  });

  test('rejects an unknown key on every source kind', () => {
    for (const kind of automationSourceKindSchema.options) {
      const parsed = automationSourceQuerySchemas[kind].safeParse({ notAField: true });
      expect({ kind, ok: parsed.success }).toEqual({ kind, ok: false });
    }
  });

  test('a stored competitors query from before the widening still parses', () => {
    const parsed = parseAutomationSourceQuery('competitors', { search: 'nike', limit: 5 });
    expect(parsed).toMatchObject({ search: 'nike', limit: 5, views: ['competitors'] });
  });

  test('a stored paid_analytics query from before campaignIndexId still parses', () => {
    const parsed = parseAutomationSourceQuery('paid_analytics', {
      provider: 'meta',
      adAccountId: 'act_123',
      datePreset: 'last_30d',
      level: 'account',
      objectId: 'act_123',
      metrics: [],
      includeTopAds: false,
      topAdsLimit: 5,
    });
    expect(parsed.campaignIndexId).toBeNull();
  });
});

describe('resolveAutomationPaidAnalyticsScope', () => {
  const INDEX = '11111111-1111-4111-8111-111111111111';

  test('falls back to the whole account when nothing is scoped', () => {
    expect(scopeOf({ level: 'account' }).selection).toEqual({ kind: 'account' });
  });

  test('reads the legacy single objectId', () => {
    expect(scopeOf({ objectId: '120210000000000' }).selection).toEqual({
      kind: 'explicit',
      objectIds: ['120210000000000'],
      origin: 'object_id',
    });
  });

  test('reads node-level pinned ids as a multi-campaign scope', () => {
    expect(
      scopeOf({}, { mode: 'pinned', pinnedIds: ['120210000000001', '120210000000002'] }).selection,
    ).toEqual({
      kind: 'explicit',
      objectIds: ['120210000000001', '120210000000002'],
      origin: 'pinned',
    });
  });

  test('ignores pinned ids while mode is live', () => {
    expect(scopeOf({}, { mode: 'live', pinnedIds: ['120210000000001'] }).selection).toEqual({
      kind: 'account',
    });
  });

  test('prefers a saved index over both pins and objectId, and says what it dropped', () => {
    const scope = scopeOf(
      { campaignIndexId: INDEX, objectId: '120210000000000' },
      { mode: 'pinned', pinnedIds: ['120210000000001'] },
    );

    expect(scope.selection).toEqual({ kind: 'campaign_index', campaignIndexId: INDEX });
    expect(scope.ambiguity).toHaveLength(2);
    expect(scope.ambiguity.join(' ')).toContain('Ignored pinned campaign ids');
  });

  test('is unambiguous when only one scope is authored', () => {
    expect(scopeOf({ campaignIndexId: INDEX }).ambiguity).toEqual([]);
    expect(scopeOf({}, { mode: 'pinned', pinnedIds: ['1'] }).ambiguity).toEqual([]);
  });

  test('carries the read window and bounds through untouched', () => {
    const scope = scopeOf({ datePreset: 'last_14d', includeTopAds: true, topAdsLimit: 9 });
    expect(scope).toMatchObject({
      provider: 'meta',
      datePreset: 'last_14d',
      includeTopAds: true,
      topAdsLimit: 9,
    });
  });
});

describe('paid scoping parse guards', () => {
  test('a saved index is rejected at any level other than campaign', () => {
    const parsed = automationSourceQuerySchemas.paid_analytics.safeParse({
      level: 'adset',
      campaignIndexId: '11111111-1111-4111-8111-111111111111',
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['campaignIndexId']);
  });

  test('a node cannot set both a saved index and pinned campaign ids', () => {
    const parsed = sourceNode('paid_analytics', {
      mode: 'pinned',
      pinnedIds: ['120210000000001'],
      query: { level: 'campaign', campaignIndexId: '11111111-1111-4111-8111-111111111111' },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.message.includes('not both'))).toBe(true);
  });

  test('a node may set a saved index on its own', () => {
    expect(
      sourceNode('paid_analytics', {
        query: { level: 'campaign', campaignIndexId: '11111111-1111-4111-8111-111111111111' },
      }).success,
    ).toBe(true);
  });

  test('the new source kinds are placeable as nodes', () => {
    for (const kind of ['optimizer', 'whats_working', 'audience'] as const) {
      expect({ kind, ok: sourceNode(kind).success }).toEqual({ kind, ok: true });
    }
  });
});
