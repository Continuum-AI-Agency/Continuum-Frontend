import { describe, expect, it } from 'bun:test';

import {
  aiStudioComposerFrameSchema,
  aiStudioImageResultEventSchema,
  aiStudioReferenceImageSchema,
  aiStudioVideoResultEventSchema,
} from './ai-studio';

describe('aiStudioComposerFrameSchema', () => {
  it('accepts an optional server-minted run id on composer.started', () => {
    const parsed = aiStudioComposerFrameSchema.parse({
      type: 'composer.started',
      data: { roomId: 'room-1', runId: 'canvas_run_1' },
    });
    expect(parsed.data).toEqual({ roomId: 'room-1', runId: 'canvas_run_1' });
  });

  it('accepts an optimistic graph patch', () => {
    expect(
      aiStudioComposerFrameSchema.safeParse({
        type: 'composer.patch',
        data: {
          nodes: [{ id: 'prompt', type: 'string', position: { x: 0, y: 0 }, data: {} }],
          edges: [],
        },
      }).success,
    ).toBe(true);
  });

  it('accepts a durable graph proposal frame', () => {
    expect(
      aiStudioComposerFrameSchema.safeParse({
        type: 'composer.proposal',
        data: {
          id: 'ab71d94a-b25b-4917-a28e-6780eb427355',
          runId: 'run-1',
          brandProfileId: '5b90a36d-445c-4138-90ce-64f2550dfd72',
          roomId: '43b352da-68c5-44c4-b0b9-9286230a1cae',
          baseRevision: 1,
          summary: 'Add an image step.',
          status: 'pending',
          operations: [{ kind: 'add_node', nodeId: 'image-1' }],
          affectedNodeIds: ['image-1'],
          affectedEdgeIds: [],
          proposedNodes: [{ id: 'image-1', type: 'nanoGen', position: { x: 0, y: 0 }, data: {} }],
          proposedEdges: [],
          createdAt: '2026-07-26T12:00:00.000Z',
        },
      }).success,
    ).toBe(true);
  });
});

describe('aiStudioReferenceImageSchema', () => {
  it('accepts a signed url reference (preferred path)', () => {
    const parsed = aiStudioReferenceImageSchema.safeParse({
      image_url: 'https://project.supabase.co/storage/v1/object/sign/media-library/x.png?token=abc',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.mime_type).toBe('image/png');
  });

  it('accepts a base64 reference (fallback path)', () => {
    const parsed = aiStudioReferenceImageSchema.safeParse({
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCA',",
      mime_type: 'image/jpeg',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts the url alias for image_url', () => {
    const parsed = aiStudioReferenceImageSchema.safeParse({
      url: 'https://cdn.example.com/a.png',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a reference with neither data nor a url', () => {
    const parsed = aiStudioReferenceImageSchema.safeParse({ mime_type: 'image/png' });
    expect(parsed.success).toBe(false);
  });
});

describe('aiStudioImageResultEventSchema', () => {
  it('accepts a url-first result with no base64', () => {
    const parsed = aiStudioImageResultEventSchema.safeParse({
      mime_type: 'image/png',
      signed_url:
        'https://project.supabase.co/storage/v1/object/sign/brand-profile-assets/x.png?token=abc',
      bucket: 'brand-profile-assets',
      path: 'brand/canvas-creations/4K/x.png',
      resolution: '4K',
      delivery: 'durable',
      size_bytes: 123,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a base64 fallback result', () => {
    const parsed = aiStudioImageResultEventSchema.safeParse({
      mime_type: 'image/png',
      base64: 'iVBORw0KGgo=',
      data_url: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(parsed.success).toBe(true);
  });

  it('requires mime_type', () => {
    const parsed = aiStudioImageResultEventSchema.safeParse({ signed_url: 'https://x' });
    expect(parsed.success).toBe(false);
  });
});

describe('aiStudioVideoResultEventSchema', () => {
  it('accepts a url-first video result', () => {
    const parsed = aiStudioVideoResultEventSchema.safeParse({
      mime_type: 'video/mp4',
      signed_url:
        'https://project.supabase.co/storage/v1/object/sign/brand-profile-assets/x.mp4?token=abc',
      download_url: null,
      bytes: 1234,
    });
    expect(parsed.success).toBe(true);
  });
});
