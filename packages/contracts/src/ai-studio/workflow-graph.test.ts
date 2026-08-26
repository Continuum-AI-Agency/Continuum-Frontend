import { describe, expect, it } from 'bun:test';

import { WATERMARK_LOGO_VARIABLE_KEY } from './api-renders';
import {
  batchLockedType,
  coerceNodeConfig,
  createNodeData,
  DRAFT_INPUT_HANDLE,
  DRAFT_OUTPUT_HANDLE,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  getImageVariationHandleId,
  getStudioPortMetadata,
  getTargetHandleConnectionLimit,
  getVideoGeneratorImageReferenceHandle,
  getVideoGeneratorProvider,
  getVideoGeneratorReferenceMode,
  getVideoGeneratorReferenceModes,
  getVideoGeneratorTargetHandles,
  isMediaKindCompatibleWithHandle,
  isTimelineMediaHandle,
  isValidConnection,
  mediaKindForHandle,
  PLANNER_DRAFT_TEXT_INPUT_HANDLE,
  PUBLISH_IMAGE_INPUT_HANDLE,
  PUBLISH_VIDEO_INPUT_HANDLE,
  resolveVideoGeneratorModel,
  resolveVideoGeneratorReferenceMode,
  STUDIO_NODE_TYPES,
  studioNodeTypeEnum,
  studioWorkflowGraphSchema,
  supportsVideoGeneratorFrameInputs,
  supportsVideoGeneratorReferenceImages,
  TIMELINE_MEDIA_INPUT_HANDLE,
  TIMELINE_MEDIA_POOL_LIMIT,
  VIDEO_GENERATOR_MODEL_GROUPS,
  VIDEO_GENERATOR_MODELS,
  VIDEO_GENERATOR_PROVIDER_LABELS,
  VIDEO_GENERATOR_REFERENCE_MODE_LABELS,
  validateConnection,
  variationIndexFromHandle,
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
  node('publish1', 'plannerDraft', { format: 'video' }),
  node('hyperframes1', 'hyperframesAgent', { prompt: '' }),
];

