import { describe, expect, it } from 'bun:test';

import {
  extractPlannerCompositionClips,
  mergePlannerCompositionCluster,
} from './plannerComposition.server';

describe('extractPlannerCompositionClips', () => {
  it('reads ordered durable scene coordinates from an organic draft', () => {
    expect(
      extractPlannerCompositionClips({
        creative: {
          mediaSuggestion: {
            reel: {
              scenes: [
                {
                  index: 1,
                  role: 'body',
                  durationSec: 6,
                  bucket: 'brand-profile-assets',
                  clipUrl: 'brand/reel/scene-1.mp4',
                  signedClipUrl: 'https://old.example/scene-1.mp4',
                },
                {
                  index: 0,
                  role: 'hook',
                  durationSec: 4,
                  bucket: 'brand-profile-assets',
                  clipUrl: 'brand/reel/scene-0.mp4',
                  signedClipUrl: 'https://old.example/scene-0.mp4',
                },
              ],
            },
          },
        },
      }).map((clip) => clip.storagePath),
    ).toEqual(['brand/reel/scene-0.mp4', 'brand/reel/scene-1.mp4']);
  });

  it('rejects a partially generated scene set', () => {
    expect(() =>
      extractPlannerCompositionClips({
        creative: {
          mediaSuggestion: {
            reel: {
              scenes: [
                {
                  index: 0,
                  role: 'hook',
                  durationSec: 4,
                  bucket: 'brand-profile-assets',
                  clipUrl: null,
                  signedClipUrl: null,
                },
              ],
            },
          },
        },
      }),
    ).toThrow('scene clips are not ready');
  });
});

describe('mergePlannerCompositionCluster', () => {
  const cluster = {
    nodes: [
      { id: 'clip-1', type: 'video', position: { x: 500, y: 100 }, data: {} },
      { id: 'timeline-1', type: 'timelineEditor', position: { x: 800, y: 100 }, data: {} },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'clip-1',
        target: 'timeline-1',
        sourceHandle: 'video',
        targetHandle: 'media-in',
      },
    ],
    timelineNodeId: 'timeline-1',
    publishNodeId: 'publish-1',
  };

  it('preserves unrelated canvas work and appends the cluster once', () => {
    const first = mergePlannerCompositionCluster(
      [{ id: 'existing', type: 'string', position: { x: 0, y: 0 }, data: {} }],
      [],
      cluster,
    );
    const second = mergePlannerCompositionCluster(first.nodes, first.edges, cluster);

    expect(first.nodes.map((node) => node.id)).toEqual(['existing', 'clip-1', 'timeline-1']);
    expect(second).toEqual(first);
  });
});
