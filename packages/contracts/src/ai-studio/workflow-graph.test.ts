import { describe, expect, it } from 'bun:test';

import {
  createNodeData,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  getTargetHandleConnectionLimit,
  getVideoGeneratorTargetHandles,
  isMediaKindCompatibleWithHandle,
  isTimelineMediaHandle,
  isValidConnection,
  mediaKindForHandle,
  PUBLISH_VIDEO_INPUT_HANDLE,
  resolveVideoGeneratorModel,
  STUDIO_NODE_TYPES,
  studioNodeTypeEnum,
  studioWorkflowGraphSchema,
  TIMELINE_MEDIA_INPUT_HANDLE,
  TIMELINE_MEDIA_POOL_LIMIT,
} from './workflow-graph';

const node = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

const nodes = [
  node('string1', 'string', { value: '' }),
  node('string2', 'string', { value: '' }),
  node('image1', 'image', { image: '' }),
  node('audio1', 'audio', { audio: '' }),
  node('audio2', 'audio', { audio: '' }),
  node('doc1', 'document', { documents: [] }),
  node('doc2', 'document', { documents: [] }),
  node('nano1', 'nanoGen', { positivePrompt: '' }),
  node('video1', 'video', { video: '' }),
  node('extend1', 'extendVideo', { prompt: '' }),
  node('videoGen1', 'videoGen', { model: 'kling-omni', prompt: '' }),
  node('timeline1', 'timelineEditor', {
    items: [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
    ],
  }),
  node('publish1', 'publishToPlanner', { status: 'draft' }),
];

describe('node type enum + schema', () => {
  it('exposes the canvas node types including timelineEditor', () => {
    expect(STUDIO_NODE_TYPES).toContain('nanoGen');
    expect(STUDIO_NODE_TYPES).toContain('videoDecode');
    expect(STUDIO_NODE_TYPES).toContain('timelineEditor');
    expect(STUDIO_NODE_TYPES).toContain('publishToPlanner');
    expect(STUDIO_NODE_TYPES).toContain('omniGen');
    expect(STUDIO_NODE_TYPES).toHaveLength(15);
  });

  it('rejects an unknown node type', () => {
    expect(studioNodeTypeEnum.safeParse('magicNode').success).toBe(false);
  });

  it('parses a minimal graph and preserves free-form node data', () => {
    const parsed = studioWorkflowGraphSchema.parse({
      nodes: [node('n1', 'string', { value: 'hi', customRuntimeKey: 7 })],
      edges: [],
    });
    expect((parsed.nodes[0].data as Record<string, unknown>).customRuntimeKey).toBe(7);
  });
});

describe('handle vocabulary', () => {
  it('returns the single source handle per node type', () => {
    expect(getAllowedSourceHandles(node('s', 'string'))).toEqual(['text']);
    expect(getAllowedSourceHandles(node('i', 'image'))).toEqual(['image']);
    expect(getAllowedSourceHandles(node('n', 'nanoGen'))).toEqual(['image']);
  });

  it('returns reference-input target handles for nanoGen', () => {
    const handles = getAllowedTargetHandles(node('n', 'nanoGen'));
    expect(handles).toContain('prompt');
    expect(handles).toContain('ref-image');
    expect(handles).toContain('ref-images');
  });

  it('gates video-generator target handles by model', () => {
    // veo-3.1-fast → frames, no reference images
    expect(getVideoGeneratorTargetHandles('veo-3.1-fast')).toContain('first-frame');
    expect(getVideoGeneratorTargetHandles('veo-3.1-fast')).not.toContain('ref-images');
    // kling-omni → reference video
    expect(getVideoGeneratorTargetHandles('kling-omni')).toContain('ref-video');
  });

  it('resolves the video model from node type when data.model is absent', () => {
    expect(resolveVideoGeneratorModel(node('v', 'veoFast'))).toBe('veo-3.1-fast');
    expect(resolveVideoGeneratorModel(node('v', 'veoDirector'))).toBe('veo-3.1');
    expect(resolveVideoGeneratorModel(node('v', 'videoGen', { model: 'seedance-2.0' }))).toBe(
      'seedance-2.0',
    );
  });
});

