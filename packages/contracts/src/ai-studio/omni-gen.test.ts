import { describe, expect, it } from 'bun:test';
import { getCatalogEntry, isModelSelectable } from './model-catalog';
import { OMNI_GEN_BACKEND_MODEL, OMNI_GEN_MODEL_ID, omniGenRequestSchema } from './omni-gen';
import {
  createNodeData,
  getAllowedSourceHandles,
  getAllowedTargetHandles,
  getTargetHandleConnectionLimit,
  isValidConnection,
  studioNodeTypeEnum,
} from './workflow-graph';

const node = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

describe('omniGenRequestSchema', () => {
  it('accepts a generate turn without a previous interaction id', () => {
    const parsed = omniGenRequestSchema.safeParse({
      brandId: 'brand-1',
      turn: 'generate',
      prompt: 'A marble rolling down a track',
      aspectRatio: '9:16',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an edit or extend turn with neither a prior interaction nor a clip', () => {
    for (const turn of ['edit', 'extend'] as const) {
      const parsed = omniGenRequestSchema.safeParse({
        brandId: 'brand-1',
        turn,
        prompt: 'make the sky sunset orange',
      });
      expect(parsed.success).toBe(false);
    }
  });

  it('accepts an edit or extend turn carrying the clip inline', () => {
    for (const turn of ['edit', 'extend'] as const) {
      const parsed = omniGenRequestSchema.safeParse({
        brandId: 'brand-1',
        turn,
        prompt: 'continue the scene',
        sourceVideo: { data: 'AAAA', mimeType: 'video/mp4' },
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('accepts every resolution the service supports and nothing else', () => {
    for (const resolution of ['360p', '720p', '1080p', '4k']) {
      const parsed = omniGenRequestSchema.safeParse({
        brandId: 'b',
        turn: 'generate',
        prompt: 'x',
        resolution,
      });
      expect(parsed.success).toBe(true);
    }
    expect(
      omniGenRequestSchema.safeParse({
        brandId: 'b',
        turn: 'generate',
        prompt: 'x',
        resolution: '8k',
      }).success,
    ).toBe(false);
  });

  it('accepts an edit turn that threads a previous interaction id', () => {
    const parsed = omniGenRequestSchema.safeParse({
      brandId: 'brand-1',
      turn: 'edit',
      prompt: 'make the sky sunset orange',
      previousInteractionId: 'v1_abc123',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown keys and empty prompts', () => {
    expect(
      omniGenRequestSchema.safeParse({ brandId: 'b', turn: 'generate', prompt: '' }).success,
    ).toBe(false);
    expect(
      omniGenRequestSchema.safeParse({ brandId: 'b', turn: 'generate', prompt: 'x', extra: 1 })
        .success,
    ).toBe(false);
  });
});

describe('omni model catalog registration', () => {
  it('registers gemini-omni-flash as a selectable beta video model', () => {
    const entry = getCatalogEntry(OMNI_GEN_MODEL_ID);
    expect(entry?.medium).toBe('video');
    expect(entry?.status).toBe('beta');
    expect(isModelSelectable(entry!.status)).toBe(true);
  });

  it('keeps the backend model id distinct from the canvas id', () => {
    expect(OMNI_GEN_MODEL_ID).toBe('gemini-omni-flash');
    expect(OMNI_GEN_BACKEND_MODEL).toBe('gemini-omni-1.1-flash');
  });
});

describe('omniGen graph registration', () => {
  it('is part of the studio node-type enum', () => {
    expect(studioNodeTypeEnum.safeParse('omniGen').success).toBe(true);
  });

  it('emits a video source handle and prompt/ref target handles', () => {
    const omni = node('omni1', 'omniGen');
    expect(getAllowedSourceHandles(omni)).toEqual(['video']);
    expect(getAllowedTargetHandles(omni)).toEqual([
      'prompt-in',
      'prompt',
      'ref-images',
      'ref-video',
    ]);
  });

  it('accepts a text prompt, an image reference and a clip on ref-video', () => {
    const nodes = [
      node('str1', 'string', { value: '' }),
      node('img1', 'image', { image: '' }),
      node('vid1', 'video', { video: '' }),
      node('omni1', 'omniGen'),
    ];
    const valid = (source: string, targetHandle: string) =>
      isValidConnection({ source, target: 'omni1', sourceHandle: null, targetHandle }, [], nodes);

    expect(valid('str1', 'prompt-in')).toBe(true);
    expect(valid('img1', 'ref-images')).toBe(true);
    expect(valid('vid1', 'ref-video')).toBe(true);
    expect(valid('vid1', 'ref-images')).toBe(false);
    expect(valid('vid1', 'prompt')).toBe(false);
    expect(valid('img1', 'ref-video')).toBe(false);
  });

  it('caps reference images at three and the input clip at one', () => {
    const omni = node('omni1', 'omniGen');
    expect(getTargetHandleConnectionLimit(omni, 'ref-images', [])).toBe(3);
    expect(getTargetHandleConnectionLimit(omni, 'ref-video', [])).toBe(1);
  });

  it('is a video-producing source downstream editors accept', () => {
    const nodes = [node('omni1', 'omniGen'), node('dec1', 'videoDecode')];
    expect(
      isValidConnection(
        { source: 'omni1', target: 'dec1', sourceHandle: 'video', targetHandle: 'video' },
        [],
        nodes,
      ),
    ).toBe(true);
  });

  it('creates default node data with the fixed model and empty variations', () => {
    const created = createNodeData('omniGen');
    expect(created.data.model).toBe('gemini-omni-flash');
    expect(created.data.variations).toEqual([]);
    expect(created.data.aspectRatio).toBe('16:9');
    expect(created.data.resolution).toBe('720p');
  });
});
