import { describe, expect, test } from 'bun:test';
import {
  AUTOMATION_NODE_LIFECYCLE,
  AUTOMATION_SOURCE_LIFECYCLE,
  type AutomationCapabilitiesResponse,
  type AutomationWorkflowNode,
} from '@continuum/contracts';
import { createAutomationWorkflowNode } from '@/components/automations/workspace/automationNodeCatalog';
import {
  AUTOMATION_UNSET_CONFIG_SENTINELS,
  findUnsetConfigFields,
  hasUnsetConfigField,
  resolveNodeLifecycle,
} from './capability-lifecycle';

const node = (type: AutomationWorkflowNode['type'], id = `node-${type}`): AutomationWorkflowNode =>
  createAutomationWorkflowNode({ type, position: { x: 0, y: 0 }, id });

const capabilities = (
  overrides: Partial<AutomationCapabilitiesResponse> = {},
): AutomationCapabilitiesResponse => ({
  sources: [],
  mcpReadTools: [],
  generatedAt: '2026-07-28T00:00:00.000Z',
  ...overrides,
});

describe('resolveNodeLifecycle', () => {
  test('prefers the server action entry over the bundled constant', () => {
    const publish = node('action.organic_publish');
    expect(AUTOMATION_NODE_LIFECYCLE['action.organic_publish']).toBe('production');

    const resolved = resolveNodeLifecycle({
      node: publish,
      capabilities: capabilities({
        actions: [
          {
            type: 'action.organic_publish',
            lifecycle: 'preview',
            availability: 'unavailable',
            reason: 'Publishing is disabled for this brand.',
          },
        ],
      }),
    });

    expect(resolved).toEqual({
      lifecycle: 'preview',
      availability: 'unavailable',
      reason: 'Publishing is disabled for this brand.',
      origin: 'server',
    });
  });

  test('falls back to the bundled constant when the optional actions field is absent', () => {
    const resolved = resolveNodeLifecycle({
      node: node('action.paid_optimizer'),
      capabilities: capabilities(),
    });

    expect(resolved).toEqual({
      lifecycle: AUTOMATION_NODE_LIFECYCLE['action.paid_optimizer'],
      availability: 'ready',
      reason: null,
      origin: 'bundled',
    });
  });

  test('falls back to the bundled constant when the action list omits this action', () => {
    const resolved = resolveNodeLifecycle({
      node: node('action.email'),
      capabilities: capabilities({
        actions: [
          {
            type: 'action.library_save',
            lifecycle: 'production',
            availability: 'ready',
            reason: null,
          },
        ],
      }),
    });

    expect(resolved.origin).toBe('bundled');
    expect(resolved.lifecycle).toBe(AUTOMATION_NODE_LIFECYCLE['action.email']);
  });

  test('falls back to the bundled constant when capabilities have not loaded', () => {
    expect(resolveNodeLifecycle({ node: node('agent') }).origin).toBe('bundled');
    expect(resolveNodeLifecycle({ node: node('agent'), capabilities: null }).lifecycle).toBe(
      AUTOMATION_NODE_LIFECYCLE.agent,
    );
  });

  test('resolves a source node from the server source list, keyed on the configured source', () => {
    const live = node('source');
    const webSource: AutomationWorkflowNode =
      live.type === 'source'
        ? { ...live, config: { ...live.config, source: 'live_web' } }
        : (live as AutomationWorkflowNode);

    const resolved = resolveNodeLifecycle({
      node: webSource,
      capabilities: capabilities({
        sources: [
          {
            source: 'live_web',
            lifecycle: 'production',
            availability: 'needs_connection',
            reason: 'Connect a web search provider.',
          },
          { source: 'library', lifecycle: 'production', availability: 'ready', reason: null },
        ],
      }),
    });

    expect(resolved).toEqual({
      lifecycle: 'production',
      availability: 'needs_connection',
      reason: 'Connect a web search provider.',
      origin: 'server',
    });
  });

  test('falls back to the bundled source lifecycle when the server omits that source', () => {
    const live = node('source');
    const competitors: AutomationWorkflowNode =
      live.type === 'source'
        ? { ...live, config: { ...live.config, source: 'competitors' } }
        : (live as AutomationWorkflowNode);

    const resolved = resolveNodeLifecycle({ node: competitors, capabilities: capabilities() });

    expect(resolved.origin).toBe('bundled');
    expect(resolved.lifecycle).toBe(AUTOMATION_SOURCE_LIFECYCLE.competitors);
  });

  test('never reads the action list for a non-action node', () => {
    const resolved = resolveNodeLifecycle({
      node: node('logic.parallel'),
      capabilities: capabilities({
        actions: [
          {
            type: 'action.email',
            lifecycle: 'preview',
            availability: 'unavailable',
            reason: 'nope',
          },
        ],
      }),
    });

    expect(resolved.origin).toBe('bundled');
    expect(resolved.lifecycle).toBe(AUTOMATION_NODE_LIFECYCLE['logic.parallel']);
  });
});

describe('unset config sentinels', () => {
  test('flags every placeholder the node factory ships', () => {
    const flagged = new Map<string, string[]>();
    for (const item of [
      'integration.query',
      'mcp.read',
      'action.organic_publish',
      'action.paid_optimizer',
    ] as const) {
      flagged.set(
        item,
        findUnsetConfigFields(node(item)).map((field) => field.sentinel),
      );
    }

    expect(flagged.get('integration.query')).toEqual(
      expect.arrayContaining(['select-connection', 'pending-schema-v1']),
    );
    expect(flagged.get('mcp.read')).toEqual(['pending-schema-v1']);
    expect(flagged.get('action.organic_publish')).toEqual(['select-connected-account']);
    // `action.paid_optimizer` is portfolio-addressed and seeds `portfolioId: null`,
    // so it ships no placeholder for this to catch. A null is honestly unset;
    // 'select-paid-target' satisfied `.min(1)` and published happily.
    expect(flagged.get('action.paid_optimizer')).toEqual([]);
  });

  test('reports the dotted path of each placeholder', () => {
    const fields = findUnsetConfigFields(node('integration.query'));

    expect(fields).toEqual(
      expect.arrayContaining([
        { path: 'connectionId', sentinel: 'select-connection' },
        { path: 'schemaHash', sentinel: 'pending-schema-v1' },
      ]),
    );
  });

  test('finds a placeholder nested inside arrays and objects', () => {
    const report = node('report');
    const nested: AutomationWorkflowNode =
      report.type === 'report'
        ? {
            ...report,
            config: {
              ...report.config,
              frontMatter: { connections: [{ id: 'select-connection' }] },
            },
          }
        : report;

    expect(findUnsetConfigFields(nested)).toEqual([
      { path: 'frontMatter.connections.0.id', sentinel: 'select-connection' },
    ]);
  });

  test('leaves a configured node clean', () => {
    const publish = node('action.organic_publish');
    const configured: AutomationWorkflowNode =
      publish.type === 'action.organic_publish'
        ? { ...publish, config: { ...publish.config, accountId: '17841400000000000' } }
        : publish;

    expect(hasUnsetConfigField(configured)).toBe(false);
    expect(hasUnsetConfigField(node('action.email'))).toBe(false);
  });

  test('exposes the sentinel list the factory actually uses', () => {
    expect([...AUTOMATION_UNSET_CONFIG_SENTINELS].sort()).toEqual([
      'pending-schema-v1',
      'select-connected-account',
      'select-connection',
      'select-paid-target',
    ]);
  });
});
