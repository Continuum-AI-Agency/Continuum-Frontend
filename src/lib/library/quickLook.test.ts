import { describe, expect, it } from 'bun:test';

import {
  buildQuickLookRequest,
  buildResizeRequest,
  ensureExtensionForMime,
  GENERATE_IMAGE_PATH,
  generateStudioImage,
  QUICK_LOOK_BASE_PROMPT,
  QUICK_LOOK_MODEL,
  RESIZE_PRESETS,
  type ResizePreset,
  registerResizedAsset,
  runWithConcurrency,
  type StudioImageResult,
  saveFileAsNewVersion,
  studioImageGenerateRequestSchema,
  studioResultToFile,
  suffixFileName,
} from './quickLook';

const ASSET = {
  bucket: 'media-library',
  storagePath: 'brand-1/asset-1/photo.png',
  signedUrl: 'https://signed.example/photo.png',
  mimeType: 'image/png',
  fileName: 'photo.png',
};

function sseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function fetchStub(response: Response, calls: { url: string; init?: RequestInit }[]) {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return response;
  }) as typeof fetch;
}

describe('RESIZE_PRESETS', () => {
  it('defines the five competitor-reference presets with unique ids', () => {
    expect(RESIZE_PRESETS).toHaveLength(5);
    expect(new Set(RESIZE_PRESETS.map((preset) => preset.id)).size).toBe(5);
    expect(RESIZE_PRESETS.filter((preset) => preset.platform === 'Instagram')).toHaveLength(4);
    expect(RESIZE_PRESETS.filter((preset) => preset.platform === 'X (Twitter)')).toHaveLength(1);
  });

  it('only sends model-supported integer aspect ratios on the wire', () => {
    for (const preset of RESIZE_PRESETS) {
      expect(preset.apiAspectRatio).toMatch(/^\d+:\d+$/);
    }
    const landscape = RESIZE_PRESETS.find((preset) => preset.id === 'ig-feed-landscape');
    expect(landscape?.ratio).toBe('1.91:1');
    expect(landscape?.apiAspectRatio).toBe('16:9');
  });
});

describe('suffixFileName', () => {
  it('inserts the suffix before the extension', () => {
    expect(suffixFileName('photo.png', '1x1')).toBe('photo-1x1.png');
  });

  it('appends when there is no extension', () => {
    expect(suffixFileName('photo', '9x16')).toBe('photo-9x16');
  });

  it('appends for dot-leading names', () => {
    expect(suffixFileName('.hidden', '1x1')).toBe('.hidden-1x1');
  });
});

describe('ensureExtensionForMime', () => {
  it('rewrites the extension when the mime differs', () => {
    expect(ensureExtensionForMime('photo-brand.jpg', 'image/png')).toBe('photo-brand.png');
  });

  it('keeps the name for unknown mimes', () => {
    expect(ensureExtensionForMime('photo.png', 'image/x-exotic')).toBe('photo.png');
  });

  it('adds an extension when the name has none', () => {
    expect(ensureExtensionForMime('photo', 'image/jpeg')).toBe('photo.jpg');
  });
});

describe('buildQuickLookRequest', () => {
  it('builds a schema-valid edit request from the asset reference', () => {
    const request = buildQuickLookRequest({
      brandId: 'brand-1',
      asset: ASSET,
      pieces: ['colors', 'logo'],
      instruction: 'Make it feel premium.',
    });
    expect(studioImageGenerateRequestSchema.parse(request)).toEqual(request);
    expect(request.model).toBe(QUICK_LOOK_MODEL);
    expect(request.brand_book_pieces).toEqual(['colors', 'logo']);
    expect(request.prompt).toStartWith(QUICK_LOOK_BASE_PROMPT);
    expect(request.prompt).toContain('Make it feel premium.');
    expect(request.filename).toBe('photo-brand.png');
    expect(request.reference_images).toEqual([
      {
        storage_bucket: 'media-library',
        storage_path: 'brand-1/asset-1/photo.png',
        image_url: 'https://signed.example/photo.png',
        mime_type: 'image/png',
        filename: 'photo.png',
      },
    ]);
  });

  it('defaults to the full brand book when no pieces are picked', () => {
    const request = buildQuickLookRequest({ brandId: 'brand-1', asset: ASSET, pieces: [] });
    expect(request.brand_book_pieces).toEqual(['full']);
    expect(request.prompt).toBe(QUICK_LOOK_BASE_PROMPT);
  });

  it('omits the signed-url fallback when the asset has none', () => {
    const request = buildQuickLookRequest({
      brandId: 'brand-1',
      asset: { ...ASSET, signedUrl: null },
      pieces: ['full'],
    });
    expect(request.reference_images[0]).not.toHaveProperty('image_url');
  });
});