describe('isValidConnection — type matrix', () => {
  it('allows image → string image handle', () => {
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'string1', targetHandle: 'image' },
        [],
        nodes,
      ),
    ).toBe(true);
  });

  it('rejects image → string audio handle (mismatched kind)', () => {
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'string1', targetHandle: 'audio' },
        [],
        nodes,
      ),
    ).toBe(false);
  });

  it('allows string → nanoGen prompt', () => {
    expect(
      isValidConnection(
        { source: 'string1', sourceHandle: 'text', target: 'nano1', targetHandle: 'prompt' },
        [],
        nodes,
      ),
    ).toBe(true);
  });

  it('rejects image → nanoGen prompt but allows image → nanoGen ref-image', () => {
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'nano1', targetHandle: 'prompt' },
        [],
        nodes,
      ),
    ).toBe(false);
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'nano1', targetHandle: 'ref-image' },
        [],
        nodes,
      ),
    ).toBe(true);
  });

  it('allows video → extendVideo but rejects string → extendVideo video handle', () => {
    expect(
      isValidConnection(
        { source: 'video1', sourceHandle: 'video', target: 'extend1', targetHandle: 'video' },
        [],
        nodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        { source: 'string1', sourceHandle: 'text', target: 'extend1', targetHandle: 'video' },
        [],
        nodes,
      ),
    ).toBe(false);
  });

  it('allows video → kling-omni ref-video', () => {
    expect(
      isValidConnection(
        { source: 'video1', sourceHandle: 'video', target: 'videoGen1', targetHandle: 'ref-video' },
        [],
        nodes,
      ),
    ).toBe(true);
  });

  it('allows veo-lite first-frame but rejects veo-lite ref-images', () => {
    const liteNodes = [
      ...nodes,
      node('veoLite', 'videoGen', { model: 'veo-3.1-lite', prompt: '' }),
    ];
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'veoLite', targetHandle: 'first-frame' },
        [],
        liteNodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'veoLite', targetHandle: 'ref-images' },
        [],
        liteNodes,
      ),
    ).toBe(false);
  });

  it('allows a video-producing source → publishToPlanner but rejects images/text and other handles', () => {
    expect(getAllowedTargetHandles(node('p', 'publishToPlanner'))).toEqual([
      PUBLISH_VIDEO_INPUT_HANDLE,
    ]);
    expect(getAllowedSourceHandles(node('p', 'publishToPlanner'))).toEqual([]);
    expect(
      isValidConnection(
        {
          source: 'timeline1',
          sourceHandle: 'video',
          target: 'publish1',
          targetHandle: PUBLISH_VIDEO_INPUT_HANDLE,
        },
        [],
        nodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        {
          source: 'image1',
          sourceHandle: 'image',
          target: 'publish1',
          targetHandle: PUBLISH_VIDEO_INPUT_HANDLE,
        },
        [],
        nodes,
      ),
    ).toBe(false);
    expect(
      isValidConnection(
        { source: 'video1', sourceHandle: 'video', target: 'publish1', targetHandle: 'prompt' },
        [],
        nodes,
      ),
    ).toBe(false);
  });

  it('caps publishToPlanner at a single video input', () => {
    const edges = [
      {
        id: 'e1',
        source: 'video1',
        sourceHandle: 'video',
        target: 'publish1',
        targetHandle: PUBLISH_VIDEO_INPUT_HANDLE,
      },
    ];
    expect(
      isValidConnection(
        {
          source: 'videoGen1',
          sourceHandle: 'video',
          target: 'publish1',
          targetHandle: PUBLISH_VIDEO_INPUT_HANDLE,
        },
        edges,
        nodes,
      ),
    ).toBe(false);
  });
});

describe('isValidConnection — connection limits', () => {
  it('enforces single text input on a nanoGen prompt', () => {
    const edges = [
      {
        id: 'e1',
        source: 'string1',
        sourceHandle: 'text',
        target: 'nano1',
        targetHandle: 'prompt',
      },
    ];
    expect(
      isValidConnection(
        { source: 'string2', sourceHandle: 'text', target: 'nano1', targetHandle: 'prompt' },
        edges,
        nodes,
      ),
    ).toBe(false);
  });

  it('allows multiple document inputs to a string node', () => {
    const edges = [
      {
        id: 'e1',
        source: 'doc1',
        sourceHandle: 'document',
        target: 'string1',
        targetHandle: 'document',
      },
    ];
    expect(
      isValidConnection(
        { source: 'doc2', sourceHandle: 'document', target: 'string1', targetHandle: 'document' },
        edges,
        nodes,
      ),
    ).toBe(true);
  });

  it('enforces the default 14 ref-image limit on nanoGen', () => {
    const edges = Array.from({ length: 14 }, (_, i) => ({
      id: `e${i}`,
      source: `img${i}`,
      sourceHandle: 'image',
      target: 'nano1',
      targetHandle: 'ref-image',
    }));
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'nano1', targetHandle: 'ref-image' },
        edges,
        nodes,
      ),
    ).toBe(false);
  });

  it('respects a configured maxReferenceImages on nanoGen', () => {
    const customNodes = nodes.map((n) =>
      n.id === 'nano1' ? node('nano1', 'nanoGen', { maxReferenceImages: 5 }) : n,
    );
    const edges = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      source: `img${i}`,
      sourceHandle: 'image',
      target: 'nano1',
      targetHandle: 'ref-image',
    }));
    expect(
      isValidConnection(
        { source: 'imageX', sourceHandle: 'image', target: 'nano1', targetHandle: 'ref-image' },
        edges,
        customNodes,
      ),
    ).toBe(false);
  });

  it('reports the connection limit for a known handle', () => {
    expect(getTargetHandleConnectionLimit(node('e', 'extendVideo'), 'video', [])).toBe(1);
    expect(getTargetHandleConnectionLimit(node('n', 'nanoGen'), 'ref-image', [])).toBe(14);
  });
});

