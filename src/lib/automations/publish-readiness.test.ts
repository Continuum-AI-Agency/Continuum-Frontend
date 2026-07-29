import { describe, expect, test } from 'bun:test';
import type {
  AutomationCapabilitiesResponse,
  AutomationWorkflowDefinition,
  AutomationWorkflowNode,
  TestAutomationWorkflowResponse,
} from '@continuum/contracts';
import { createAutomationWorkflowNode } from '@/components/automations/workspace/automationNodeCatalog';
import {
  collectPublishBlockers,
  disableBlockingNodes,
  summarizeTestFreshness,
} from './publish-readiness';

const node = (type: AutomationWorkflowNode['type'], id = `node-${type}`): AutomationWorkflowNode =>
  createAutomationWorkflowNode({ type, position: { x: 0, y: 0 }, id });

const definitionOf = (...nodes: AutomationWorkflowNode[]): AutomationWorkflowDefinition => ({
  schemaVersion: 3,
  nodes,
  edges: [],
  execution: { maxRunSeconds: 900, maxParallelNodes: 4 },
});

const capabilities = (
  overrides: Partial<AutomationCapabilitiesResponse> = {},
): AutomationCapabilitiesResponse => ({
  sources: [],
  mcpReadTools: [],
  generatedAt: '2026-07-28T00:00:00.000Z',
  ...overrides,
});

const configuredPublishNode = (id = 'publish'): AutomationWorkflowNode => {
  const publish = node('action.organic_publish', id);
  return publish.type === 'action.organic_publish'
    ? { ...publish, config: { ...publish.config, accountId: '17841400000000000' } }
    : publish;
};

const emailNode = (id = 'email'): AutomationWorkflowNode => node('action.email', id);

// The factory ships preview-lifecycle nodes disabled. A user who deliberately
// re-enables one is the case these blockers exist for.
const enabled = (candidate: AutomationWorkflowNode): AutomationWorkflowNode => ({
  ...candidate,
  disabled: false,
});

const sourceNodeOf = (kind: 'library' | 'live_web', id = 'source'): AutomationWorkflowNode => {
  const base = node('source', id);
  return base.type === 'source' ? { ...base, config: { ...base.config, source: kind } } : base;
};

describe('collectPublishBlockers — capability blockers', () => {
  test('blocks an enabled action the server reports unavailable, surfacing its reason', () => {
    const readiness = collectPublishBlockers({
      definition: definitionOf(configuredPublishNode()),
      capabilities: capabilities({
        actions: [
          {
            type: 'action.organic_publish',
            lifecycle: 'production',
            availability: 'unavailable',
            reason: 'Instagram publishing is not enabled for this brand.',
          },
        ],
      }),
    });

    expect(readiness.blockers).toHaveLength(1);
    expect(readiness.blockers[0]?.code).toBe('capability_unavailable');
    expect(readiness.blockers[0]?.nodeId).toBe('publish');
    expect(readiness.blockers[0]?.detail).toBe(
      'Instagram publishing is not enabled for this brand.',
    );
    expect(readiness.blockingNodeIds).toEqual(['publish']);
    expect(readiness.isClean).toBe(false);
  });

  test('blocks an enabled action the server reports as preview', () => {
    const readiness = collectPublishBlockers({
      definition: definitionOf(emailNode()),
      capabilities: capabilities({
        actions: [
          {
            type: 'action.email',
            lifecycle: 'preview',
            availability: 'ready',
            reason: null,
          },
        ],
      }),
    });

    expect(readiness.blockers.map((blocker) => blocker.code)).toEqual(['capability_preview']);
  });

  test('does not block a preview action that is disabled on the canvas', () => {
    const disabled: AutomationWorkflowNode = { ...emailNode(), disabled: true };

    const readiness = collectPublishBlockers({
      definition: definitionOf(disabled),
      capabilities: capabilities({
        actions: [
          { type: 'action.email', lifecycle: 'preview', availability: 'unavailable', reason: null },
        ],
      }),
    });

    expect(readiness.blockers).toEqual([]);
    expect(readiness.isClean).toBe(true);
  });

  test('trusts the server over the bundled constant when the server says an action is fine', () => {
    const readiness = collectPublishBlockers({
      definition: definitionOf(emailNode()),
      capabilities: capabilities({
        actions: [
          { type: 'action.email', lifecycle: 'production', availability: 'ready', reason: null },
        ],
      }),
    });

    expect(readiness.blockers).toEqual([]);
  });

  test('blocks a source the server calls unavailable but never a merely bundled-preview source', () => {
    const bundledPreview = collectPublishBlockers({
      definition: definitionOf(sourceNodeOf('live_web')),
      capabilities: capabilities(),
    });
    expect(bundledPreview.blockers).toEqual([]);

    const serverUnavailable = collectPublishBlockers({
      definition: definitionOf(sourceNodeOf('live_web')),
      capabilities: capabilities({
        sources: [
          {
            source: 'live_web',
            lifecycle: 'preview',
            availability: 'unavailable',
            reason: 'Live web reads are off.',
          },
        ],
      }),
    });
    expect(serverUnavailable.blockers.map((blocker) => blocker.code)).toEqual([
      'capability_unavailable',
    ]);
  });
});

