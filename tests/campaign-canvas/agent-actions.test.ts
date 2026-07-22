import { describe, expect, test } from 'bun:test';

import { extractCampaignCanvasActionsEnvelope } from '@/lib/campaign-canvas/agent-actions';

describe('campaign canvas agent action extraction', () => {
  test('extracts a direct campaign canvas actions envelope', () => {
    const parsed = extractCampaignCanvasActionsEnvelope({
      kind: 'campaign_canvas_actions',
      brandId: 'brand_123',
      userId: 'user_123',
      sessionId: 'session_123',
      actions: [
        {
          type: 'CREATE_NODE',
          payload: {
            nodeType: 'ad-set',
            data: { label: 'Prospecting' },
            position: { x: 200, y: 160 },
          },
        },
      ],
    });

    expect(parsed).toBeTruthy();
    expect(parsed?.brandId).toBe('brand_123');
    expect(parsed?.userId).toBe('user_123');
    expect(parsed?.actions).toHaveLength(1);
    expect(parsed?.actions[0]?.type).toBe('CREATE_NODE');
  });

  test('extracts nested envelope shapes from tool outputs', () => {
    const parsed = extractCampaignCanvasActionsEnvelope({
      result: {
        output: {
          campaign_canvas_actions: {
            kind: 'campaign_canvas_actions',
            brandId: 'brand_456',
            userId: 'user_456',
            actions: [
              {
                type: 'UPDATE_NODE',
                payload: {
                  nodeId: 'adset-1',
                  data: { bidStrategy: 'COST_CAP' },
                },
              },
              {
                type: 'CONNECT_NODES',
                payload: {
                  sourceId: 'adset-1',
                  targetId: 'audience-1',
                },
              },
            ],
          },
        },
      },
    });

    expect(parsed).toBeTruthy();
    expect(parsed?.brandId).toBe('brand_456');
    expect(parsed?.actions).toHaveLength(2);
    expect(parsed?.actions[0]?.type).toBe('UPDATE_NODE');
    expect(parsed?.actions[1]?.type).toBe('CONNECT_NODES');
  });

  test('returns null for invalid payloads', () => {
    const parsed = extractCampaignCanvasActionsEnvelope({
      output: {
        kind: 'campaign_canvas_actions',
        brandId: 'brand_789',
        actions: [],
      },
    });

    expect(parsed).toBeNull();
  });
});
