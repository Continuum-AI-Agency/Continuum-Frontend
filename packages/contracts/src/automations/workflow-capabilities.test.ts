import { describe, expect, test } from 'bun:test';
import {
  AUTOMATION_NODE_LIFECYCLE,
  AUTOMATION_SOURCE_LIFECYCLE,
  automationCapabilitiesResponseSchema,
} from '.';

describe('automation capability manifest', () => {
  // Naming individual lifecycle values here goes stale every time an adapter is
  // wired — it did, twice. What this package can honestly assert is the SHAPE:
  // every action type carries a lifecycle, and every value is a legal member.
  // Whether a 'production' value is TRUE is a backend fact, and
  // App/automations/__tests__/action-registry.spec.ts is what pins it: that spec
  // fails unless lifecycle and the adapter's `productionWired` agree.
  test('assigns every action node type a legal lifecycle', () => {
    const actionTypes = Object.keys(AUTOMATION_NODE_LIFECYCLE).filter((type) =>
      type.startsWith('action.'),
    );
    expect(actionTypes.length).toBeGreaterThan(0);
    for (const type of actionTypes) {
      expect(['production', 'preview']).toContain(
        AUTOMATION_NODE_LIFECYCLE[type as keyof typeof AUTOMATION_NODE_LIFECYCLE],
      );
    }
  });

  test('holds trigger.webhook back until its surface is announced', () => {
    expect(AUTOMATION_NODE_LIFECYCLE['trigger.webhook']).toBe('preview');
    expect(AUTOMATION_NODE_LIFECYCLE['logic.repeat_until']).toBe('production');
  });

  test('carries per-action capability, optional so either side can deploy first', () => {
    const parsed = automationCapabilitiesResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      mcpReadTools: [],
      sources: [],
    });
    expect(parsed.actions).toBeUndefined();

    expect(
      automationCapabilitiesResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        mcpReadTools: [],
        sources: [],
        actions: [
          {
            type: 'action.organic_publish',
            lifecycle: 'preview',
            availability: 'unavailable',
            reason: 'Not connected to a production adapter yet.',
          },
        ],
      }).actions?.[0]?.type,
    ).toBe('action.organic_publish');
  });

  test('marks first-party sources production and open-world sources preview', () => {
    expect(AUTOMATION_SOURCE_LIFECYCLE.library).toBe('production');
    expect(AUTOMATION_SOURCE_LIFECYCLE.paid_analytics).toBe('production');
    expect(AUTOMATION_SOURCE_LIFECYCLE.live_web).toBe('preview');
  });

  test('validates brand-scoped availability', () => {
    expect(
      automationCapabilitiesResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        mcpReadTools: [],
        sources: [
          {
            source: 'paid_analytics',
            lifecycle: 'production',
            availability: 'needs_connection',
            reason: 'Connect a Meta ad account.',
          },
        ],
      }).sources[0]?.availability,
    ).toBe('needs_connection');
  });
});
