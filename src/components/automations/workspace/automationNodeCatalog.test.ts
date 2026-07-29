import { describe, expect, test } from 'bun:test';
import { AUTOMATION_NODE_LIFECYCLE, automationWorkflowNodeSchema } from '@continuum/contracts';
import {
  AUTOMATION_NODE_CATALOG,
  automationNodeNeedsBinding,
  createAutomationWorkflowNode,
} from './automationNodeCatalog';

describe('automation node catalog', () => {
  test('exposes every workflow node type exactly once', () => {
    const types = AUTOMATION_NODE_CATALOG.flatMap((group) => group.items.map((item) => item.type));

    expect(types).toHaveLength(24);
    expect(new Set(types).size).toBe(24);
    expect(types).toContain('logic.repeat_until');
  });

  test('constructs a contract-valid default for every node type', () => {
    for (const item of AUTOMATION_NODE_CATALOG.flatMap((group) => group.items)) {
      const node = createAutomationWorkflowNode({
        type: item.type,
        position: { x: 120, y: 240 },
        id: `test-${item.type}`,
      });

      expect(automationWorkflowNodeSchema.safeParse(node).success).toBe(true);
    }
  });

  test('creates a production outbound webhook node enabled, with no coming-soon copy', () => {
    const item = AUTOMATION_NODE_CATALOG.flatMap((group) => group.items).find(
      (candidate) => candidate.type === 'action.outbound_webhook',
    );

    expect(item).toBeDefined();
    expect(item?.description).not.toContain('Coming soon');
    expect(AUTOMATION_NODE_LIFECYCLE['action.outbound_webhook']).toBe('production');

    const node = createAutomationWorkflowNode({
      type: 'action.outbound_webhook',
      position: { x: 0, y: 0 },
      id: 'outbound',
    });

    expect(node.disabled).toBe(false);
    expect(automationWorkflowNodeSchema.safeParse(node).success).toBe(true);
  });

  test('describes the inbound webhook trigger by what it does, not by its absence', () => {
    const item = AUTOMATION_NODE_CATALOG.flatMap((group) => group.items).find(
      (candidate) => candidate.type === 'trigger.webhook',
    );

    expect(item).toBeDefined();
    expect(item?.description).not.toContain('Coming soon');
  });

  test('reports webhook nodes as needing a managed binding until one is attached', () => {
    const outbound = createAutomationWorkflowNode({
      type: 'action.outbound_webhook',
      position: { x: 0, y: 0 },
      id: 'outbound',
    });
    const inbound = createAutomationWorkflowNode({
      type: 'trigger.webhook',
      position: { x: 0, y: 0 },
      id: 'inbound',
    });
    const email = createAutomationWorkflowNode({
      type: 'action.email',
      position: { x: 0, y: 0 },
      id: 'email',
    });

    expect(automationNodeNeedsBinding(outbound)).toBe(true);
    expect(automationNodeNeedsBinding(inbound)).toBe(true);
    expect(automationNodeNeedsBinding(email)).toBe(false);

    expect(
      automationNodeNeedsBinding({
        ...outbound,
        config: { ...outbound.config, destinationId: 'destination-1' },
      }),
    ).toBe(false);
    expect(
      automationNodeNeedsBinding({
        ...inbound,
        config: { ...inbound.config, endpointId: 'endpoint-1' },
      }),
    ).toBe(false);
  });
});