describe('node type enum + schema', () => {
  it('exposes the canvas node types including timelineEditor', () => {
    expect(STUDIO_NODE_TYPES).toContain('nanoGen');
    expect(STUDIO_NODE_TYPES).toContain('videoDecode');
    expect(STUDIO_NODE_TYPES).toContain('timelineEditor');
    expect(STUDIO_NODE_TYPES).toContain('plannerDraft');
    expect(STUDIO_NODE_TYPES).toContain('paidPublisher');
    expect(STUDIO_NODE_TYPES).toContain('hyperframesAgent');
    expect(STUDIO_NODE_TYPES).toContain('frameExtract');
    expect(STUDIO_NODE_TYPES).not.toContain('videoEditor');
    expect(STUDIO_NODE_TYPES).toContain('omniGen');
    expect(STUDIO_NODE_TYPES).toContain('organicPublish');
    // `note` was canvas-only until Canvas V3 — a canvas carrying one failed validation.
    expect(STUDIO_NODE_TYPES).toContain('note');
    for (const type of [
      'action',
      'batch',
      'router',
      'export',
      'layerEditor',
      'element',
      'designRef',
    ]) {
      expect(STUDIO_NODE_TYPES).toContain(type);
    }
    expect(STUDIO_NODE_TYPES).toHaveLength(27);
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
    expect(getAllowedSourceHandles(node('f', 'frameExtract'))).toEqual(['image']);
    expect(getAllowedTargetHandles(node('f', 'frameExtract'))).toEqual(['video']);
  });

  it('gives an image generator one source handle per variation, first one unnumbered', () => {
    // The bare `image` id must stay first: it is what every pre-variation graph
    // wired to, and it is what resolveConnection auto-picks.
    expect(getAllowedSourceHandles(node('n', 'nanoGen'))).toEqual([
      'image',
      'image-1',
      'image-2',
      'image-3',
    ]);
  });

  it('round-trips a variation index through its handle id', () => {
    expect(getImageVariationHandleId(0)).toBe('image');
    expect(getImageVariationHandleId(2)).toBe('image-2');
    expect(variationIndexFromHandle('image')).toBe(0);
    expect(variationIndexFromHandle('image-2')).toBe(2);
  });

  it('resolves an unknown, missing, or out-of-range variation handle to the first variation', () => {
    expect(variationIndexFromHandle(undefined)).toBe(0);
    expect(variationIndexFromHandle(null)).toBe(0);
    expect(variationIndexFromHandle('ref-image')).toBe(0);
    expect(variationIndexFromHandle('image-')).toBe(0);
    expect(variationIndexFromHandle('image-nope')).toBe(0);
    expect(variationIndexFromHandle('image-9')).toBe(0);
    expect(variationIndexFromHandle('image--1')).toBe(0);
  });

  it('accepts a numbered variation edge out of an image generator', () => {
    const workflowNodes = [node('gen', 'nanoGen'), node('consumer', 'nanoGen')];
    const result = isValidConnection(
      { source: 'gen', sourceHandle: 'image-2', target: 'consumer', targetHandle: 'ref-image' },
      [],
      workflowNodes,
    );
    expect(result).toBe(true);
  });

  it('connects a video to frame extraction and the extracted image to frame/reference inputs', () => {
    const workflowNodes = [
      node('clip', 'video'),
      node('frame', 'frameExtract'),
      node('next', 'videoGen', { model: 'seedance-2.0' }),
    ];

    expect(
      isValidConnection(
        {
          source: 'clip',
          sourceHandle: 'video',
          target: 'frame',
          targetHandle: 'video',
        },
        [],
        workflowNodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        {
          source: 'frame',
          sourceHandle: 'image',
          target: 'next',
          targetHandle: 'first-frame',
        },
        [],
        workflowNodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        {
          source: 'frame',
          sourceHandle: 'image',
          target: 'next',
          targetHandle: 'ref-images',
        },
        [],
        workflowNodes,
      ),
    ).toBe(true);
  });

  it('returns reference-input target handles for nanoGen', () => {
    const handles = getAllowedTargetHandles(node('n', 'nanoGen'));
    expect(handles).toContain('prompt');
    expect(handles).toContain('ref-image');
    expect(handles).toContain('ref-images');
  });

  it('exposes typed HyperFrames inputs and a video output', () => {
    expect(getAllowedTargetHandles(node('hf', 'hyperframesAgent'))).toEqual([
      'prompt-in',
      'image-in',
      'video-in',
      'audio-in',
    ]);
    expect(getAllowedSourceHandles(node('hf', 'hyperframesAgent'))).toEqual(['video']);
  });

  it('accepts prompt, image, video, and audio inputs for HyperFrames', () => {
    for (const [source, sourceHandle, targetHandle] of [
      ['string1', 'text', 'prompt-in'],
      ['image1', 'image', 'image-in'],
      ['video1', 'video', 'video-in'],
      ['audio1', 'audio', 'audio-in'],
    ] as const) {
      expect(
        isValidConnection(
          { source, sourceHandle, target: 'hyperframes1', targetHandle },
          [],
          nodes,
        ),
      ).toBe(true);
    }
  });

  it('caps HyperFrames media inputs at twenty total connections', () => {
    const edges = Array.from({ length: 20 }, (_, index) => ({
      id: `edge_${index}`,
      source: `image_${index}`,
      target: 'hyperframes1',
      sourceHandle: 'image',
      targetHandle: 'image-in',
    }));
    expect(getTargetHandleConnectionLimit(node('hf', 'hyperframesAgent'), 'image-in', edges)).toBe(
      20,
    );
    expect(
      isValidConnection(
        {
          source: 'image1',
          sourceHandle: 'image',
          target: 'hyperframes1',
          targetHandle: 'image-in',
        },
        edges,
        nodes,
      ),
    ).toBe(false);
  });

  it('gates video-generator target handles by model', () => {
    // veo-3.1-fast defaults to frames → no reference images
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

describe('video generator reference modes', () => {
  it('keeps every model default byte-identical to the legacy model-derived mode', () => {
    for (const model of VIDEO_GENERATOR_MODELS) {
      expect(getVideoGeneratorReferenceMode(model)).toBe(getVideoGeneratorReferenceModes(model)[0]);
    }
    expect(getVideoGeneratorReferenceMode('veo-3.1')).toBe('images');
    expect(getVideoGeneratorReferenceMode('veo-3.1-fast')).toBe('frames');
    expect(getVideoGeneratorReferenceMode('veo-3.1-lite')).toBe('frames');
    expect(getVideoGeneratorReferenceMode('kling-omni')).toBe('omni');
    expect(getVideoGeneratorReferenceMode('pixverse-v6')).toBe('images');
    expect(getVideoGeneratorReferenceMode('seedance-2.0')).toBe('images');
  });

  it('offers both modes on the two toggleable Veo models and one everywhere else', () => {
    expect(getVideoGeneratorReferenceModes('veo-3.1')).toEqual(['images', 'frames']);
    expect(getVideoGeneratorReferenceModes('veo-3.1-fast')).toEqual(['frames', 'images']);
    expect(getVideoGeneratorReferenceModes('veo-3.1-lite')).toEqual(['frames']);
    expect(getVideoGeneratorReferenceModes('kling-omni')).toEqual(['omni']);
    expect(getVideoGeneratorReferenceModes('pixverse-v6')).toEqual(['images']);
    expect(getVideoGeneratorReferenceModes('seedance-2.0')).toEqual(['images']);
  });

  it('swaps veo-3.1 handles with the mode — this is the first/last frame feature', () => {
    const frames = getVideoGeneratorTargetHandles('veo-3.1', 'frames');
    expect(frames).toContain('first-frame');
    expect(frames).toContain('last-frame');
    expect(frames).not.toContain('ref-images');

    const images = getVideoGeneratorTargetHandles('veo-3.1', 'images');
    expect(images).toContain('ref-images');
    expect(images).not.toContain('first-frame');
  });

  it('swaps veo-3.1-fast handles with the mode — the mirror fix', () => {
    const images = getVideoGeneratorTargetHandles('veo-3.1-fast', 'images');
    expect(images).toContain('ref-images');
    expect(images).not.toContain('first-frame');

    const frames = getVideoGeneratorTargetHandles('veo-3.1-fast', 'frames');
    expect(frames).toContain('first-frame');
    expect(frames).not.toContain('ref-images');
  });

  it('keeps veo-3.1-lite frames-only regardless of a requested mode', () => {
    expect(getVideoGeneratorTargetHandles('veo-3.1-lite', 'images')).not.toContain('ref-images');
    expect(getVideoGeneratorTargetHandles('veo-3.1-lite', 'images')).toContain('first-frame');
  });

  it('names exactly one rendered image-reference handle, always inside the allowed set', () => {
    for (const model of VIDEO_GENERATOR_MODELS) {
      for (const mode of getVideoGeneratorReferenceModes(model)) {
        const rendered = getVideoGeneratorImageReferenceHandle(model, mode);
        const allowed = getVideoGeneratorTargetHandles(model, mode);

        if (rendered === undefined) {
          expect(allowed).not.toContain('ref-image');
          expect(allowed).not.toContain('ref-images');
          continue;
        }
        expect(allowed).toContain(rendered);
      }
    }
  });

  it('renders the plural alias everywhere except pixverse-v6, which allows only the singular', () => {
    expect(getVideoGeneratorImageReferenceHandle('veo-3.1', 'images')).toBe('ref-images');
    expect(getVideoGeneratorImageReferenceHandle('kling-omni')).toBe('ref-images');
    expect(getVideoGeneratorImageReferenceHandle('seedance-2.0')).toBe('ref-images');
    expect(getVideoGeneratorImageReferenceHandle('pixverse-v6')).toBe('ref-image');
    // frames mode and veo-3.1-lite expose no image-reference handle at all.
    expect(getVideoGeneratorImageReferenceHandle('veo-3.1', 'frames')).toBeUndefined();
    expect(getVideoGeneratorImageReferenceHandle('veo-3.1-lite')).toBeUndefined();
  });

  it('derives the supports* predicates from the handle table so they cannot drift', () => {
    expect(supportsVideoGeneratorFrameInputs('veo-3.1', 'frames')).toBe(true);
    expect(supportsVideoGeneratorFrameInputs('veo-3.1', 'images')).toBe(false);
    expect(supportsVideoGeneratorReferenceImages('veo-3.1-fast', 'images')).toBe(true);
    expect(supportsVideoGeneratorReferenceImages('veo-3.1-fast', 'frames')).toBe(false);
    // Omitting the mode answers for the model's DEFAULT mode.
    expect(supportsVideoGeneratorFrameInputs('veo-3.1')).toBe(false);
    expect(supportsVideoGeneratorFrameInputs('veo-3.1-fast')).toBe(true);
  });

  it('resolves a node mode: absent → default, illegal → default, legal → honoured', () => {
    expect(resolveVideoGeneratorReferenceMode(node('v', 'videoGen', { model: 'veo-3.1' }))).toBe(
      'images',
    );
    expect(
      resolveVideoGeneratorReferenceMode(
        node('v', 'videoGen', { model: 'veo-3.1', referenceMode: 'video' }),
      ),
    ).toBe('images');
    expect(
      resolveVideoGeneratorReferenceMode(
        node('v', 'videoGen', { model: 'veo-3.1-lite', referenceMode: 'images' }),
      ),
    ).toBe('frames');
    expect(
      resolveVideoGeneratorReferenceMode(
        node('v', 'videoGen', { model: 'veo-3.1', referenceMode: 'frames' }),
      ),
    ).toBe('frames');
  });

  it('derives the model from the node type when data.model is absent', () => {
    expect(resolveVideoGeneratorReferenceMode(node('v', 'veoDirector'))).toBe('images');
    expect(resolveVideoGeneratorReferenceMode(node('v', 'veoFast'))).toBe('frames');
    expect(
      resolveVideoGeneratorReferenceMode(node('v', 'veoDirector', { referenceMode: 'frames' })),
    ).toBe('frames');
  });

  it('exposes the node allowed-handle set through the resolved mode', () => {
    expect(
      getAllowedTargetHandles(node('v', 'veoDirector', { referenceMode: 'frames' })),
    ).toContain('first-frame');
    expect(
      getAllowedTargetHandles(node('v', 'veoDirector', { referenceMode: 'images' })),
    ).toContain('ref-images');
  });

  it('labels every mode', () => {
    expect(VIDEO_GENERATOR_REFERENCE_MODE_LABELS.frames).toBeTruthy();
    expect(VIDEO_GENERATOR_REFERENCE_MODE_LABELS.images).toBeTruthy();
    expect(VIDEO_GENERATOR_REFERENCE_MODE_LABELS.omni).toBeTruthy();
  });
});

describe('video generator provider groups', () => {
  it('places every model in exactly one provider group', () => {
    const grouped = VIDEO_GENERATOR_MODEL_GROUPS.flatMap((group) => group.models);
    expect([...grouped].sort()).toEqual([...VIDEO_GENERATOR_MODELS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('groups the fal-hosted models together and the google models together', () => {
    const byProvider = new Map(
      VIDEO_GENERATOR_MODEL_GROUPS.map((group) => [group.provider, group.models]),
    );
    expect(byProvider.get('fal')).toEqual(['kling-omni', 'pixverse-v6', 'seedance-2.0']);
    expect(byProvider.get('google')).toEqual(['veo-3.1-fast', 'veo-3.1-lite', 'veo-3.1']);
  });

  it('agrees with getVideoGeneratorProvider and labels every provider', () => {
    for (const group of VIDEO_GENERATOR_MODEL_GROUPS) {
      expect(VIDEO_GENERATOR_PROVIDER_LABELS[group.provider]).toBeTruthy();
      expect(group.label).toBe(VIDEO_GENERATOR_PROVIDER_LABELS[group.provider]);
      for (const model of group.models) {
        expect(getVideoGeneratorProvider(model)).toBe(group.provider);
      }
    }
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

  it('allows image → veo-3.1 first-frame in frames mode and refuses it in images mode', () => {
    const framesNodes = [
      ...nodes,
      node('veoFull', 'videoGen', { model: 'veo-3.1', referenceMode: 'frames' }),
    ];
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'veoFull', targetHandle: 'first-frame' },
        [],
        framesNodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'veoFull', targetHandle: 'last-frame' },
        [],
        framesNodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'veoFull', targetHandle: 'ref-images' },
        [],
        framesNodes,
      ),
    ).toBe(false);

    const imagesNodes = [
      ...nodes,
      node('veoFull', 'videoGen', { model: 'veo-3.1', referenceMode: 'images' }),
    ];
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'veoFull', targetHandle: 'ref-images' },
        [],
        imagesNodes,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'veoFull', targetHandle: 'first-frame' },
        [],
        imagesNodes,
      ),
    ).toBe(false);
  });

  it('allows image → veo-3.1-fast ref-images in images mode — the mirror fix', () => {
    const fastImages = [
      ...nodes,
      node('veoFast1', 'videoGen', { model: 'veo-3.1-fast', referenceMode: 'images' }),
    ];
    expect(
      isValidConnection(
        { source: 'image1', sourceHandle: 'image', target: 'veoFast1', targetHandle: 'ref-images' },
        [],
        fastImages,
      ),
    ).toBe(true);
    expect(
      isValidConnection(
        {
          source: 'image1',
          sourceHandle: 'image',
          target: 'veoFast1',
          targetHandle: 'first-frame',
        },
        [],
        fastImages,
      ),
    ).toBe(false);
  });

  it('caps every frame handle at one connection, including seedance', () => {
    const framed = [
      ...nodes,
      node('veoFull', 'videoGen', { model: 'veo-3.1', referenceMode: 'frames' }),
      node('seed1', 'videoGen', { model: 'seedance-2.0' }),
    ];
    for (const id of ['veoFull', 'seed1']) {
      const target = framed.find((n) => n.id === id) as (typeof framed)[number];
      expect(getTargetHandleConnectionLimit(target, 'first-frame', [])).toBe(1);
      expect(getTargetHandleConnectionLimit(target, 'last-frame', [])).toBe(1);
    }
  });

  it('caps reference images per model, matching the backend validators', () => {
    expect(
      getTargetHandleConnectionLimit(
        node('v', 'videoGen', { model: 'veo-3.1', referenceMode: 'images' }),
        'ref-images',
        [],
      ),
    ).toBe(3);
    expect(
      getTargetHandleConnectionLimit(
        node('v', 'videoGen', { model: 'veo-3.1-fast', referenceMode: 'images' }),
        'ref-images',
        [],
      ),
    ).toBe(3);
    expect(
      getTargetHandleConnectionLimit(
        node('v', 'videoGen', { model: 'seedance-2.0' }),
        'ref-images',
        [],
      ),
    ).toBe(9);
    expect(
      getTargetHandleConnectionLimit(
        node('v', 'videoGen', { model: 'pixverse-v6' }),
        'ref-image',
        [],
      ),
    ).toBe(1);
  });

  it('leaves the kling-omni image/video exclusion math untouched', () => {
    const kling = node('k', 'videoGen', { model: 'kling-omni' });
    expect(getTargetHandleConnectionLimit(kling, 'ref-images', [])).toBe(7);
    const withVideo = [{ id: 'e1', source: 'video1', target: 'k', targetHandle: 'ref-video' }];
    expect(getTargetHandleConnectionLimit(kling, 'ref-images', withVideo)).toBe(4);
  });

  it('uses the selected publishing format to expose contextual media handles', () => {
    expect(getAllowedTargetHandles(node('p', 'plannerDraft', { format: 'video' }))).toEqual([
      PLANNER_DRAFT_TEXT_INPUT_HANDLE,
      PUBLISH_VIDEO_INPUT_HANDLE,
    ]);
    expect(getAllowedTargetHandles(node('p', 'paidPublisher', { format: 'image' }))).toEqual([
      PUBLISH_IMAGE_INPUT_HANDLE,
    ]);
    expect(
      getAllowedTargetHandles(
        node('p', 'plannerDraft', {
          format: 'carousel',
          assetSlots: [
            { id: 'first', order: 0 },
            { id: 'second', order: 1 },
          ],
        }),
      ),
    ).toEqual([PLANNER_DRAFT_TEXT_INPUT_HANDLE, 'asset-first', 'asset-second']);
    // The draft wire, not media: a plannerDraft hands its saved draft downstream.
    expect(getAllowedSourceHandles(node('p', 'plannerDraft'))).toEqual([DRAFT_OUTPUT_HANDLE]);
    expect(getAllowedTargetHandles(node('pub', 'organicPublish'))).toEqual([DRAFT_INPUT_HANDLE]);
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

  it('caps publisher inputs at one connection per ordered slot', () => {
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

  // A `reserved` variable is the server's to fill: the Canvas deliberately renders no
  // handle for one and the Backend refuses a caller-supplied value with
  // `render_reserved_variable`. If the graph rules still call the edge legal, a saved or
  // agent-authored workflow can carry one that `resolveApiRenderVariables` silently drops —
  // wired on screen, empty at render.
  it('never advertises or accepts a target handle for a reserved API-render variable', () => {
    const render = node('render1', 'apiRender', {
      variableDefinitions: [
        { key: 'hero_image', label: 'Hero', kind: 'image', reserved: false },
        { key: WATERMARK_LOGO_VARIABLE_KEY, label: 'Brand logo', kind: 'image', reserved: true },
      ],
    });
    const reservedHandle = `variable-${WATERMARK_LOGO_VARIABLE_KEY}`;

    expect(getAllowedTargetHandles(render)).toEqual(['variable-hero_image']);
    expect(getTargetHandleConnectionLimit(render, reservedHandle, [])).toBeUndefined();
    expect(
      isValidConnection(
        {
          source: 'image1',
          sourceHandle: 'image',
          target: 'render1',
          targetHandle: reservedHandle,
        },
        [],
        [render, node('image1', 'image', { image: '' })],
      ),
    ).toBe(false);
  });

  // A template's text parameters are values too: the caller must be able to feed one from
  // a Text Block instead of retyping it on the node. `number` and `enum` stay off the
  // wire — a handle would REPLACE the numeric field and the reflected option picker.
  const mixedRender = node('render1', 'apiRender', {
    variableDefinitions: [
      { key: 'hero_image', label: 'Hero', kind: 'image', reserved: false },
      { key: 'headline', label: 'Headline', kind: 'text', reserved: false },
      { key: 'duration', label: 'Duration', kind: 'number', reserved: false },
      { key: 'position', label: 'Position', kind: 'enum', reserved: false, options: ['tl', 'br'] },
      { key: WATERMARK_LOGO_VARIABLE_KEY, label: 'Brand logo', kind: 'image', reserved: true },
    ],
  });
  const mixedGraph = [
    mixedRender,
    node('string1', 'string', { value: 'Switch today' }),
    node('image1', 'image', { image: '' }),
  ];
  const wire = (source: string, sourceHandle: string, targetHandle: string) =>
    isValidConnection({ source, sourceHandle, target: 'render1', targetHandle }, [], mixedGraph);

  it('advertises a handle for every wireable variable and for nothing else', () => {
    expect(getAllowedTargetHandles(mixedRender)).toEqual([
      'variable-hero_image',
      'variable-headline',
    ]);
  });

  it('accepts a text-producing source on a text variable and refuses a mismatched one', () => {
    expect(wire('string1', 'text', 'variable-headline')).toBe(true);
    expect(wire('image1', 'image', 'variable-headline')).toBe(false);
    expect(wire('string1', 'text', 'variable-hero_image')).toBe(false);
    expect(wire('image1', 'image', 'variable-hero_image')).toBe(true);
  });

  it('refuses an edge to a variable that carries no handle at all', () => {
    expect(wire('string1', 'text', 'variable-duration')).toBe(false);
    expect(wire('string1', 'text', 'variable-position')).toBe(false);
  });

  // `apiRenderInputValueSchema` has no `string[]` member, so a second wire is a shape the
  // wire contract cannot express — even if the template declares the variable `multiple`.
  it('caps a text variable at one wire whatever the template declares', () => {
    const multipleText = node('render1', 'apiRender', {
      variableDefinitions: [
        { key: 'headline', label: 'Headline', kind: 'text', reserved: false, multiple: true },
      ],
    });
    expect(getTargetHandleConnectionLimit(multipleText, 'variable-headline', [])).toBe(1);

    const taken = [
      {
        id: 'e1',
        source: 'string1',
        sourceHandle: 'text',
        target: 'render1',
        targetHandle: 'variable-headline',
      },
    ];
    expect(
      isValidConnection(
        {
          source: 'string2',
          sourceHandle: 'text',
          target: 'render1',
          targetHandle: 'variable-headline',
        },
        taken,
        [multipleText, node('string1', 'string', {}), node('string2', 'string', {})],
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

describe('validateConnection', () => {
  it('returns an actionable reason when a target port is full', () => {
    const edges = [
      {
        id: 'e1',
        source: 'string1',
        sourceHandle: 'text',
        target: 'nano1',
        targetHandle: 'prompt',
      },
    ];
    const result = validateConnection(
      { source: 'string2', sourceHandle: 'text', target: 'nano1', targetHandle: 'prompt' },
      edges,
      nodes,
    );

    expect(result.valid).toBe(false);
    expect(result.code).toBe('target_at_capacity');
    expect(result.message).toContain('maximum number');
  });

  it('rejects duplicate edges and graph cycles without changing the boolean wrapper', () => {
    const graphNodes = [node('a', 'string'), node('b', 'string')];
    const edge = {
      id: 'a-b',
      source: 'a',
      sourceHandle: 'text',
      target: 'b',
      targetHandle: 'prompt',
    };

    expect(validateConnection(edge, [edge], graphNodes).code).toBe('duplicate_connection');
    const cycleConnection = {
      source: 'b',
      sourceHandle: 'text',
      target: 'a',
      targetHandle: 'prompt',
    };
    const cycle = validateConnection(cycleConnection, [edge], graphNodes);
    expect(cycle.code).toBe('cycle');
    expect(isValidConnection(cycleConnection, [edge], graphNodes)).toBe(false);
  });

  it('derives accessible port metadata from the canonical graph vocabulary', () => {
    const ports = getStudioPortMetadata(node('n', 'nanoGen'), 'input', [
      {
        id: 'e1',
        source: 'string1',
        sourceHandle: 'text',
        target: 'n',
        targetHandle: 'prompt',
      },
    ]);
    const prompt = ports.find((port) => port.id === 'prompt');
    const references = ports.find((port) => port.id === 'ref-image');

    expect(prompt).toMatchObject({
      name: 'Prompt',
      direction: 'input',
      dataType: 'text',
      required: true,
      connectionCount: 1,
      maxConnections: 1,
    });
    expect(references).toMatchObject({
      name: 'Reference image',
      dataType: 'image',
      maxConnections: 14,
    });
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

  it('accepts video, generated-video, image stills, and audio beds on the pool handle', () => {
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
    expect(
      isValidConnection(
        { source: 'audio1', sourceHandle: 'audio', target: 'timeline1', targetHandle: 'media-in' },
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
    // Both derived from DEFAULT_IMAGE_GENERATOR_MODEL: Flash-Lite is the baseline a new
    // image node is born on, and 1K is the only tier it accepts.
    expect(data.model).toBe('nano-banana-2-lite');
    expect(data.imageSize).toBe('1K');
    expect(style).toEqual({ width: 400, height: 225 });
  });

  it('derives the video model from the node type', () => {
    expect(createNodeData('veoFast').data.model).toBe('veo-3.1-fast');
    expect(createNodeData('veoDirector').data.model).toBe('veo-3.1');
  });

  it('gives the video family the aspectRatio its blocks read', () => {
    for (const type of ['videoGen', 'veoDirector', 'veoFast'] as const) {
      const { data, style } = createNodeData(type);
      expect(data.aspectRatio).toBe('16:9');
      expect(style).toEqual({ width: 512, height: 288 });
    }
  });

  it('derives the video box from the ratio an agent writes', () => {
    const { data, style } = createNodeData('videoGen', { aspectRatio: '9:16' });
    expect(data.aspectRatio).toBe('9:16');
    expect(style?.height).toBeGreaterThan(style?.width ?? 0);
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

// ---------------------------------------------------------------------------
// Canvas V3 node vocabulary
// ---------------------------------------------------------------------------

describe('Canvas V3 node defaults', () => {
  // The canvas has built this exact shape in StudioCanvas.createNodeConfig since notes
  // existed. A note an agent adds and a note the menu adds must be the same node, or a
  // reload renders one of them at the wrong size.
  it('creates a note identical to the shape the canvas menu builds', () => {
    expect(createNodeData('note')).toEqual({
      data: { content: '' },
      style: { width: 260, height: 160 },
    });
  });

  it('gives every new node type an explicit box to be born in', () => {
    for (const type of [
      'note',
      'action',
      'batch',
      'router',
      'export',
      'layerEditor',
      'element',
      'designRef',
    ] as const) {
      const created = createNodeData(type);
      expect(created.style?.width, `${type} width`).toBeGreaterThan(0);
      expect(created.style?.height, `${type} height`).toBeGreaterThan(0);
    }
  });

  it('sizes a layer document to its frame ratio, like a generator', () => {
    const portrait = createNodeData('layerEditor', { aspectRatio: '9:16' });
    expect(portrait.style?.height).toBeGreaterThan(portrait.style?.width ?? 0);
  });

  it('clears an action id that is not in the catalog', () => {
    const legal = coerceNodeConfig('action', { actionId: 'image.rotate' });
    expect(legal.data.actionId).toBe('image.rotate');
    expect(legal.changes).toEqual([]);

    const invented = coerceNodeConfig('action', { actionId: 'image.deepfry' });
    expect(invented.data.actionId).toBeNull();
    expect(invented.changes).toHaveLength(1);
  });

  it('leaves an action patch that does not mention the op alone', () => {
    const patch = coerceNodeConfig('action', { config: { degrees: 90 } });
    expect(patch.data).toEqual({ config: { degrees: 90 } });
    expect(patch.changes).toEqual([]);
  });
});

describe('Canvas V3 handles', () => {
  it('gives an action the handles its op declares, and none before one is chosen', () => {
    expect(getAllowedTargetHandles(node('a', 'action'))).toEqual([]);
    expect(getAllowedSourceHandles(node('a', 'action'))).toEqual([]);

    const rotate = node('a', 'action', { actionId: 'image.rotate' });
    expect(getAllowedTargetHandles(rotate)).toEqual(['in']);
    expect(getAllowedSourceHandles(rotate)).toEqual(['out']);

    // A multi-input op exposes every port its definition names.
    const overlay = node('a', 'action', { actionId: 'video.overlay' });
    expect(getAllowedTargetHandles(overlay)).toEqual(['in', 'overlay-in']);
  });

  it('gives the runtime types their handles, and the annotation none', () => {
    expect(getAllowedTargetHandles(node('r', 'router'))).toEqual(['in']);
    expect(getAllowedSourceHandles(node('r', 'router'))).toEqual(['out']);
    expect(getAllowedTargetHandles(node('b', 'batch'))).toEqual(['items']);
    expect(getAllowedSourceHandles(node('b', 'batch'))).toEqual(['collection']);
    expect(getAllowedTargetHandles(node('x', 'export'))).toEqual(['media-in']);
    expect(getAllowedSourceHandles(node('x', 'export'))).toEqual([]);
    expect(getAllowedTargetHandles(node('l', 'layerEditor'))).toEqual(['image-in']);
    expect(getAllowedSourceHandles(node('l', 'layerEditor'))).toEqual(['image']);
    expect(getAllowedSourceHandles(node('e', 'element'))).toEqual(['image']);
    expect(getAllowedSourceHandles(node('d', 'designRef'))).toEqual(['image', 'text']);
    expect(getAllowedTargetHandles(node('n', 'note'))).toEqual([]);
    expect(getAllowedSourceHandles(node('n', 'note'))).toEqual([]);
  });

  it('takes each connection limit from the op or the node kind', () => {
    expect(
      getTargetHandleConnectionLimit(node('a', 'action', { actionId: 'video.speed' }), 'in', []),
    ).toBe(1);
    expect(
      getTargetHandleConnectionLimit(node('a', 'action', { actionId: 'video.stitch' }), 'in', []),
    ).toBe(20);
    expect(getTargetHandleConnectionLimit(node('r', 'router'), 'in', [])).toBe(1);
    expect(getTargetHandleConnectionLimit(node('b', 'batch'), 'items', [])).toBe(100);
  });

  it('reports the modality a data-driven port actually carries', () => {
    const [input] = getStudioPortMetadata(
      node('a', 'action', { actionId: 'video.speed' }),
      'input',
    );
    expect(input.dataType).toBe('video');
    expect(input.required).toBe(true);

    const [output] = getStudioPortMetadata(
      node('a', 'action', { actionId: 'video.longExposure' }),
      'output',
    );
    // longExposure eats a clip and emits a still — the port says so rather than
    // defaulting to 'text' the way an unmapped handle used to.
    expect(output.dataType).toBe('image');
  });
});

describe('Canvas V3 connection rules', () => {
  const connect = (
    nodes: ReturnType<typeof node>[],
    source: string,
    sourceHandle: string,
    target: string,
    targetHandle: string,
    edges: Parameters<typeof isValidConnection>[1] = [],
  ) => isValidConnection({ source, sourceHandle, target, targetHandle }, edges, nodes);

  it('matches an action port to the modality its op declares', () => {
    const nodes = [
      node('img', 'nanoGen'),
      node('rotate', 'action', { actionId: 'image.rotate' }),
      node('speed', 'action', { actionId: 'video.speed' }),
    ];
    expect(connect(nodes, 'img', 'image', 'rotate', 'in')).toBe(true);
    // Same node type, different op: an image cannot feed a video speed change.
    expect(connect(nodes, 'img', 'image', 'speed', 'in')).toBe(false);
  });

  it('lets an action feed the generators that already accept its modality', () => {
    const nodes = [
      node('src', 'nanoGen'),
      node('rotate', 'action', { actionId: 'image.rotate' }),
      node('gen', 'nanoGen'),
    ];
    expect(connect(nodes, 'rotate', 'out', 'gen', 'ref-images')).toBe(true);
  });

  it('refuses an action that has not been given an op', () => {
    const nodes = [node('img', 'nanoGen'), node('a', 'action')];
    expect(connect(nodes, 'img', 'image', 'a', 'in')).toBe(false);
  });

  // The whole reason the producer predicates learned about source handles: a designRef
  // emits a specimen IMAGE on one handle and a token SUMMARY on the other, and wiring the
  // summary into a reference-image port would send prose where pixels belong.
  it('tells a designRef specimen apart from a designRef token summary', () => {
    const nodes = [node('d', 'designRef', { section: 'palette' }), node('gen', 'nanoGen')];
    expect(connect(nodes, 'd', 'image', 'gen', 'ref-images')).toBe(true);
    expect(connect(nodes, 'd', 'text', 'gen', 'ref-images')).toBe(false);
    expect(connect(nodes, 'd', 'text', 'gen', 'prompt')).toBe(true);
    expect(connect(nodes, 'd', 'image', 'gen', 'prompt')).toBe(false);
  });

  it('lets an element stand in for a reference image', () => {
    const nodes = [node('e', 'element', { elementId: 'el-1' }), node('gen', 'nanoGen')];
    expect(connect(nodes, 'e', 'image', 'gen', 'ref-images')).toBe(true);
  });

  it('locks a batch to one item kind', () => {
    const open = [node('img', 'nanoGen'), node('b', 'batch')];
    expect(connect(open, 'img', 'image', 'b', 'items')).toBe(true);

    const locked = [node('vid', 'video'), node('b', 'batch', { itemType: 'image' })];
    expect(connect(locked, 'vid', 'video', 'b', 'items')).toBe(false);

    // The lock also comes from what is already in the list, not only from an explicit field.
    const byItems = [
      node('vid', 'video'),
      node('b', 'batch', { items: [{ id: '1', kind: 'text', value: 'a' }] }),
    ];
    expect(connect(byItems, 'vid', 'video', 'b', 'items')).toBe(false);
  });

  // A batch with no explicit `itemType` and no items still knows what it carries once
  // something is wired into it — the same derive-from-wiring the router lock has. Without
  // it an agent-built `string → batch → generator` is refused at the second edge, because
  // the `BatchNode` effect that would have stamped the lock never runs off-canvas.
  it('derives a batch lock from what is wired into it', () => {
    const wiredText = [
      node('p', 'string', { value: 'one\ntwo' }),
      node('b', 'batch'),
      node('gen', 'nanoGen'),
    ];
    const textEdge = [{ id: 'e1', source: 'p', target: 'b', targetHandle: 'items' }];
    expect(batchLockedType(wiredText[1], textEdge, wiredText)).toBe('text');
    expect(connect(wiredText, 'b', 'collection', 'gen', 'prompt', textEdge)).toBe(true);

    const wiredImage = [node('img', 'image'), node('b', 'batch'), node('gen', 'nanoGen')];
    const imageEdge = [{ id: 'e1', source: 'img', target: 'b', targetHandle: 'items' }];
    expect(batchLockedType(wiredImage[1], imageEdge, wiredImage)).toBe('image');
    expect(connect(wiredImage, 'b', 'collection', 'gen', 'ref-images', imageEdge)).toBe(true);
    // Image items are not prose: the derived lock is a real modality, not a pass.
    expect(connect(wiredImage, 'b', 'collection', 'gen', 'prompt', imageEdge)).toBe(false);
  });

  it('lets an explicit itemType win over what happens to be wired in', () => {
    const nodes = [
      node('img', 'image'),
      node('b', 'batch', { itemType: 'text' }),
      node('gen', 'nanoGen'),
    ];
    const edges = [{ id: 'e1', source: 'img', target: 'b', targetHandle: 'items' }];
    expect(batchLockedType(nodes[1], edges, nodes)).toBe('text');
  });

  it('leaves an unwired, undeclared batch with no modality at all', () => {
    const nodes = [node('b', 'batch'), node('gen', 'nanoGen')];
    expect(batchLockedType(nodes[0], [], nodes)).toBeUndefined();
    expect(connect(nodes, 'b', 'collection', 'gen', 'prompt')).toBe(false);
  });

  it('reads a batch wired into a batch as the combine partner, never as an item source', () => {
    const nodes = [
      node('a', 'batch', { itemType: 'image' }),
      node('b', 'batch'),
      node('gen', 'nanoGen'),
    ];
    const edges = [{ id: 'e1', source: 'a', target: 'b', targetHandle: 'items' }];
    expect(batchLockedType(nodes[1], edges, nodes)).toBeUndefined();
  });

  it('refuses a second item edge that would mix kinds in an unstamped batch', () => {
    const nodes = [node('p', 'string', { value: 'one' }), node('img', 'image'), node('b', 'batch')];
    const edges = [{ id: 'e1', source: 'p', target: 'b', targetHandle: 'items' }];
    expect(connect(nodes, 'img', 'image', 'b', 'items', edges)).toBe(false);
    expect(connect(nodes, 'p', 'text', 'b', 'items', [])).toBe(true);
  });

  it('passes a router through, and keeps it on the modality it locked', () => {
    const nodes = [
      node('img', 'nanoGen'),
      node('r', 'router', { lockedType: 'image' }),
      node('gen', 'nanoGen'),
      node('editor', 'timelineEditor'),
    ];
    expect(connect(nodes, 'img', 'image', 'r', 'in')).toBe(true);
    expect(connect(nodes, 'r', 'out', 'gen', 'ref-images')).toBe(true);

    const wrong = [node('vid', 'video'), node('r', 'router', { lockedType: 'image' })];
    expect(connect(wrong, 'vid', 'video', 'r', 'in')).toBe(false);
  });

  it('takes media into an export and nothing out of it', () => {
    const nodes = [
      node('img', 'nanoGen'),
      node('txt', 'string', { value: 'hi' }),
      node('x', 'export'),
      node('gen', 'nanoGen'),
    ];
    expect(connect(nodes, 'img', 'image', 'x', 'media-in')).toBe(true);
    expect(connect(nodes, 'txt', 'text', 'x', 'media-in')).toBe(false);
    expect(getAllowedSourceHandles(node('x', 'export'))).toEqual([]);
    expect(connect(nodes, 'x', 'media-in', 'gen', 'ref-images')).toBe(false);
  });

  it('stacks stills in a layer editor and refuses clips', () => {
    const nodes = [node('img', 'nanoGen'), node('vid', 'video'), node('l', 'layerEditor')];
    expect(connect(nodes, 'img', 'image', 'l', 'image-in')).toBe(true);
    expect(connect(nodes, 'vid', 'video', 'l', 'image-in')).toBe(false);
  });

  it('wires a note to nothing at all', () => {
    const nodes = [node('n', 'note', { content: 'why' }), node('gen', 'nanoGen')];
    expect(connect(nodes, 'n', 'text', 'gen', 'prompt')).toBe(false);
    expect(connect(nodes, 'gen', 'image', 'n', 'in')).toBe(false);
  });
});
