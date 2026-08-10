import { describe, expect, it, mock } from 'bun:test';

const inlineRemoteImage = mock(async (_url: string) => ({
  dataUrl: 'data:image/jpeg;base64,SU1BR0U=',
  mimeType: 'image/jpeg',
}));
const resolveDroppedBase64 = mock(async () => ({ base64: 'U1VQQUJBU0U=', sourceName: 'from.png' }));

mock.module('@/lib/ai-studio/inlineRemoteImage', () => ({ inlineRemoteImage }));
mock.module('@/lib/ai-studio/referenceDropClient', () => ({ resolveDroppedBase64 }));

const { requiresInlineProxy, resolveCanvasDropBase64 } = await import('./resolveCanvasDropBase64');
const { resolveCreativeAssetDrop } = await import('./resolveCreativeAssetDrop');
const { setInstagramMediaDragData } = await import('../components/instagramMediaDrag');

describe('requiresInlineProxy', () => {
  it('flags Instagram/Facebook CDN references, which the browser cannot fetch (no CORS)', () => {
    expect(
      requiresInlineProxy({
        kind: 'remote',
        publicUrl: 'https://scontent.cdninstagram.com/v/a.jpg',
      }),
    ).toBe(true);
    expect(
      requiresInlineProxy({
        kind: 'remote',
        publicUrl: 'https://scontent-lax.xx.fbcdn.net/v/b.jpg',
      }),
    ).toBe(true);
  });

  it('leaves our own storage, non-https, malformed, and inline payloads alone', () => {
    expect(
      requiresInlineProxy({
        kind: 'remote',
        bucket: 'media',
        path: 'brand/a.png',
        publicUrl: 'https://project.supabase.co/storage/v1/object/sign/media/brand/a.png',
      }),
    ).toBe(false);
    expect(
      requiresInlineProxy({ kind: 'remote', publicUrl: 'http://x.cdninstagram.com/a.jpg' }),
    ).toBe(false);
    expect(requiresInlineProxy({ kind: 'remote', publicUrl: 'not a url' })).toBe(false);
    expect(requiresInlineProxy({ kind: 'remote' })).toBe(false);
    expect(requiresInlineProxy({ kind: 'data-url', mimeType: 'image/png', base64: 'x' })).toBe(
      false,
    );
  });
});

describe('resolveCanvasDropBase64', () => {
  it('routes an Instagram CDN drop through the server-side inline proxy', async () => {
    inlineRemoteImage.mockClear();
    const url = 'https://scontent.cdninstagram.com/v/t51/photo.jpg?stp=dst-jpg';

    const resolved = await resolveCanvasDropBase64({ kind: 'remote', publicUrl: url }, 1_000_000);

    expect(inlineRemoteImage).toHaveBeenCalledWith(url);
    expect(resolved.base64).toBe('SU1BR0U=');
    expect(resolved.sourceName).toBe('photo.jpg');
    expect(resolved.sourceUrl).toBe(url);
    expect(resolved.byteLength).toBe(5);
  });

  it('keeps Supabase references on the ordinary client-side resolver', async () => {
    resolveDroppedBase64.mockClear();
    const parsed = { kind: 'remote', bucket: 'media', path: 'brand/a.png' } as const;

    const resolved = await resolveCanvasDropBase64(parsed, 1_000_000);

    expect(resolveDroppedBase64).toHaveBeenCalledTimes(1);
    expect(resolved.base64).toBe('U1VQQUJBU0U=');
  });

  // #249/#250 end to end at the unit seam: what an Instagram tile writes onto the
  // DataTransfer is exactly what the canvas drop path reads back.
  it('turns an Instagram tile drag payload into an image node data URL', async () => {
    const url = 'https://scontent.cdninstagram.com/v/t51/photo.jpg';
    const store = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'uninitialized',
      setData: (format: string, value: string) => {
        store.set(format, value);
      },
    };
    setInstagramMediaDragData(dataTransfer as unknown as DataTransfer, url);

    const resolved = await resolveCreativeAssetDrop(
      store.get('text/plain') ?? '',
      resolveCanvasDropBase64,
    );

    expect(resolved.status).toBe('success');
    if (resolved.status !== 'success') return;
    expect(resolved.nodeType).toBe('image');
    expect(resolved.dataUrl).toBe('data:image/jpeg;base64,SU1BR0U=');
    expect(resolved.sourceUrl).toBe(url);
  });
});