describe('collectPublishBlockers — unset sentinels and bindings', () => {
  test('leaves a placeholder alone while the factory-disabled preview node stays disabled', () => {
    const readiness = collectPublishBlockers({
      definition: definitionOf(node('integration.query')),
      capabilities: capabilities(),
    });

    expect(node('integration.query').disabled).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  test('blocks every placeholder the node factory left behind', () => {
    const readiness = collectPublishBlockers({
      definition: definitionOf(enabled(node('integration.query')), node('action.paid_optimizer')),
      capabilities: capabilities(),
    });

    // `action.paid_optimizer` no longer ships a sentinel: it is portfolio-addressed
    // now, and the factory seeds `portfolioId: null` rather than a placeholder
    // string that satisfies `.min(1)` and only fails at run time.
    const unset = readiness.blockers.filter((blocker) => blocker.code === 'unset_configuration');
    expect(unset).toHaveLength(2);
    expect(unset.map((blocker) => blocker.nodeId).sort()).toEqual([
      'node-integration.query',
      'node-integration.query',
    ]);
    expect(readiness.blockingNodeIds).toHaveLength(1);
  });

  test('stops flagging a placeholder once a real value replaces it', () => {
    const readiness = collectPublishBlockers({
      definition: definitionOf(configuredPublishNode()),
      capabilities: capabilities(),
    });

    expect(readiness.blockers).toEqual([]);
    expect(readiness.isClean).toBe(true);
  });

  test('blocks webhook nodes until their managed binding is minted', () => {
    const readiness = collectPublishBlockers({
      definition: definitionOf(enabled(node('trigger.webhook')), node('action.outbound_webhook')),
      capabilities: capabilities(),
    });

    expect(readiness.blockers.map((blocker) => blocker.code)).toEqual([
      'missing_webhook_binding',
      'missing_webhook_binding',
    ]);
  });

  test('clears the webhook blockers once endpoint and destination ids exist', () => {
    const inbound = enabled(node('trigger.webhook'));
    const outbound = node('action.outbound_webhook');
    const bound = definitionOf(
      inbound.type === 'trigger.webhook'
        ? { ...inbound, config: { ...inbound.config, endpointId: 'endpoint-1' } }
        : inbound,
      outbound.type === 'action.outbound_webhook'
        ? { ...outbound, config: { ...outbound.config, destinationId: 'destination-1' } }
        : outbound,
    );

    expect(
      collectPublishBlockers({ definition: bound, capabilities: capabilities() }).blockers,
    ).toEqual([]);
  });
});

describe('collectPublishBlockers — warnings', () => {
  test('reports needs_connection as a warning, not a blocker, with the server reason', () => {
    const readiness = collectPublishBlockers({
      definition: definitionOf(sourceNodeOf('library'), configuredPublishNode()),
      capabilities: capabilities({
        sources: [
          {
            source: 'library',
            lifecycle: 'production',
            availability: 'needs_connection',
            reason: 'Connect a Library account.',
          },
        ],
        actions: [
          {
            type: 'action.organic_publish',
            lifecycle: 'production',
            availability: 'needs_connection',
            reason: 'Reconnect Instagram.',
          },
        ],
      }),
    });

    expect(readiness.blockers).toEqual([]);
    expect(readiness.warnings).toHaveLength(2);
    expect(readiness.warnings.map((warning) => warning.detail)).toEqual([
      'Connect a Library account.',
      'Reconnect Instagram.',
    ]);
    expect(readiness.isClean).toBe(false);
  });

  test('is clean for an empty or absent definition', () => {
    expect(collectPublishBlockers({ definition: null }).isClean).toBe(true);
    expect(collectPublishBlockers({ definition: undefined }).blockers).toEqual([]);
  });
});

describe('disableBlockingNodes', () => {
  test('flips only the blocking nodes and leaves the rest of the graph intact', () => {
    const definition: AutomationWorkflowDefinition = {
      ...definitionOf(enabled(node('integration.query')), configuredPublishNode(), emailNode()),
      edges: [
        {
          id: 'edge-1',
          source: 'node-integration.query',
          sourceHandle: 'output',
          target: 'publish',
          targetHandle: 'input',
        },
      ],
      viewport: { x: 10, y: 20, zoom: 1.5 },
    };

    const next = disableBlockingNodes({
      definition,
      blockingNodeIds: ['node-integration.query'],
    });

    expect(next.nodes.find((entry) => entry.id === 'node-integration.query')?.disabled).toBe(true);
    expect(next.nodes.find((entry) => entry.id === 'publish')?.disabled).toBe(false);
    expect(next.edges).toEqual(definition.edges);
    expect(next.viewport).toEqual(definition.viewport);
    expect(next.nodes).toHaveLength(3);
  });

  test('makes the graph clean when applied to the collected blocking ids', () => {
    const definition = definitionOf(enabled(node('integration.query')), configuredPublishNode());
    const before = collectPublishBlockers({ definition, capabilities: capabilities() });

    const after = collectPublishBlockers({
      definition: disableBlockingNodes({
        definition,
        blockingNodeIds: before.blockingNodeIds,
      }),
      capabilities: capabilities(),
    });

    expect(before.blockers.length).toBeGreaterThan(0);
    expect(after.blockers).toEqual([]);
    expect(after.isClean).toBe(true);
  });

  test('returns the same definition when nothing would change', () => {
    const definition = definitionOf(configuredPublishNode());

    expect(disableBlockingNodes({ definition, blockingNodeIds: [] })).toBe(definition);
    expect(disableBlockingNodes({ definition, blockingNodeIds: ['missing'] })).toBe(definition);
  });
});

describe('summarizeTestFreshness', () => {
  const testResult = (
    statuses: Array<'completed' | 'failed' | 'skipped'>,
  ): TestAutomationWorkflowResponse =>
    ({
      runId: 'run-1',
      validation: { ok: true, issues: [], definitionHash: 'hash' },
      nodeExecutions: statuses.map((status, index) => ({
        nodeId: `node-${index}`,
        nodeType: 'agent',
        status,
        selectedHandle: 'output',
        errorMessage: null,
        durationMs: 5,
      })),
      evidence: [],
      checks: [],
      actionReceipts: [],
    }) as unknown as TestAutomationWorkflowResponse;

  test('treats a missing local result as unknown, never as a failure', () => {
    expect(summarizeTestFreshness(null).state).toBe('unknown');
    expect(summarizeTestFreshness(undefined).state).toBe('unknown');
  });

  test('reports a failing test with its failed node count', () => {
    const summary = summarizeTestFreshness(testResult(['completed', 'failed', 'failed']));

    expect(summary.state).toBe('failing');
    expect(summary.message).toContain('2 nodes');
  });

  test('reports a passing test', () => {
    const summary = summarizeTestFreshness(testResult(['completed', 'skipped']));

    expect(summary.state).toBe('passing');
    expect(summary.message).toContain('2 nodes');
  });
});
