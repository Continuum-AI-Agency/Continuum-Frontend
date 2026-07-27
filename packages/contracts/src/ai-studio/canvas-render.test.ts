import { describe, expect, it } from 'bun:test';
import {
  canvasRenderContinuationClaimRequestSchema,
  canvasRenderContinuationClaimResponseSchema,
  canvasRenderContinuationSchema,
  timelineRenderFingerprint,
} from './canvas-render';

const graph = () => ({
  nodes: [
    {
      id: 'source',
      type: 'video',
      data: {
        generatedVideoBucket: 'media-library',
        generatedVideoStoragePath: 'brand/source.mp4',
        label: 'Ignored presentation label',
      },
    },
    {
      id: 'editor',
      type: 'timelineEditor',
      data: {
        items: [{ id: 'item', order: 0, sourceNodeId: 'source' }],
        exportPresetId: '1080p',
        progress: 0.42,
      },
    },
  ],
  edges: [
    {
      id: 'edge',
      source: 'source',
      target: 'editor',
      sourceHandle: 'video',
      targetHandle: 'media-in',
    },
  ],
});

describe('timelineRenderFingerprint', () => {
  it('is stable across non-render state changes', () => {
    const before = graph();
    const after = graph();
    after.nodes[0].data.label = 'Renamed';
    after.nodes[1].data.progress = 0.9;
    after.nodes[0].data.generatedVideoUrl = 'https://example.com/refreshed-signed-url.mp4';

    expect(timelineRenderFingerprint(after, 'editor')).toBe(
      timelineRenderFingerprint(before, 'editor'),
    );
  });

  it('changes when the document or durable source changes', () => {
    const before = graph();
    const edited = graph();
    edited.nodes[1].data.exportPresetId = '720p';
    const replaced = graph();
    replaced.nodes[0].data.generatedVideoStoragePath = 'brand/replacement.mp4';

    expect(timelineRenderFingerprint(edited, 'editor')).not.toBe(
      timelineRenderFingerprint(before, 'editor'),
    );
    expect(timelineRenderFingerprint(replaced, 'editor')).not.toBe(
      timelineRenderFingerprint(before, 'editor'),
    );
  });

  it('returns null for a missing or non-timeline node', () => {
    expect(timelineRenderFingerprint(graph(), 'missing')).toBeNull();
    expect(timelineRenderFingerprint(graph(), 'source')).toBeNull();
  });
});

describe('canvas render continuation lease contracts', () => {
  it('keeps old pending continuation JSON readable while defaulting recovery fields', () => {
    const parsed = canvasRenderContinuationSchema.parse({
      jobId: 'ab71d94a-b25b-4917-a28e-6780eb427355',
      status: 'pending',
      downstreamLeafIds: ['leaf-1'],
    });
    expect(parsed.completedLeafIds).toEqual([]);
    expect(parsed.attempt).toBe(0);
  });

  it('requires a stable claimant and returns an opaque lease token when claimed', () => {
    const origin = {
      jobId: 'ab71d94a-b25b-4917-a28e-6780eb427355',
      brandProfileId: '5b90a36d-445c-4138-90ce-64f2550dfd72',
      roomId: '43b352da-68c5-44c4-b0b9-9286230a1cae',
      nodeId: 'editor',
    };
    expect(canvasRenderContinuationClaimRequestSchema.safeParse(origin).success).toBe(false);
    expect(
      canvasRenderContinuationClaimResponseSchema.safeParse({
        claimed: true,
        downstreamLeafIds: ['leaf-1'],
        completedLeafIds: [],
        claimToken: 'bb33fc0c-3ac0-4f4a-bf43-25a19f02c4ce',
        leaseExpiresAt: '2026-07-26T12:01:00.000Z',
        attempt: 1,
      }).success,
    ).toBe(true);
  });
});
