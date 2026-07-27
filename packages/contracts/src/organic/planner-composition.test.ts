import { describe, expect, it } from 'bun:test';

import {
  buildPlannerReelCompositionCluster,
  plannerCompositionSchema,
  preparePlannerCompositionResponseSchema,
} from './planner-composition';

const clips = [
  {
    index: 1,
    role: 'body' as const,
    durationSec: 6,
    bucket: 'brand-profile-assets',
    storagePath: 'brand/draft/scene-1.mp4',
    signedUrl: 'https://cdn.example/scene-1.mp4',
    mimeType: 'video/mp4',
    captionText: 'Show the result',
  },
  {
    index: 0,
    role: 'hook' as const,
    durationSec: 4,
    bucket: 'brand-profile-assets',
    storagePath: 'brand/draft/scene-0.mp4',
    signedUrl: 'https://cdn.example/scene-0.mp4',
    mimeType: 'video/mp4',
    captionText: 'Start here',
  },
];

describe('Planner reel composition contract', () => {
  it('represents a durable, navigable composition revision', () => {
    const parsed = plannerCompositionSchema.parse({
      id: 'composition-1',
      brandId: 'brand-1',
      draftId: 'draft-1',
      roomId: 'room-1',
      timelineNodeId: 'planner-composition:composition-1:timeline',
      publishNodeId: 'planner-composition:composition-1:publish',
      revision: 2,
      status: 'clips_ready',
      isCurrent: true,
      sourceFingerprint: 'sha256:abc',
      openHref:
        '/ai-studio?roomId=room-1&focusNodeId=planner-composition%3Acomposition-1%3Atimeline',
      returnHref: '/organic?tab=planner&draftId=draft-1&weekStartId=2026-07-20',
      createdAt: '2026-07-22T12:00:00.000Z',
      updatedAt: '2026-07-22T12:00:00.000Z',
    });

    expect(parsed.revision).toBe(2);
    expect(parsed.status).toBe('clips_ready');
  });

  it('returns the current revision plus preserved history', () => {
    const parsed = preparePlannerCompositionResponseSchema.parse({
      composition: {
        id: 'composition-1',
        brandId: 'brand-1',
        draftId: 'draft-1',
        roomId: 'room-1',
        timelineNodeId: 'timeline-1',
        publishNodeId: 'publish-1',
        revision: 1,
        status: 'clips_ready',
        isCurrent: true,
        sourceFingerprint: 'sha256:abc',
        openHref: '/ai-studio?roomId=room-1&focusNodeId=timeline-1',
        returnHref: '/organic?tab=planner&draftId=draft-1',
        createdAt: '2026-07-22T12:00:00.000Z',
        updatedAt: '2026-07-22T12:00:00.000Z',
      },
      revisions: [],
      clips,
      created: true,
    });

    expect(parsed.created).toBe(true);
    expect(parsed.clips.map((clip) => clip.index)).toEqual([1, 0]);
  });
});

describe('buildPlannerReelCompositionCluster', () => {
  it('sorts durable clip references onto one timeline and connects the Planner sink', () => {
    const graph = buildPlannerReelCompositionCluster({
      compositionId: 'composition-1',
      draftId: 'draft-1',
      weekStartId: '2026-07-20',
      platform: 'instagram',
      caption: 'A prepared reel',
      clips,
      origin: { x: 800, y: 300 },
    });

    expect(graph.nodes.map((node) => node.type)).toEqual([
      'video',
      'video',
      'timelineEditor',
      'organicPublisher',
    ]);

    const [hook, body, timeline, publish] = graph.nodes;
    expect(hook.data).toMatchObject({
      sourcePath: 'brand/draft/scene-0.mp4',
      bucket: 'brand-profile-assets',
      sourceUrl: 'https://cdn.example/scene-0.mp4',
      label: 'Scene 1 · Hook',
    });
    expect(body.data).toMatchObject({ label: 'Scene 2 · Body' });
    expect(timeline.data.items).toEqual([
      {
        id: 'planner-composition:composition-1:item:0',
        order: 0,
        sourceNodeId: hook.id,
        kind: 'video',
        durationSec: 4,
      },
      {
        id: 'planner-composition:composition-1:item:1',
        order: 1,
        sourceNodeId: body.id,
        kind: 'video',
        durationSec: 6,
        transition: { type: 'cut', durationSec: 0 },
      },
    ]);
    expect(publish.data).toMatchObject({
      targetDraftId: 'draft-1',
      weekStartId: '2026-07-20',
      plannerCompositionId: 'composition-1',
      format: 'video',
    });
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges[0]).toMatchObject({
      source: hook.id,
      target: timeline.id,
      targetHandle: 'media-in',
    });
    expect(graph.edges[2]).toMatchObject({
      source: timeline.id,
      target: publish.id,
      targetHandle: 'video-in',
    });
  });
});
