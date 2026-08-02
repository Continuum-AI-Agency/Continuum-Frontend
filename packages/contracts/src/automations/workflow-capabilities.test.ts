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

  // Shape, not values — the same discipline the action lifecycle test above
  // records. Which sources are production is a backend fact pinned by
  // App/automations/__tests__/source-registry.spec.ts, where it is checked
  // against the resolver wiring rather than against a copy of this constant.
  test('assigns every source kind a legal lifecycle', () => {
    const kinds = Object.keys(AUTOMATION_SOURCE_LIFECYCLE);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(['production', 'preview']).toContain(
        AUTOMATION_SOURCE_LIFECYCLE[kind as keyof typeof AUTOMATION_SOURCE_LIFECYCLE],
      );
    }
  });

  // The rollout discipline, made machine-checkable. A backend that ships a new
  // source kind before the frontend knows it must not take the whole
  // capabilities response down with it: the response is `.strict()` and the
  // frontend `.parse()`s it, so one unrecognized row would throw, leave
  // capabilities null, and silently drop every availability gate to "ready".
  test('tolerates a source kind this build does not know', () => {
    const parsed = automationCapabilitiesResponseSchema.parse({
      generatedAt: new Date().toISOString(),
      mcpReadTools: [],
      sources: [
        {
          source: 'a_kind_shipped_after_this_build',
          lifecycle: 'production',
          availability: 'ready',
          reason: null,
        },
      ],
    });

    expect(parsed.sources[0]?.source).toBe('a_kind_shipped_after_this_build');
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
