import { describe, expect, it } from 'bun:test';
import { timelineRenderFingerprint } from './canvas-render';

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
