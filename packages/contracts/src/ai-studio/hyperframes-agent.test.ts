import { describe, expect, it } from 'bun:test';
import {
  HYPERFRAMES_AGENT_MODEL,
  HYPERFRAMES_AGENT_NODE_TYPE,
  hyperframesAgentEventSchema,
  hyperframesAgentNodeDataSchema,
  hyperframesAgentTurnRequestSchema,
  hyperframesBrowserReviewRequestSchema,
  hyperframesRenderCompleteRequestSchema,
  hyperframesTemporalMetricsSchema,
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
      energy: 'balanced',
      aspectRatio: '16:9',
      durationSeconds: 10,
      fps: 30,
      resolution: '1080p',
      status: 'idle',
    });
  });

  it('loads saved nodes from the previous model without changing the active model', () => {
    expect(hyperframesAgentNodeDataSchema.parse({ model: 'gemini-3.8-flash' }).model).toBe(
      HYPERFRAMES_AGENT_MODEL,
    );
  });

  it('accepts a turn containing only durable media identities', () => {
    const parsed = hyperframesAgentTurnRequestSchema.safeParse({
      canvasId: 'canvas_1',
      nodeId: 'node_1',
      prompt: 'Cut a kinetic launch video',
      assets: [
        { assetId: 'image_1', assetVersionId: 'image_version_1', kind: 'image' },
        { assetId: 'video_1', kind: 'video' },
        { assetId: 'audio_1', kind: 'audio' },
      ],
      aspectRatio: '9:16',
      durationSeconds: 15,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a 90-second launch brief but rejects 91 seconds', () => {
    const request = {
      canvasId: 'canvas_1',
      nodeId: 'node_1',
      prompt: 'Launch',
      durationSeconds: 90,
    };
    expect(hyperframesAgentTurnRequestSchema.safeParse(request).success).toBe(true);
    expect(
      hyperframesAgentTurnRequestSchema.safeParse({ ...request, durationSeconds: 91 }).success,
    ).toBe(false);
  });

  it('carries a 60 fps motion study from the node into its turn request', () => {
    const node = hyperframesAgentNodeDataSchema.parse({ fps: 60, durationSeconds: 14 });
    const turn = hyperframesAgentTurnRequestSchema.parse({
      canvasId: 'canvas_1',
      nodeId: 'node_1',
      prompt: 'A continuous UI morph on a 120 BPM beat grid',
      durationSeconds: node.durationSeconds,
      fps: node.fps,
    });
    expect(turn.fps).toBe(60);
    expect(hyperframesAgentTurnRequestSchema.safeParse({ ...turn, fps: 120 }).success).toBe(false);
  });

  it('keeps dense freeze intervals from a 90-second review', () => {
    expect(
      hyperframesTemporalMetricsSchema.safeParse({
        sampleFps: 10,
        adjacentFrameMad: [],
        sceneChanges: 0,
        duplicateFrameCount: 90,
        longestFrozenSeconds: 0.1,
        frozenIntervals: Array.from({ length: 90 }, (_, index) => ({
          startSeconds: index,
          durationSeconds: 0.1,
        })),
        entranceMotionSceneIds: [],
      }).success,
    ).toBe(true);
  });

  it('carries concise model feedback for every attached asset', () => {
    const parsed = hyperframesAgentEventSchema.parse({
      type: 'hyperframes.composition.revision',
      data: {
        revisionId: 'revision_1',
        revisionNumber: 1,
        fingerprint: 'f'.repeat(64),
        compositionStorage: { bucket: 'hyperframes-compositions', path: 'revision-1.html' },
        feedback: {
          summary: 'A three-beat kinetic introduction led by the portrait.',
          assetDecisions: [
            {
              assetId: 'image_1',
              role: 'used',
              note: 'The portrait anchors the opening and closing beats.',
            },
          ],
        },
      },
    });

    expect(parsed.data.feedback?.assetDecisions).toEqual([
      {
        assetId: 'image_1',
        role: 'used',
        note: 'The portrait anchors the opening and closing beats.',
      },
    ]);
  });

  it('keeps historical revision events without feedback replayable', () => {
    expect(
      hyperframesAgentEventSchema.safeParse({
        type: 'hyperframes.composition.revision',
        data: {
          revisionId: 'revision_1',
          revisionNumber: 1,
          fingerprint: 'f'.repeat(64),
          compositionStorage: { bucket: 'hyperframes-compositions', path: 'revision-1.html' },
        },
      }).success,
    ).toBe(true);
  });

  it('accepts asset-only completion so a saved render can be finalized after a crash', () => {
    expect(
      hyperframesRenderCompleteRequestSchema.parse({
        revisionId: 'revision_1',
        fingerprint: 'f'.repeat(64),
        assetId: 'asset_1',
      }),
    ).toEqual({
      revisionId: 'revision_1',
      fingerprint: 'f'.repeat(64),
      assetId: 'asset_1',
    });
  });

  it('carries a targeted scene revision and a durable quality summary', () => {
    const request = hyperframesAgentTurnRequestSchema.parse({
      sessionId: 'session_1',
      canvasId: 'canvas_1',
      nodeId: 'node_1',
      prompt: 'Tighten the payoff',
      revisionTarget: {
        revisionId: 'revision_1',
        sceneId: 'payoff',
        criterionId: 'storytelling',
        blocker: 'The final beat does not resolve the promise.',
      },
    });
    expect(request.revisionTarget?.sceneId).toBe('payoff');

    const node = hyperframesAgentNodeDataSchema.parse({
      qualitySummary: {
        revisionId: 'revision_2',
        gate: 'passed',
        blockers: [],
        advisoryScore: 0.92,
        criticGating: 'advisory-only',
        scenes: [],
        modelProvenance: {
          draftModelId: 'gemini-3.8-flash',
          repairModelIds: ['gemini-3.5-flash-lite'],
          criticModelId: 'gemini-3.5-flash',
        },
      },
    });
    expect(node.qualitySummary?.criticGating).toBe('advisory-only');
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
