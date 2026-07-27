import { describe, expect, test } from 'bun:test';
import {
  AUTOMATION_NODE_LIFECYCLE,
  AUTOMATION_SOURCE_LIFECYCLE,
  automationCapabilitiesResponseSchema,
} from '.';

describe('automation capability manifest', () => {
  test('keeps publish actions visible but preview-only', () => {
    expect(AUTOMATION_NODE_LIFECYCLE['action.organic_publish']).toBe('preview');
    expect(AUTOMATION_NODE_LIFECYCLE['action.email']).toBe('production');
    expect(AUTOMATION_NODE_LIFECYCLE['logic.repeat_until']).toBe('production');
    expect(AUTOMATION_NODE_LIFECYCLE['trigger.webhook']).toBe('preview');
    expect(AUTOMATION_NODE_LIFECYCLE['action.outbound_webhook']).toBe('preview');
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
