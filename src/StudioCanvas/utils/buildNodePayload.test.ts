import { describe, it, expect } from 'bun:test';
import { buildExtendVideoPayload, buildNanoGenPayload, buildVeoPayload } from './buildNodePayload';
import { StudioNode } from '../types';
import { Edge } from '@xyflow/react';
import { NodeOutput } from '../types/execution';

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
        data: { prompt: 'video', referenceMode: 'frames' },
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
  });
});
