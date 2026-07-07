import { describe, expect, it } from 'bun:test';

import { omniGenStreamFrameSchema } from './omni-gen';

const reparse = (type: string, data: unknown) => omniGenStreamFrameSchema.safeParse({ type, data });

describe('omniGenStreamFrameSchema', () => {
  it('parses the interaction frame carrying the id the node persists', () => {
    const parsed = reparse('interaction', { interactionId: 'v1_abc' });
    expect(parsed.success).toBe(true);
  });

  it('parses a video frame with durable storage coordinates and defaults the mime', () => {
    const parsed = reparse('video', {
      signedUrl: 'https://example.com/clip.mp4',
      storagePath: 'brand-1/canvas-creations/omni/v1_abc.mp4',
      bucket: 'omni-video',
      assetId: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'video') {
      expect(parsed.data.data.mimeType).toBe('video/mp4');
    }
  });

  it('parses started/progress/complete/error frames', () => {
    expect(reparse('omni_started', { turn: 'generate' }).success).toBe(true);
    expect(reparse('progress', { pct: 40, phase: 'generating' }).success).toBe(true);
    expect(reparse('complete', { interactionId: 'v1_abc' }).success).toBe(true);
    expect(reparse('error', { message: 'boom' }).success).toBe(true);
  });

  it('rejects an unknown frame type and a video frame missing its url', () => {
    expect(reparse('nope', {}).success).toBe(false);
    expect(reparse('video', { storagePath: 'x', bucket: 'omni-video' }).success).toBe(false);
  });
});
