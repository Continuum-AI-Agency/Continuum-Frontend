import { describe, expect, test } from 'bun:test';
import { automationWorkflowNodeSchema } from '@continuum/contracts';
import { AUTOMATION_NODE_CATALOG, createAutomationWorkflowNode } from './automationNodeCatalog';

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

  test('marks webhook nodes as disabled coming-soon placeholders', () => {
    const webhookItems = AUTOMATION_NODE_CATALOG.flatMap((group) => group.items).filter(
      (item) => item.type === 'trigger.webhook' || item.type === 'action.outbound_webhook',
    );

    expect(webhookItems).toHaveLength(2);
    expect(webhookItems.every((item) => item.comingSoon)).toBe(true);
    expect(
      webhookItems.every(
        (item) =>
          createAutomationWorkflowNode({
            type: item.type,
            position: { x: 0, y: 0 },
          }).disabled,
      ),
    ).toBe(true);
  });
});