describe('timelineEditor (Video Editor break-point node)', () => {
  it('identifies the media-in pool handle', () => {
    expect(isTimelineMediaHandle(TIMELINE_MEDIA_INPUT_HANDLE)).toBe(true);
    expect(isTimelineMediaHandle('media-in')).toBe(true);
    expect(isTimelineMediaHandle('clip-a')).toBe(false);
    expect(isTimelineMediaHandle('media-a')).toBe(false);
    expect(isTimelineMediaHandle(null)).toBe(false);
  });

  it('outputs video and exposes a single media-in pool handle', () => {
    expect(getAllowedSourceHandles(node('t', 'timelineEditor'))).toEqual(['video']);
    expect(getAllowedTargetHandles(nodes.find((n) => n.id === 'timeline1')!)).toEqual([
      TIMELINE_MEDIA_INPUT_HANDLE,
    ]);
  });

  it('accepts video, generated-video, and image stills on the pool handle', () => {
    expect(
      isValidConnection(
        { source: 'video1', sourceHandle: 'video', target: 'timeline1', targetHandle: 'media-in' },
        [],
        nodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        { source: 'extend1', sourceHandle: 'video', target: 'timeline1', targetHandle: 'media-in' },
        [],
        nodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'timeline1', targetHandle: 'media-in' },
        [],
        nodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        { source: 'nano1', sourceHandle: 'image', target: 'timeline1', targetHandle: 'media-in' },
        [],
        nodes,
      ),
    ).toBe(true);
  });

  it('rejects text sources and non-pool handles', () => {
    expect(
      isValidConnection(
        { source: 'string1', sourceHandle: 'text', target: 'timeline1', targetHandle: 'media-in' },
        [],
        nodes,
      ),
    ).toBe(false);
    expect(
      isValidConnection(
        { source: 'video1', sourceHandle: 'video', target: 'timeline1', targetHandle: 'prompt' },
        [],
        nodes,
      ),
    ).toBe(false);
  });

  it('admits many inputs into the pool up to the cap', () => {
    expect(
      getTargetHandleConnectionLimit(nodes.find((n) => n.id === 'timeline1')!, 'media-in', []),
    ).toBe(TIMELINE_MEDIA_POOL_LIMIT);
    const edges = [
      {
        id: 'e1',
        source: 'video1',
        sourceHandle: 'video',
        target: 'timeline1',
        targetHandle: 'media-in',
      },
    ];
    expect(
      isValidConnection(
        { source: 'extend1', sourceHandle: 'video', target: 'timeline1', targetHandle: 'media-in' },
        edges,
        nodes,
      ),
    ).toBe(true);
  });

  it('starts with an empty timeline and mp4 defaults', () => {
    const { data, style } = createNodeData('timelineEditor');
    expect((data.items as unknown[]).length).toBe(0);
    expect(data.outputFormat).toBe('mp4');
    expect(data.committed).toBe(false);
    expect(style).toEqual({ width: 320, height: 260 });
  });
});

describe('media kind ↔ handle compatibility', () => {
  it('maps target handles to the media kind they accept', () => {
    expect(mediaKindForHandle('ref-image')).toBe('image');
    expect(mediaKindForHandle('first-frame')).toBe('image');
    expect(mediaKindForHandle('ref-video')).toBe('video');
    expect(mediaKindForHandle('document')).toBe('document');
    expect(mediaKindForHandle('prompt')).toBeUndefined();
  });

  it('accepts an image asset on an image handle but not a video handle', () => {
    expect(isMediaKindCompatibleWithHandle('image', node('n', 'nanoGen'), 'ref-image')).toBe(true);
    expect(isMediaKindCompatibleWithHandle('video', node('n', 'nanoGen'), 'ref-image')).toBe(false);
  });

  it('accepts a video asset on a kling-omni ref-video handle', () => {
    expect(
      isMediaKindCompatibleWithHandle(
        'video',
        node('v', 'videoGen', { model: 'kling-omni' }),
        'ref-video',
      ),
    ).toBe(true);
  });
});

describe('createNodeData defaults', () => {
  it('mirrors the canvas nanoGen defaults', () => {
    const { data, style } = createNodeData('nanoGen');
    expect(data.model).toBe('nano-banana-2');
    expect(data.imageSize).toBe('512px');
    expect(style).toEqual({ width: 400, height: 225 });
  });

  it('derives the video model from the node type', () => {
    expect(createNodeData('veoFast').data.model).toBe('veo-3.1-fast');
    expect(createNodeData('veoDirector').data.model).toBe('veo-3.1');
  });

  it('seeds an empty string node and an aspect-ratioed image node', () => {
    expect(createNodeData('string').data.value).toBe('');
    expect(createNodeData('string').data.promptMode).toBe('enrich');
    expect(createNodeData('image').data.aspectRatio).toBe('1:1');
  });

  it('applies overrides over the defaults', () => {
    expect(createNodeData('nanoGen', { positivePrompt: 'a cat' }).data.positivePrompt).toBe(
      'a cat',
    );
  });
});
