import { describe, expect, it } from 'bun:test';
import {
  campaignCanvasActionsEnvelopeSchema,
  extractCampaignCanvasActionsEnvelope,
} from './agent-actions';

describe('campaign canvas action envelope parsing', () => {
  it('normalizes canonical and snake_case action payload variants', () => {
    const parsed = campaignCanvasActionsEnvelopeSchema.parse({
      kind: 'campaign_canvas_actions',
      brandId: 'brand_123',
      userId: 'user_123',
      actions: [
        {
          type: 'CREATE_NODE',
          payload: {
            type: 'campaign',
            id: 'campaign_new_1',
            data: { name: 'New Sales Campaign' },
          },
        },
        {
          type: 'CONNECT_NODES',
          payload: {
            source_id: 'campaign_new_1',
            target_id: 'adset_new_1',
          },
        },
      ],
    });

    expect(parsed.actions[0].type).toBe('CREATE_NODE');
    if (parsed.actions[0].type === 'CREATE_NODE') {
      expect(parsed.actions[0].payload.nodeType).toBe('campaign');
      expect(parsed.actions[0].payload.clientNodeId).toBe('campaign_new_1');
    }

    expect(parsed.actions[1].type).toBe('CONNECT_NODES');
    if (parsed.actions[1].type === 'CONNECT_NODES') {
      expect(parsed.actions[1].payload.sourceId).toBe('campaign_new_1');
      expect(parsed.actions[1].payload.targetId).toBe('adset_new_1');
    }
  });

  it('extracts nested envelopes from response payloads', () => {
    const envelope = extractCampaignCanvasActionsEnvelope({
      output: {
        data: {
          kind: 'campaign_canvas_actions',
          brandId: 'brand_456',
          userId: 'user_456',
          actions: [
            {
              type: 'CREATE_NODE',
              payload: {
                nodeType: 'ad-set',
                data: { name: 'Ad Set 1' },
              },
            },
          ],
        },
      },
    });

    expect(envelope).not.toBeNull();
    expect(envelope?.brandId).toBe('brand_456');
    expect(envelope?.actions.length).toBe(1);
  });
});
