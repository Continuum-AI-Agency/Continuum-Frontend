import { describe, it, expect } from 'bun:test';
import { buildExtendVideoPayload, buildNanoGenPayload, buildVeoPayload, buildEnrichPayload } from './buildNodePayload';
import { StudioNode } from '../types';
import { Edge } from '@xyflow/react';
import { NodeOutput } from '../types/execution';
import { getVideoGeneratorTargetHandles } from './videoModel';

describe('buildNodePayload', () => {
  describe('buildNanoGenPayload', () => {
    it('should build payload from internal data', () => {
      const node: StudioNode = {
        id: 'nano',
        type: 'nanoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana',
          positivePrompt: 'A cat',
          negativePrompt: 'blurry',
          aspectRatio: '1:1',
        },
      };

      const payload = buildNanoGenPayload(node, new Map(), [], []);
      expect(payload).not.toBeNull();
      expect(payload?.prompt).toBe('A cat');
      expect(payload?.negativePrompt).toBe('blurry');
      expect(payload?.model).toBe('gemini-2.5-flash-image');
    });

    it('should map nano-banana-pro to gemini-3-pro-image-preview', () => {
      const node: StudioNode = {
        id: 'nano',
        type: 'nanoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana-pro',
          positivePrompt: 'A cat',
        },
      };

      const payload = buildNanoGenPayload(node, new Map(), [], []);
      expect(payload?.model).toBe('gemini-3-pro-image-preview');
    });

    it('should map nano-banana-2 to gemini-3.1-flash-image-preview with selectable size options', () => {
      const node: StudioNode = {
        id: 'nano',
        type: 'nanoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana-2',
          positivePrompt: 'A cat',
          imageSize: '2K',
        },
      };

      const payload = buildNanoGenPayload(node, new Map(), [], []);
      expect(payload?.model).toBe('gemini-3.1-flash-image-preview');
      expect(payload?.resolution).toBe('2048x2048');
      expect(payload?.imageSize).toBe('2K');
    });

    it('should default nano-banana-2 to 512px size', () => {
      const node: StudioNode = {
        id: 'nano',
        type: 'nanoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana-2',
          positivePrompt: 'A cat',
        },
      };

      const payload = buildNanoGenPayload(node, new Map(), [], []);
      expect(payload?.imageSize).toBe('512px');
      expect(payload?.resolution).toBe('512x512');
    });

    it('should prioritize edge inputs', () => {
      const node: StudioNode = {
        id: 'nano',
        type: 'nanoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'nano-banana',
          positivePrompt: 'Old prompt',
        },
      };

      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'text1',
          target: 'nano',
          sourceHandle: 'text',
          targetHandle: 'prompt',
        },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('text1', { type: 'text', value: 'New prompt from edge' });

      const payload = buildNanoGenPayload(node, resolvedData, [], edges);
      expect(payload?.prompt).toBe('New prompt from edge');
    });

    it('should collect reference images', () => {
      const node: StudioNode = {
        id: 'nano',
        type: 'nanoGen',
        position: { x: 0, y: 0 },
        data: { positivePrompt: 'test' },
      };

      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'img1',
          target: 'nano',
          sourceHandle: 'image',
          targetHandle: 'ref-images',
        },
        {
          id: 'e2',
          source: 'img2',
          target: 'nano',
          sourceHandle: 'image',
          targetHandle: 'ref-images',
        },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('img1', { type: 'image', base64: 'base64_1', mimeType: 'image/png' });
      resolvedData.set('img2', { type: 'image', base64: 'base64_2', mimeType: 'image/jpeg' });

      const payload = buildNanoGenPayload(node, resolvedData, [], edges);
      expect(payload?.referenceImages).toHaveLength(2);
      expect(payload?.referenceImages?.[0].data).toBe('base64_1');
      expect(payload?.referenceImages?.[1].data).toBe('base64_2');
    });
  });

  describe('buildVeoPayload', () => {
    it('should build basic payload', () => {
      const node: StudioNode = {
        id: 'veo',
        type: 'veoDirector',
        position: { x: 0, y: 0 },
        data: {
          model: 'veo-3.1',
          prompt: 'A video',
          enhancePrompt: false,
        },
      };

      const payload = buildVeoPayload(node, new Map(), [], []);
      expect(payload).not.toBeNull();
      expect(payload?.prompt).toBe('A video');
      expect(payload?.model).toBe('veo-3.1-generate-preview');
    });

    it('should map Veo 3.1 Lite to the Gemini API model code', () => {
      const node: StudioNode = {
        id: 'veo-lite',
        type: 'videoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'veo-3.1-lite',
          prompt: 'A fast concept video',
          enhancePrompt: false,
          resolution: '1080p',
        },
      };

      const edges: Edge[] = [
        { id: 'e1', source: 'f1', target: 'veo-lite', sourceHandle: 'image', targetHandle: 'first-frame' },
        { id: 'e2', source: 'f2', target: 'veo-lite', sourceHandle: 'image', targetHandle: 'last-frame' },
        { id: 'e3', source: 'ref', target: 'veo-lite', sourceHandle: 'image', targetHandle: 'ref-images' },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('f1', { type: 'image', base64: 'first_base64', mimeType: 'image/png' });
      resolvedData.set('f2', { type: 'image', base64: 'last_base64', mimeType: 'image/png' });
      resolvedData.set('ref', { type: 'image', base64: 'ignored_ref_base64', mimeType: 'image/png' });

      const payload = buildVeoPayload(node, resolvedData, [], edges);
      expect(payload).not.toBeNull();
      expect(payload?.model).toBe('veo-3.1-lite-generate-preview');
      expect(payload?.resolution).toBe('1080p');
      expect(payload?.firstFrame?.data).toBe('first_base64');
      expect(payload?.lastFrame?.data).toBe('last_base64');
      expect(payload?.referenceImages).toBeUndefined();
      expect(getVideoGeneratorTargetHandles('veo-3.1-lite')).toContain('first-frame');
      expect(getVideoGeneratorTargetHandles('veo-3.1-lite')).not.toContain('ref-images');
    });

    it('should prioritize negative prompt from edge input', () => {
      const node: StudioNode = {
        id: 'veo',
        type: 'veoDirector',
        position: { x: 0, y: 0 },
        data: { prompt: 'video', negativePrompt: 'old negative' },
      };

      const edges: Edge[] = [
        { id: 'e1', source: 'text1', target: 'veo', sourceHandle: 'text', targetHandle: 'negative' },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('text1', { type: 'text', value: 'new negative' });

      const payload = buildVeoPayload(node, resolvedData, [], edges);
      expect(payload?.negativePrompt).toBe('new negative');
    });

    it('should handle first and last frames', () => {
      const node: StudioNode = {
        id: 'veo',
        type: 'veoDirector',
        position: { x: 0, y: 0 },
        data: { model: 'veo-3.1-fast', prompt: 'video', referenceMode: 'frames' },
      };

      const edges: Edge[] = [
        { id: 'e1', source: 'f1', target: 'veo', sourceHandle: 'image', targetHandle: 'first-frame' },
        { id: 'e2', source: 'f2', target: 'veo', sourceHandle: 'image', targetHandle: 'last-frame' },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('f1', { type: 'image', base64: 'first_base64', mimeType: 'image/png' });
      resolvedData.set('f2', { type: 'image', base64: 'last_base64', mimeType: 'image/png' });

      const payload = buildVeoPayload(node, resolvedData, [], edges);
      expect(payload?.firstFrame).toBeDefined();
      expect(payload?.lastFrame).toBeDefined();
      expect(payload?.firstFrame?.data).toBe('first_base64');
      expect(payload?.lastFrame?.data).toBe('last_base64');
    });

    it('should include Kling Omni reference video with image references', () => {
      const node: StudioNode = {
        id: 'kling',
        type: 'videoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'kling-omni',
          prompt: 'Stylized product reveal',
          enhancePrompt: false,
        } as any,
      };

      const edges: Edge[] = [
        { id: 'v1', source: 'video-ref', target: 'kling', sourceHandle: 'video', targetHandle: 'ref-video' },
        { id: 'i1', source: 'img-ref', target: 'kling', sourceHandle: 'image', targetHandle: 'ref-images' },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('video-ref', { type: 'video', url: 'data:video/mp4;base64,video_ref_data' });
      resolvedData.set('img-ref', { type: 'image', base64: 'img_ref_data', mimeType: 'image/png' });

      const payload = buildVeoPayload(node, resolvedData, [], edges);

      expect(payload?.model).toBe('kling-omni');
      expect(payload?.referenceVideo?.data).toBe('video_ref_data');
      expect(payload?.referenceImages?.[0]?.data).toBe('img_ref_data');
    });

    it('should expose Pixverse v6 as a Fal-backed model with a single reference image handle set', () => {
      const node: StudioNode = {
        id: 'pixverse',
        type: 'videoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'pixverse-v6',
          prompt: 'A polished product reveal',
          enhancePrompt: false,
        } as any,
      };

      const edges: Edge[] = [
        { id: 'i1', source: 'img-ref', target: 'pixverse', sourceHandle: 'image', targetHandle: 'ref-image' },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('img-ref', { type: 'image', base64: 'pixverse_image', mimeType: 'image/png' });

      const payload = buildVeoPayload(node, resolvedData, [], edges);
      expect(payload?.model).toBe('pixverse-v6');
      expect(payload?.referenceImages?.[0]?.data).toBe('pixverse_image');
    });

    it('should expose a single Pixverse ref-image target handle', () => {
      expect(getVideoGeneratorTargetHandles('pixverse-v6')).toEqual([
        'prompt-in',
        'prompt',
        'negative',
        'ref-image',
      ]);
    });

    it('should include Seedance image references when present', () => {
      const node: StudioNode = {
        id: 'seedance',
        type: 'videoGen',
        position: { x: 0, y: 0 },
        data: {
          model: 'seedance-2.0',
          prompt: 'Motion prompt',
          enhancePrompt: false,
        } as any,
      };

      const edges: Edge[] = [
        { id: 'i1', source: 'img1', target: 'seedance', sourceHandle: 'image', targetHandle: 'ref-images' },
      ];
      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('img1', { type: 'image', base64: 'seedance_image', mimeType: 'image/png' });

      const payload = buildVeoPayload(node, resolvedData, [], edges);
      expect(payload?.imageReferences?.[0].data).toBe('seedance_image');
      expect(payload?.referenceImages).toBeUndefined();
    });
  });

  describe('buildExtendVideoPayload', () => {
    it('should build payload with base64 video input', () => {
      const node: StudioNode = {
        id: 'extend',
        type: 'extendVideo',
        position: { x: 0, y: 0 },
        data: {},
      };

      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'vid1',
          target: 'extend',
          sourceHandle: 'video',
          targetHandle: 'video',
        },
        {
          id: 'e2',
          source: 'txt1',
          target: 'extend',
          sourceHandle: 'text',
          targetHandle: 'prompt',
        },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('vid1', { type: 'video', url: 'data:video/mp4;base64,video_base64' });
      resolvedData.set('txt1', { type: 'text', value: 'Extend prompt' });

      const payload = buildExtendVideoPayload(node, resolvedData, [], edges);
      expect(payload).not.toBeNull();
      expect(payload?.prompt).toBe('Extend prompt');
      expect('data' in (payload?.video ?? {})).toBe(true);
      expect((payload?.video as any).data).toBe('video_base64');
    });

    it('should return null when video input is missing', () => {
      const node: StudioNode = {
        id: 'extend',
        type: 'extendVideo',
        position: { x: 0, y: 0 },
        data: {},
      };

      const payload = buildExtendVideoPayload(node, new Map(), [], []);
      expect(payload).toBeNull();
    });

    it('should build payload with video uri input from upstream output', () => {
      const node: StudioNode = {
        id: 'extend',
        type: 'extendVideo',
        position: { x: 0, y: 0 },
        data: {},
      };

      const edges: Edge[] = [
        {
          id: 'e1',
          source: 'veo1',
          target: 'extend',
          sourceHandle: 'video',
          targetHandle: 'video',
        },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      resolvedData.set('veo1', { type: 'video', url: 'https://cdn.continuum.test/videos/upstream.mp4' });

      const payload = buildExtendVideoPayload(node, resolvedData, [], edges);

      expect(payload).not.toBeNull();
      expect('uri' in (payload?.video ?? {})).toBe(true);
      expect((payload?.video as any).uri).toBe('https://cdn.continuum.test/videos/upstream.mp4');
    });
  });

  describe('buildEnrichPayload', () => {
    it('should build payload with text, image, audio, and document inputs', async () => {
      const node: StudioNode = {
        id: 'string',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'Enrich this' },
      };

      const edges: Edge[] = [
        { id: 'e1', source: 'img1', target: 'string', sourceHandle: 'image', targetHandle: 'image' },
        { id: 'e2', source: 'aud1', target: 'string', sourceHandle: 'audio', targetHandle: 'audio' },
        { id: 'e3', source: 'doc1', target: 'string', sourceHandle: 'document', targetHandle: 'document' },
      ];

      const resolvedData = new Map<string, NodeOutput>();
      
      const allNodes: StudioNode[] = [
        node,
        {
          id: 'img1',
          type: 'image',
          position: { x: 0, y: 0 },
          data: {
            image: 'data:image/png;base64,img_base64',
            sourcePath: 'brand-assets/sample-image.png',
            sourceUrl: 'https://cdn.continuum.test/sample-image.png',
          },
        },
        { id: 'aud1', type: 'audio', position: { x: 0, y: 0 }, data: { audio: 'data:audio/mp3;base64,aud_base64' } },
        { id: 'doc1', type: 'document', position: { x: 0, y: 0 }, data: { documents: [{ content: 'doc content', name: 'doc.txt', type: 'txt' }] } },
      ];

      const payload = await buildEnrichPayload(node, resolvedData, allNodes, edges, 'brand-1');
      
      expect(payload).not.toBeNull();
      expect(payload?.prompt).toBe('Enrich this');
      expect(payload?.context?.images?.[0].data).toBe('img_base64');
      expect(payload?.context?.images?.[0].sourcePath).toBe('brand-assets/sample-image.png');
      expect(payload?.context?.images?.[0].sourceUrl).toBe('https://cdn.continuum.test/sample-image.png');
      expect(payload?.context?.audio?.data).toBe('aud_base64');
      expect(payload?.context?.documents?.[0].content).toBe('doc content');
    });

    it('should include source metadata for connected video inputs', async () => {
      const node: StudioNode = {
        id: 'string',
        type: 'string',
        position: { x: 0, y: 0 },
        data: { value: 'Use this video context' },
      };

      const edges: Edge[] = [
        { id: 'e1', source: 'vid1', target: 'string', sourceHandle: 'video', targetHandle: 'video' },
      ];

      const allNodes: StudioNode[] = [
        node,
        {
          id: 'vid1',
          type: 'video',
          position: { x: 0, y: 0 },
          data: {
            video: 'data:video/mp4;base64,vid_base64',
            sourcePath: 'brand-assets/sample-video.mp4',
            sourceUrl: 'https://cdn.continuum.test/sample-video.mp4',
          },
        },
      ];

      const payload = await buildEnrichPayload(node, new Map(), allNodes, edges, 'brand-1');
      expect(payload?.context?.video?.data).toBe('vid_base64');
      expect(payload?.context?.video?.sourcePath).toBe('brand-assets/sample-video.mp4');
      expect(payload?.context?.video?.sourceUrl).toBe('https://cdn.continuum.test/sample-video.mp4');
    });

    it('should return an empty payload if no prompt and no inputs', async () => {
        const node: StudioNode = {
            id: 'string',
            type: 'string',
            position: { x: 0, y: 0 },
            data: { value: '' },
        };
        const payload = await buildEnrichPayload(node, new Map(), [], [], 'brand-1');
        expect(payload).not.toBeNull();
        expect(payload?.prompt).toBe('');
    });
  });

  describe('variationCount → num_images in buildNanoGenPayload', () => {
    const makeNode = (model: string, variationCount?: 1 | 4): StudioNode => ({
      id: 'nano',
      type: 'nanoGen',
      position: { x: 0, y: 0 },
      data: { model, positivePrompt: 'test', aspectRatio: '1:1', variationCount } as any,
    });

    it('omits numImages when variationCount is 1', () => {
      const payload = buildNanoGenPayload(makeNode('nano-banana', 1), new Map(), [], []);
      expect(payload?.numImages).toBeUndefined();
    });

    it('omits numImages when variationCount is not set', () => {
      const payload = buildNanoGenPayload(makeNode('nano-banana'), new Map(), [], []);
      expect(payload?.numImages).toBeUndefined();
    });

    it('sets numImages to 4 for nano-banana with variationCount 4', () => {
      const payload = buildNanoGenPayload(makeNode('nano-banana', 4), new Map(), [], []);
      expect(payload?.numImages).toBe(4);
    });

    it('sets numImages to 4 for nano-banana-pro with variationCount 4', () => {
      const payload = buildNanoGenPayload(makeNode('nano-banana-pro', 4), new Map(), [], []);
      expect(payload?.numImages).toBe(4);
    });

    it('sets numImages to 4 for nano-banana-2 with variationCount 4', () => {
      const payload = buildNanoGenPayload(makeNode('nano-banana-2', 4), new Map(), [], []);
      expect(payload?.numImages).toBe(4);
    });

    it('sets numImages to 4 for gpt-image-2 with variationCount 4', () => {
      const payload = buildNanoGenPayload(makeNode('gpt-image-2', 4), new Map(), [], []);
      expect(payload?.numImages).toBe(4);
    });

    it('sets numImages to 4 for flux-2-pro with variationCount 4', () => {
      const payload = buildNanoGenPayload(makeNode('flux-2-pro', 4), new Map(), [], []);
      expect(payload?.numImages).toBe(4);
    });

    it('sets numImages to 4 for flux-2-max with variationCount 4', () => {
      const payload = buildNanoGenPayload(makeNode('flux-2-max', 4), new Map(), [], []);
      expect(payload?.numImages).toBe(4);
    });
  });
});