describe('buildResizeRequest', () => {
  it('carries the wire aspect ratio and a reframe instruction naming the target ratio', () => {
    const preset = RESIZE_PRESETS.find((candidate) => candidate.id === 'ig-feed-landscape');
    if (!preset) throw new Error('missing preset');
    const request = buildResizeRequest({ brandId: 'brand-1', asset: ASSET, preset });
    expect(studioImageGenerateRequestSchema.parse(request)).toEqual(request);
    expect(request.aspect_ratio).toBe('16:9');
    expect(request.prompt).toContain('1.91:1');
    expect(request.prompt).toContain('no letterboxing');
    expect(request.prompt).toContain('Instagram Feed landscape');
    expect(request.filename).toBe('photo-191x100.png');
    expect(request.brand_book_pieces).toBeUndefined();
  });
});

describe('generateStudioImage', () => {
  const request = buildQuickLookRequest({ brandId: 'brand-1', asset: ASSET, pieces: ['full'] });

  it('resolves the url-first image event merged with storage coords', async () => {
    const body = [
      'event: status\ndata: {"phase":"starting"}\n\n',
      'event: image\ndata: {"mime_type":"image/png","signed_url":"https://signed.example/out.png","bucket":"brand-profile-assets","path":"brand-1/out.png","thought":false}\n\n',
      'event: stored\ndata: {"bucket":"brand-profile-assets","path":"brand-1/out.png","signed_url":"https://signed.example/out.png"}\n\n',
      'event: complete\ndata: {"brand_id":"brand-1"}\n\n',
    ].join('');
    const calls: { url: string; init?: RequestInit }[] = [];
    const result = await generateStudioImage(request, {
      fetchImpl: fetchStub(sseResponse(body), calls),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(GENERATE_IMAGE_PATH);
    expect(calls[0].init?.method).toBe('POST');
    expect(result).toEqual({
      mimeType: 'image/png',
      signedUrl: 'https://signed.example/out.png',
      bucket: 'brand-profile-assets',
      path: 'brand-1/out.png',
    });
  });

  it('skips thought images and falls back to base64 in legacy mode', async () => {
    const body = [
      'event: image\ndata: {"mime_type":"image/png","base64":"dGhvdWdodA==","thought":true}\n\n',
      'event: image\ndata: {"mime_type":"image/png","base64":"ZmluYWw=","thought":false}\n\n',
      'event: complete\ndata: {}\n\n',
    ].join('');
    const result = await generateStudioImage(request, {
      fetchImpl: fetchStub(sseResponse(body), []),
    });
    expect(result.base64).toBe('ZmluYWw=');
    expect(result.signedUrl).toBeUndefined();
  });

  it('throws the stream error message', async () => {
    const body = 'event: error\ndata: {"message":"vertex quota exceeded"}\n\n';
    await expect(
      generateStudioImage(request, { fetchImpl: fetchStub(sseResponse(body), []) }),
    ).rejects.toThrow('vertex quota exceeded');
  });

  it('throws when the stream ends without an image', async () => {
    const body = 'event: status\ndata: {"phase":"starting"}\n\n';
    await expect(
      generateStudioImage(request, { fetchImpl: fetchStub(sseResponse(body), []) }),
    ).rejects.toThrow('AI Studio returned no image');
  });

  it('surfaces the HTTP error body for non-2xx responses', async () => {
    const response = new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
    await expect(
      generateStudioImage(request, { fetchImpl: fetchStub(response, []) }),
    ).rejects.toThrow('Invalid payload');
  });
});

describe('studioResultToFile', () => {
  it('downloads signed-url results and realigns the extension to the blob mime', async () => {
    const result: StudioImageResult = {
      mimeType: 'image/png',
      signedUrl: 'https://signed.example/out',
    };
    const response = new Response(new Blob(['bytes'], { type: 'image/jpeg' }), { status: 200 });
    const file = await studioResultToFile(result, 'photo-brand.png', {
      fetchImpl: fetchStub(response, []),
    });
    expect(file.name).toBe('photo-brand.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(file.size).toBeGreaterThan(0);
  });

  it('decodes base64 results without any fetch', async () => {
    const result: StudioImageResult = { mimeType: 'image/png', base64: btoa('pixels') };
    const file = await studioResultToFile(result, 'photo-1x1.png');
    expect(file.name).toBe('photo-1x1.png');
    expect(file.type).toBe('image/png');
    expect(await file.text()).toBe('pixels');
  });

  it('decodes data-url results using the embedded mime', async () => {
    const result: StudioImageResult = {
      mimeType: 'image/png',
      base64: `data:image/jpeg;base64,${btoa('pixels')}`,
    };
    const file = await studioResultToFile(result, 'photo.png');
    expect(file.name).toBe('photo.jpg');
    expect(file.type).toBe('image/jpeg');
  });

  it('rejects results that carry no bytes', async () => {
    await expect(studioResultToFile({ mimeType: 'image/png' }, 'photo.png')).rejects.toThrow(
      'no image bytes',
    );
  });
});

describe('saveFileAsNewVersion', () => {
  const TICKET = {
    bucket: 'media-library',
    path: 'brand-1/asset-1/v2/photo-brand.png',
    token: 'signed-token',
    versionNumber: 2,
  };
  const REGISTERED = {
    assetId: 'asset-1',
    versionNumber: 2,
    versions: [],
  };

  function makeVersionFetch(bodies: unknown[], urls: string[]) {
    return (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      bodies.push(JSON.parse(String(init?.body)));
      if (url.endsWith('/api/library/versions/sign')) {
        return new Response(JSON.stringify(TICKET), { status: 200 });
      }
      return new Response(JSON.stringify(REGISTERED), { status: 200 });
    }) as typeof fetch;
  }

  function makeSupabaseStub(calls: string[]) {
    const client = {
      storage: {
        from: (bucket: string) => ({
          uploadToSignedUrl: async (path: string, token: string) => {
            calls.push(`upload:${bucket}:${path}:${token}`);
            return { error: null };
          },
        }),
      },
    };
    return client as unknown as ReturnType<
      typeof import('@/lib/supabase/client').createSupabaseBrowserClient
    >;
  }

  it('signs, uploads, and registers per the contracts shapes', async () => {
    const bodies: unknown[] = [];
    const urls: string[] = [];
    const uploads: string[] = [];
    const file = new File(['pixels'], 'photo-brand.png', { type: 'image/png' });

    const versionNumber = await saveFileAsNewVersion(
      { brandId: 'brand-1', assetId: 'asset-1', file, note: 'Brand quick look' },
      { fetchImpl: makeVersionFetch(bodies, urls), createClient: () => makeSupabaseStub(uploads) },
    );

    expect(versionNumber).toBe(2);
    expect(urls).toEqual(['/api/library/versions/sign', '/api/library/versions']);
    expect(bodies[0]).toEqual({
      brandId: 'brand-1',
      assetId: 'asset-1',
      fileName: 'photo-brand.png',
      mimeType: 'image/png',
    });
    expect(uploads).toEqual([
      'upload:media-library:brand-1/asset-1/v2/photo-brand.png:signed-token',
    ]);
    expect(bodies[1]).toEqual({
      brandId: 'brand-1',
      assetId: 'asset-1',
      bucket: 'media-library',
      storagePath: 'brand-1/asset-1/v2/photo-brand.png',
      fileName: 'photo-brand.png',
      mimeType: 'image/png',
      sizeBytes: file.size,
      note: 'Brand quick look',
    });
  });

  it('propagates a storage upload failure without registering', async () => {
    const bodies: unknown[] = [];
    const urls: string[] = [];
    const failingClient = {
      storage: {
        from: () => ({
          uploadToSignedUrl: async () => ({ error: { message: 'denied' } }),
        }),
      },
    } as unknown as ReturnType<typeof import('@/lib/supabase/client').createSupabaseBrowserClient>;
    const file = new File(['pixels'], 'photo.png', { type: 'image/png' });

    await expect(
      saveFileAsNewVersion(
        { brandId: 'brand-1', assetId: 'asset-1', file },
        { fetchImpl: makeVersionFetch(bodies, urls), createClient: () => failingClient },
      ),
    ).rejects.toThrow('upload to storage failed: denied');
    expect(urls).toEqual(['/api/library/versions/sign']);
  });
});

describe('registerResizedAsset', () => {
  const SOURCE = { id: '11111111-1111-4111-8111-111111111111', fileName: 'photo.png' };
  const PRESET = RESIZE_PRESETS.find((preset) => preset.id === 'ig-story-reel') as ResizePreset;
  const STORED: StudioImageResult = {
    mimeType: 'image/jpeg',
    bucket: 'brand-profile-assets',
    path: 'brand-1/canvas/out.png',
    signedUrl: 'https://signed.example/out.png',
  };

  function makeRegisterFetch(bodies: unknown[], urls: string[], assetId: string | null = 'new-1') {
    return (async (input: URL | RequestInfo, init?: RequestInit) => {
      urls.push(String(input));
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ assetId }), { status: 200 });
    }) as typeof fetch;
  }

  it('registers the stored output in place, naming the asset it was reframed from', async () => {
    const bodies: unknown[] = [];
    const urls: string[] = [];

    const assetId = await registerResizedAsset(
      { brandId: 'brand-1', asset: SOURCE, preset: PRESET, result: STORED },
      { fetchImpl: makeRegisterFetch(bodies, urls) },
    );

    expect(assetId).toBe('new-1');
    expect(urls).toEqual(['/api/library/register-canvas']);
    expect(bodies[0]).toEqual({
      brandProfileId: 'brand-1',
      kind: 'image',
      bucket: 'brand-profile-assets',
      storagePath: 'brand-1/canvas/out.png',
      // extension realigned to the generated bytes, suffix names the placement
      fileName: 'photo-9x16.jpg',
      mimeType: 'image/jpeg',
      originRef: {
        kind: 'resize',
        sourceAssetId: SOURCE.id,
        preset: 'ig-story-reel',
        aspectRatio: '9:16',
        model: QUICK_LOOK_MODEL,
      },
    });
  });

  it('refuses a result the backend never stored — there is nothing to register in place', async () => {
    await expect(
      registerResizedAsset({
        brandId: 'brand-1',
        asset: SOURCE,
        preset: PRESET,
        result: { mimeType: 'image/png', base64: btoa('pixels') },
      }),
    ).rejects.toThrow('was not stored');
  });

  it('surfaces the route error body', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })) as typeof fetch;
    await expect(
      registerResizedAsset(
        { brandId: 'brand-1', asset: SOURCE, preset: PRESET, result: STORED },
        { fetchImpl },
      ),
    ).rejects.toThrow('Register request failed (403): Forbidden');
  });
});

describe('runWithConcurrency', () => {
  it('preserves result order and caps in-flight tasks', async () => {
    let inFlight = 0;
    let peak = 0;
    const tasks = [30, 10, 20, 5, 15].map((delayMs, index) => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      inFlight -= 1;
      return index;
    });
    const results = await runWithConcurrency(tasks, 2);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1);
  });
});
