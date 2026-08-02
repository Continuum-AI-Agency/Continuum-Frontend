import { describe, expect, it } from 'bun:test';
import {
  HYPERFRAMES_AGENT_MODEL,
  HYPERFRAMES_AGENT_NODE_TYPE,
  hyperframesAgentEventSchema,
  hyperframesAgentNodeDataSchema,
  hyperframesAgentTurnRequestSchema,
  hyperframesBrowserReviewRequestSchema,
} from './hyperframes-agent';

describe('HyperFrames agent contracts', () => {
  it('defaults a new node to the first benchmark model and browser render settings', () => {
    expect(
      hyperframesAgentNodeDataSchema.parse({
        label: 'HyperFrames Agent',
      }),
    ).toMatchObject({
      label: 'HyperFrames Agent',
      model: HYPERFRAMES_AGENT_MODEL,
      aspectRatio: '16:9',
      durationSeconds: 10,
      fps: 30,
      resolution: '1080p',
      status: 'idle',
    });
  });

  it('accepts a turn containing only durable media identities', () => {
    const parsed = hyperframesAgentTurnRequestSchema.safeParse({
      canvasId: 'canvas_1',
      nodeId: 'node_1',
      prompt: 'Cut a kinetic launch video',
      assets: [
        { assetId: 'image_1', kind: 'image' },
        { assetId: 'video_1', kind: 'video' },
        { assetId: 'audio_1', kind: 'audio' },
      ],
      aspectRatio: '9:16',
      durationSeconds: 15,
    });
    expect(parsed.success).toBe(true);
  });

  it('caps a turn at twenty connected media assets', () => {
    const assets = Array.from({ length: 21 }, (_, index) => ({
      assetId: `asset_${index}`,
      kind: 'image' as const,
    }));
    expect(
      hyperframesAgentTurnRequestSchema.safeParse({
        canvasId: 'canvas_1',
        nodeId: 'node_1',
        prompt: 'Use everything',
        assets,
      }).success,
    ).toBe(false);
  });

  it('validates the browser review handshake and ordered agent events', () => {
    expect(
      hyperframesBrowserReviewRequestSchema.safeParse({
        revisionId: 'revision_1',
        fingerprint: 'f'.repeat(64),
        frames: [
          {
            timestampSeconds: 1,
            storage: { bucket: 'hyperframes-compositions', path: 'review/frame-1.png' },
          },
        ],
        capabilities: { avc: true, aac: true },
      }).success,
    ).toBe(true);

    expect(
      hyperframesAgentEventSchema.safeParse({
        type: 'hyperframes.visual_review.requested',
        data: {
          revisionId: 'revision_1',
          fingerprint: 'f'.repeat(64),
          timestampsSeconds: [1, 3, 5, 7, 9],
          pass: 0,
        },
      }).success,
    ).toBe(true);
  });

  it('exports the canonical node type literal', () => {
    expect(HYPERFRAMES_AGENT_NODE_TYPE).toBe('hyperframesAgent');
  });
});
