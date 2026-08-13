/**
 * AI Studio image generation — end-to-end bench.
 *
 * Four production bugs met on this path, and every one of them was invisible to the
 * unit tests because each layer was internally consistent and disagreed with the next.
 * So this bench refuses to look at any intermediate: it drives the REAL canvas node
 * through the REAL Frontend payload builder, over REAL HTTP to the REAL backend route,
 * into the REAL Gemini API, and then DECODES THE RETURNED IMAGE and measures its actual
 * pixels. Nothing here is mocked and no payload is hand-written.
 *
 * What it proves, and why each is the observable outcome rather than a proxy:
 *
 *   1. EVERY (model x size) GENERATES        — 200 + an image actually comes back. The
 *      shipped bug was a hard 400 on every single image generation: the canvas passed
 *      `imageSize` through raw for nano-banana-2, and `1024px` (a value that exists
 *      nowhere) is not in the backend enum.
 *   2. THE PIXELS MATCH THE SIZE ASKED FOR   — the decoded image's long edge matches the
 *      requested tier. "Images create in 1024px" was the report; a size that is accepted
 *      and then ignored looks identical to one that works, unless you measure.
 *   3. AN AGENT-AUTHORED NODE RUNS           — a node written by the canvas agent with
 *      the exact illegal `imageSize: "1024px"` that shipped is corrected at WRITE time
 *      and generates. This is the node that 400d in production.
 *   4. VARIATIONS FAN OUT FOR REAL       — num_images=4 returns FOUR image events with
 *      distinct variation indices, four distinct storage paths, four distinct asset-ledger
 *      rows, and four signed URLs that each download real bytes. Counting events is not
 *      enough: one image announced four times passes a count and fails this.
 *   5. A NEGATIVE PROMPT IS ACCEPTED         — wired from a text node into the new
 *      `negative` handle, it survives the payload builder, the request schema (which used
 *      to silently strip it) and the generation.
 *
 * NOT covered here, stated plainly rather than implied: this bench cannot see the exact
 * request body the backend hands to Vertex, so "the negative prompt text is in the
 * outgoing Gemini request" is asserted in-process by the Backend spec
 * (App/ai-studio/services/image-service.spec.ts), not by this run. What this run proves
 * is the whole chain accepts it and returns a real image.
 *
 * Prerequisites:
 *   bun run supabase:start && bun run supabase:hydrate && bun run supabase:env:local
 *   cd Continuum-Backend && bun run ai-studio:image:bench:server
 * Run with: bun run ai-studio:sniper:e2e:bench     (add -- --full for the full matrix)
 */

import { coerceImageSize, createNodeData, IMAGE_SIZE_PIXELS } from '@continuum/contracts';
import { createClient } from '@supabase/supabase-js';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../src/StudioCanvas/types';
import type { NodeOutput } from '../src/StudioCanvas/types/execution';
import { buildNanoGenPayload, toBackendPayload } from '../src/StudioCanvas/utils/buildNodePayload';
import { mintAccessTokenForEmail } from './support/auth';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const OWNER_EMAIL = process.env.BENCH_OWNER_EMAIL ?? 'local@continuum.test';
const BRAND_ID = process.env.BENCH_BRAND_ID ?? '00000000-0000-4000-8000-0000000000b2';
const FULL = process.argv.includes('--full');
const LATENCY = process.argv.includes('--latency');
const AZURE = process.argv.includes('--azure');
const IMAGE_BUCKET = 'brand-profile-assets';

let failures = 0;
const notes: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const skip = (name: string, why: string) => console.log(`  SKIP  ${name} — ${why}`);
const note = (message: string) => {
  notes.push(message);
  console.log(`  ·     ${message}`);
};

// ---------------------------------------------------------------------------
// Real pixel dimensions, read off the bytes the provider actually returned.
// ---------------------------------------------------------------------------

function decodeDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // PNG: IHDR width/height are big-endian u32 at offsets 16 and 20.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // JPEG: walk the segments to the first SOF marker; height/width follow it.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// The real route. It answers SSE, so read the stream to the `complete` frame.
// ---------------------------------------------------------------------------

interface GenerationOutcome {
  status: number;
  error?: string;
  bytes?: Uint8Array;
  mimeType?: string;
  timings?: {
    headersMs: number;
    durableMs?: number;
    completeMs?: number;
    totalMs: number;
    downloadMs?: number;
  };
  wireBytes?: number;
  assetId?: string;
  signedUrl?: string;
  storagePath?: string;
  storageBucket?: string;
  resolution?: string;
}

async function generate(body: Record<string, unknown>, token: string): Promise<GenerationOutcome> {
  const startedAt = performance.now();
  const res = await fetch(`${API}/ai-studio/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const headersAt = performance.now();

  if (res.status !== 200 || !res.body) {
    return { status: res.status, error: (await res.text()).slice(0, 300) };
  }

  let signedUrl: string | undefined;
  let base64: string | undefined;
  let mimeType: string | undefined;
  let streamError: string | undefined;
  let durableAt: number | undefined;
  let completeAt: number | undefined;
  let assetId: string | undefined;
  let storagePath: string | undefined;
  let storageBucket: string | undefined;
  let resolution: string | undefined;
  let wireBytes = 0;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    wireBytes += value.byteLength;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const raw = chunk.match(/^data: (.+)$/m)?.[1];
      if (!event || !raw) continue;
      const data = JSON.parse(raw) as Record<string, unknown>;

      if (event === 'image') {
        if (typeof data.signed_url === 'string') {
          signedUrl = data.signed_url;
          durableAt ??= performance.now();
        }
        if (typeof data.path === 'string') storagePath = data.path;
        if (typeof data.bucket === 'string') storageBucket = data.bucket;
        if (typeof data.base64 === 'string') {
          base64 = data.base64;
        }
        if (typeof data.mime_type === 'string') mimeType = data.mime_type;
        if (typeof data.resolution === 'string') resolution = data.resolution;
      }
      if (event === 'complete') {
        completeAt = performance.now();
        if (typeof data.asset_id === 'string') assetId = data.asset_id;
      }
      if (event === 'error') streamError = String(data.message ?? 'unknown');
    }
  }

  if (streamError) return { status: 200, error: streamError };

  const timingBase = {
    headersMs: headersAt - startedAt,
    durableMs: durableAt ? durableAt - startedAt : undefined,
    completeMs: completeAt ? completeAt - startedAt : undefined,
    totalMs: performance.now() - startedAt,
  };
  if (base64) {
    return { status: 200, error: 'successful stream leaked inline base64 instead of URL only' };
  }

  // Download the durable object separately for the final pixel-integrity check.
  if (signedUrl) {
    const downloadStartedAt = performance.now();
    const image = await fetch(signedUrl);
    if (!image.ok) return { status: 200, error: `signed url ${image.status}` };
    return {
      status: 200,
      bytes: new Uint8Array(await image.arrayBuffer()),
      mimeType,
      timings: { ...timingBase, downloadMs: performance.now() - downloadStartedAt },
      wireBytes,
      assetId,
      signedUrl,
      storagePath,
      storageBucket,
      resolution,
    };
  }
  return { status: 200, error: 'stream carried no image' };
}

// ---------------------------------------------------------------------------
// The canvas node -> payload path, exactly as the browser runs it.
// ---------------------------------------------------------------------------

const genNode = (data: Record<string, unknown>): StudioNode =>
  ({
    id: 'bench-gen',
    type: 'nanoGen',
    position: { x: 0, y: 0 },
    ...createNodeData('nanoGen', data),
  }) as unknown as StudioNode;

function payloadFor(
  node: StudioNode,
  extra: { nodes?: StudioNode[]; edges?: Edge[]; resolvedData?: Map<string, NodeOutput> } = {},
) {
  const allNodes = [node, ...(extra.nodes ?? [])];
  const built = buildNanoGenPayload(
    node,
    extra.resolvedData ?? new Map<string, NodeOutput>(),
    allNodes,
    extra.edges ?? [],
    BRAND_ID,
  );
  if (!built) throw new Error('payload builder returned null');
  return toBackendPayload(built);
}

async function cleanupAzureAssets(
  assetIds: readonly string[],
  objects: readonly { bucket?: string; path?: string }[],
  removeBenchBucket: boolean,
): Promise<void> {
  const url =
    process.env.SUPABASE_URL ??
    process.env.SUPABASE_PROJECT_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Azure image bench cleanup requires Supabase service config.');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const byBucket = new Map<string, string[]>();
  for (const object of objects) {
    if (!object.bucket || !object.path) continue;
    byBucket.set(object.bucket, [...(byBucket.get(object.bucket) ?? []), object.path]);
  }
  for (const [bucket, paths] of byBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw error;
  }
  if (assetIds.length > 0) {
    const { error } = await supabase.schema('media').from('assets').delete().in('id', assetIds);
    if (error) throw error;
  }
  if (removeBenchBucket) {
    const { error } = await supabase.storage.deleteBucket(IMAGE_BUCKET);
    if (error) throw error;
  }
}

async function ensureAzureBenchBucket(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Azure image bench requires Supabase service config.');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (data.some((bucket) => bucket.name === IMAGE_BUCKET)) return false;
  const { error: createError } = await supabase.storage.createBucket(IMAGE_BUCKET, {
    public: false,
  });
  if (createError) throw createError;
  return true;
}

async function runAzureCases(token: string): Promise<void> {
  console.log('Azure GPT Image 2 — real Canvas generation and edit');
  const assetIds: string[] = [];
  const objects: Array<{ bucket?: string; path?: string }> = [];
  const removeBenchBucket = await ensureAzureBenchBucket();

  try {
    const sourceNode = genNode({
      model: 'gpt-image-2',
      positivePrompt: 'a cobalt blue running shoe on clean white seamless paper',
      aspectRatio: '16:9',
    });
    const sourceBody = payloadFor(sourceNode);
    check('Canvas sends canonical gpt-image-2', sourceBody.model === 'gpt-image-2');
    const source = await generate(sourceBody as unknown as Record<string, unknown>, token);
    if (!source.bytes || !source.signedUrl) {
      check('Azure 16:9 generation', false, source.error ?? `status=${source.status}`);
      return;
    }
    const sourceDimensions = decodeDimensions(source.bytes);
    check(
      'Azure 16:9 generation delivers 1344x768',
      sourceDimensions?.width === 1344 && sourceDimensions.height === 768,
      sourceDimensions ? `${sourceDimensions.width}x${sourceDimensions.height}` : 'undecodable',
    );
    check(
      'Azure SSE metadata reports 1344x768',
      source.resolution === '1344x768',
      source.resolution,
    );
    check('Azure generation stays URL-only', (source.wireBytes ?? Infinity) < 128_000);
    check('Azure generation registers a durable asset', Boolean(source.assetId), source.assetId);
    if (source.assetId) assetIds.push(source.assetId);
    objects.push({ bucket: source.storageBucket, path: source.storagePath });

    const editNode = {
      ...genNode({
        model: 'gpt-image-2',
        positivePrompt: 'keep the shoe identical and place it on a brushed steel pedestal',
        aspectRatio: '1:1',
        variationCount: 2,
      }),
      id: 'bench-edit',
    } as StudioNode;
    const edge = {
      id: 'bench-source-to-edit',
      source: sourceNode.id,
      sourceHandle: 'image',
      target: editNode.id,
      targetHandle: 'ref-image',
    } as Edge;
    const editBody = payloadFor(editNode, {
      nodes: [sourceNode],
      edges: [edge],
      resolvedData: new Map([
        [
          sourceNode.id,
          {
            type: 'image',
            mimeType: source.mimeType ?? 'image/png',
            url: source.signedUrl,
            storagePath: source.storagePath,
            storageBucket: source.storageBucket,
            assetId: source.assetId,
          } as NodeOutput,
        ],
      ]),
    });
    check(
      'Canvas edit carries the real generated reference URL',
      Boolean(editBody.reference_images?.[0]?.image_url),
    );
    check('Canvas edit asks Azure for two variations', editBody.num_images === 2);

    const edited = await generateVariations(editBody as unknown as Record<string, unknown>, token);
    if (edited.error) {
      check('Azure reference edit', false, edited.error);
      return;
    }
    const editPaths = new Set(edited.images.map((image) => image.path).filter(Boolean));
    const editUrls = new Set(edited.images.map((image) => image.signedUrl).filter(Boolean));
    const editAssetIds = (edited.completeVariations ?? []).flatMap((variation) =>
      typeof variation.asset_id === 'string' ? [variation.asset_id] : [],
    );
    check('Azure edit returns two durable image events', edited.images.length === 2);
    check('Azure edit persists two distinct storage objects', editPaths.size === 2);
    check('Azure edit returns two distinct signed URLs', editUrls.size === 2);
    check('Azure edit registers two media ledger rows', new Set(editAssetIds).size === 2);
    check(
      'Azure edit stream stays URL-only',
      edited.images.every((image) => !image.base64 && image.delivery === 'durable') &&
        edited.wireBytes < 128_000,
    );
    assetIds.push(...editAssetIds);
    objects.push(...edited.images.map((image) => ({ bucket: image.bucket, path: image.path })));

    let downloadable = 0;
    for (const url of editUrls) {
      const response = await fetch(url);
      if (response.ok && (await response.arrayBuffer()).byteLength > 1000) downloadable += 1;
    }
    check('both Azure edit URLs download real bytes', downloadable === 2, `${downloadable}/2`);
  } finally {
    await cleanupAzureAssets([...new Set(assetIds)], objects, removeBenchBucket);
    console.log('  PASS  Azure bench assets cleaned up');
  }
}

/**
 * A size tier is a PIXEL BUDGET, not a long edge — measured, not assumed. "1K" at 16:9
 * comes back 1344x768, at 1:1 it comes back 1024x1024, and both are ~1.05 megapixels.
 * So the honest measure of "did it render at the size I asked for" is the geometric
 * mean of the returned dimensions against the tier. A model that ignored the size
 * entirely lands on a different tier and fails this.
 */
const expectedTierPixels = (size: string | undefined): number =>
  size ? IMAGE_SIZE_PIXELS[size as keyof typeof IMAGE_SIZE_PIXELS] : 1024;

async function runCase(
  label: string,
  node: StudioNode,
  token: string,
  wiring: { nodes?: StudioNode[]; edges?: Edge[] } = {},
): Promise<void> {
  const body = payloadFor(node, wiring);
  const expected = expectedTierPixels(body.image_size);

  const outcome = await generate(body as unknown as Record<string, unknown>, token);
  if (outcome.status !== 200 || !outcome.bytes) {
    check(label, false, `status=${outcome.status} ${outcome.error ?? ''}`);
    return;
  }

  const dims = decodeDimensions(outcome.bytes);
  if (!dims) {
    check(label, false, 'could not decode the returned image');
    return;
  }

  // Two independent claims, both measured off the returned pixels: it rendered at the
  // SIZE asked for, and in the SHAPE asked for. The shape half is what the node's own
  // box is now sized to — a node that lies about either one crops the render.
  const tierPixels = Math.sqrt(dims.width * dims.height);
  const withinTier = Math.abs(tierPixels - expected) / expected <= 0.1;

  const [w, h] = (body.aspect_ratio ?? '1:1').split(':').map(Number);
  const requestedRatio = w / h;
  const renderedRatio = dims.width / dims.height;
  const matchesShape = Math.abs(renderedRatio - requestedRatio) / requestedRatio <= 0.05;

  check(
    label,
    withinTier && matchesShape,
    `sent image_size=${body.image_size ?? '(none)'} aspect=${body.aspect_ratio} → ${dims.width}x${dims.height} ` +
      `(${(tierPixels / 1).toFixed(0)}px tier, expected ~${expected}; ratio ${renderedRatio.toFixed(2)} vs ${requestedRatio.toFixed(2)})`,
  );
  const timings = outcome.timings;
  if (timings) {
    console.log(
      `         headers=${timings.headersMs.toFixed(0)}ms durable=${timings.durableMs?.toFixed(0) ?? '-'}ms ` +
        `complete=${timings.completeMs?.toFixed(0) ?? '-'}ms total=${timings.totalMs.toFixed(0)}ms ` +
        `download=${timings.downloadMs?.toFixed(0) ?? '-'}ms wire=${outcome.wireBytes ?? 0}B`,
    );
  }
  check(
    `${label}: response stream stays URL-only`,
    (outcome.wireBytes ?? Number.POSITIVE_INFINITY) < 128_000,
    `wire=${outcome.wireBytes ?? 0}B`,
  );
  check(
    `${label}: backend registered one durable asset`,
    Boolean(outcome.assetId),
    outcome.assetId,
  );
}

// ---------------------------------------------------------------------------
// Variations (num_images). The single-image collector above deliberately keeps
// only the last durable URL, so a variation run needs its own collector: the
// whole claim here is that FOUR distinct images are persisted and announced, and
// a collector that collapses them cannot tell four from one.
// ---------------------------------------------------------------------------

interface VariationEvent {
  variationIndex?: number;
  signedUrl?: string;
  path?: string;
  bucket?: string;
  base64?: string;
  delivery?: string;
}

interface VariationOutcome {
  status: number;
  error?: string;
  images: VariationEvent[];
  completeVariations?: Array<Record<string, unknown>>;
  completeAssetId?: string;
  completeHasVariationsKey: boolean;
  wireBytes: number;
}

async function generateVariations(
  body: Record<string, unknown>,
  token: string,
): Promise<VariationOutcome> {
  const res = await fetch(`${API}/ai-studio/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const empty = { images: [], completeHasVariationsKey: false, wireBytes: 0 };
  if (res.status !== 200 || !res.body) {
    return { status: res.status, error: (await res.text()).slice(0, 300), ...empty };
  }

  const images: VariationEvent[] = [];
  let completeVariations: Array<Record<string, unknown>> | undefined;
  let completeAssetId: string | undefined;
  let completeHasVariationsKey = false;
  let streamError: string | undefined;
  let wireBytes = 0;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    wireBytes += value.byteLength;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const raw = chunk.match(/^data: (.+)$/m)?.[1];
      if (!event || !raw) continue;
      const data = JSON.parse(raw) as Record<string, unknown>;

      if (event === 'image') {
        images.push({
          variationIndex:
            typeof data.variation_index === 'number' ? data.variation_index : undefined,
          signedUrl: typeof data.signed_url === 'string' ? data.signed_url : undefined,
          path: typeof data.path === 'string' ? data.path : undefined,
          bucket: typeof data.bucket === 'string' ? data.bucket : undefined,
          base64: typeof data.base64 === 'string' ? data.base64 : undefined,
          delivery: typeof data.delivery === 'string' ? data.delivery : undefined,
        });
      }
      if (event === 'complete') {
        completeHasVariationsKey = Object.hasOwn(data, 'variations');
        if (Array.isArray(data.variations)) {
          completeVariations = data.variations as Array<Record<string, unknown>>;
        }
        if (typeof data.asset_id === 'string') completeAssetId = data.asset_id;
      }
      if (event === 'error') streamError = String(data.message ?? 'unknown');
    }
  }

  return {
    status: 200,
    error: streamError,
    images,
    completeVariations,
    completeAssetId,
    completeHasVariationsKey,
    wireBytes,
  };
}

async function runVariationCases(token: string): Promise<void> {
  console.log('');
  console.log('variations — num_images fans out into distinct persisted images');

  const four = genNode({
    model: 'nano-banana-2',
    positivePrompt: 'a red sneaker on wet concrete, product photography',
    aspectRatio: '1:1',
    imageSize: '1K',
    variationCount: 4,
  });
  const body = payloadFor(four);

  check(
    'the canvas node sends num_images=4 on the wire',
    body.num_images === 4,
    `num_images=${String(body.num_images)}`,
  );

  const outcome = await generateVariations(body as unknown as Record<string, unknown>, token);
  if (outcome.status !== 200 || outcome.error) {
    check('four-variation generation', false, `status=${outcome.status} ${outcome.error ?? ''}`);
    return;
  }

  check(
    'four image events came back, one per variation',
    outcome.images.length === 4,
    `${outcome.images.length} image event(s)`,
  );
  check(
    'each image event is tagged with its own variation index',
    JSON.stringify(outcome.images.map((image) => image.variationIndex)) === '[0,1,2,3]',
    JSON.stringify(outcome.images.map((image) => image.variationIndex)),
  );

  // The URL-first requirement, and the thing a base64-shaped port would silently
  // skip: four SEPARATE objects in storage, not one image announced four times.
  const paths = new Set(outcome.images.map((image) => image.path).filter(Boolean));
  check(
    'each variation was persisted to its own storage path',
    paths.size === 4,
    `${paths.size} distinct path(s)`,
  );
  check(
    'no variation leaked inline base64 on the success path',
    outcome.images.every((image) => !image.base64 && image.delivery === 'durable'),
  );

  const assetIds = new Set(
    (outcome.completeVariations ?? [])
      .map((variation) => variation.asset_id)
      .filter((assetId): assetId is string => typeof assetId === 'string'),
  );
  check(
    'four distinct rows landed in the media asset ledger',
    assetIds.size === 4,
    `${assetIds.size} distinct asset id(s)`,
  );
  check(
    'complete carries the per-variation manifest',
    (outcome.completeVariations ?? []).length === 4,
    `${(outcome.completeVariations ?? []).length} entries`,
  );

  // Every signed URL must actually resolve to bytes; a path recorded but never
  // uploaded would pass every check above.
  let downloadable = 0;
  for (const image of outcome.images) {
    if (!image.signedUrl) continue;
    const res = await fetch(image.signedUrl);
    if (res.ok && (await res.arrayBuffer()).byteLength > 1000) downloadable++;
  }
  check(
    'every variation signed URL downloads real bytes',
    downloadable === 4,
    `${downloadable}/4 downloadable`,
  );

  // Downstream routing, against the URLs this run actually produced: an edge on
  // image-2 must feed VARIATION 2 into the consumer's reference images.
  const producedOutput: NodeOutput = {
    type: 'images',
    items: outcome.images.map((image) => ({
      mimeType: 'image/png',
      url: image.signedUrl,
      storagePath: image.path,
      storageBucket: image.bucket,
    })),
  };
  const consumer = genNode({
    model: 'nano-banana',
    positivePrompt: 'use the reference',
    aspectRatio: '1:1',
  });
  const consumerNode = { ...consumer, id: 'bench-consumer' } as StudioNode;
  const variationEdge = {
    id: 'e-variation',
    source: 'bench-gen',
    sourceHandle: 'image-2',
    target: 'bench-consumer',
    targetHandle: 'ref-image',
  } as Edge;

  const routed = toBackendPayload(
    buildNanoGenPayload(
      consumerNode,
      new Map<string, NodeOutput>([['bench-gen', producedOutput]]),
      [four, consumerNode],
      [variationEdge],
      BRAND_ID,
    )!,
  );
  check(
    'an image-2 edge routes variation 2 downstream, not variation 0',
    routed.reference_images?.[0]?.image_url === outcome.images[2]?.signedUrl,
    `routed=${routed.reference_images?.[0]?.image_url?.slice(-28) ?? '(none)'} expected=${outcome.images[2]?.signedUrl?.slice(-28) ?? '(none)'}`,
  );

  // Regression guard: a single-image run must be indistinguishable from what it
  // was before variations existed.
  const single = genNode({
    model: 'nano-banana-2',
    positivePrompt: 'a red sneaker on wet concrete, product photography',
    aspectRatio: '1:1',
    imageSize: '1K',
    variationCount: 1,
  });
  const singleBody = payloadFor(single);
  check(
    'a single-image request sends no num_images at all',
    singleBody.num_images === undefined,
    `num_images=${String(singleBody.num_images)}`,
  );

  const singleOutcome = await generateVariations(
    singleBody as unknown as Record<string, unknown>,
    token,
  );
  check(
    'a single-image run still emits exactly one image event',
    singleOutcome.images.length === 1,
    `${singleOutcome.images.length} image event(s)`,
  );
  check(
    'a single-image complete carries no variations key',
    !singleOutcome.completeHasVariationsKey,
  );
  check(
    'a single-image run still registers its asset',
    Boolean(singleOutcome.completeAssetId),
    singleOutcome.completeAssetId,
  );
}

async function main(): Promise<void> {
  console.log('── AI Studio image bench ─────────────────────────────────');
  console.log(`api    ${API}`);
  console.log(`brand  ${BRAND_ID}`);
  console.log(`owner  ${OWNER_EMAIL}`);
  console.log('');

  const token = await mintAccessTokenForEmail(OWNER_EMAIL);

  if (AZURE) {
    await runAzureCases(token);
    console.log('');
    console.log(
      failures === 0
        ? 'PASS — Azure GPT Image 2 generated, edited, persisted, registered, and cleaned up.'
        : `FAIL — Azure GPT Image 2: ${failures} check(s) failed.`,
    );
    process.exit(failures === 0 ? 0 : 1);
  }

  console.log('model x size — every combination the canvas can produce');

  // gemini-2.5-flash-image takes no size parameter at all: it always renders 1024px.
  // The node no longer offers a size for it, and no longer implies one.
  if (FULL) {
    await runCase(
      'nano-banana (no size) 16:9',
      genNode({
        model: 'nano-banana',
        positivePrompt: 'a red sneaker on wet concrete',
        aspectRatio: '16:9',
      }),
      token,
    );
  }

  await runCase(
    'nano-banana-2 @ 512px 1:1',
    genNode({
      model: 'nano-banana-2',
      imageSize: '512px',
      positivePrompt: 'a red sneaker on wet concrete',
      aspectRatio: '1:1',
    }),
    token,
  );

  if (LATENCY) {
    for (let run = 2; run <= 3; run += 1) {
      await runCase(
        `nano-banana-2 @ 512px latency run ${run}/3`,
        genNode({
          model: 'nano-banana-2',
          imageSize: '512px',
          positivePrompt: 'a red sneaker on wet concrete',
          aspectRatio: '1:1',
        }),
        token,
      );
    }
  }

  if (FULL) {
    await runCase(
      'nano-banana-2 @ 1K 9:16',
      genNode({
        model: 'nano-banana-2',
        imageSize: '1K',
        positivePrompt: 'a red sneaker on wet concrete',
        aspectRatio: '9:16',
      }),
      token,
    );
    await runCase(
      'nano-banana-pro @ 1K 16:9',
      genNode({
        model: 'nano-banana-pro',
        imageSize: '1K',
        positivePrompt: 'a red sneaker on wet concrete',
        aspectRatio: '16:9',
      }),
      token,
    );
    await runCase(
      'nano-banana-2 @ 2K 1:1',
      genNode({
        model: 'nano-banana-2',
        imageSize: '2K',
        positivePrompt: 'a red sneaker on wet concrete',
        aspectRatio: '1:1',
      }),
      token,
    );
    await runCase(
      'nano-banana-pro @ 4K 16:9',
      genNode({
        model: 'nano-banana-pro',
        imageSize: '4K',
        positivePrompt: 'a red sneaker on wet concrete',
        aspectRatio: '16:9',
      }),
      token,
    );
  } else {
    skip('full model/size matrix', 'slow + costly; run with -- --full');
  }

  console.log('');
  console.log('the node that shipped the bug — written by the canvas agent');

  // This is the production failure, reproduced exactly: the composer wrote
  // `imageSize: "1024px"` onto a nanoGen node (ref `gen_running`) and every Run on it
  // 400d. The value is corrected where it is WRITTEN now, so the node generates.
  const agentNode = genNode({
    model: 'nano-banana-2',
    imageSize: '1024px',
    positivePrompt: 'a red sneaker on wet concrete',
    aspectRatio: '1:1',
  });
  check(
    'agent-authored "1024px" is corrected at write time',
    (agentNode.data as { imageSize?: string }).imageSize === '1K',
    `node carries imageSize=${(agentNode.data as { imageSize?: string }).imageSize}`,
  );
  check(
    'the payload the canvas sends is legal',
    payloadFor(agentNode).image_size === '1K',
    `image_size=${payloadFor(agentNode).image_size}`,
  );
  if (FULL) {
    await runCase('agent-authored node generates (was: 400 on every run)', agentNode, token);
  } else {
    skip('agent-authored node paid generation', 'payload legality is checked above; use -- --full');
  }

  console.log('');
  console.log('negative prompt — wired from a text node into the `negative` handle');

  const avoid: StudioNode = {
    id: 'bench-avoid',
    type: 'string',
    position: { x: 0, y: 0 },
    data: { value: 'text, watermarks, logos, hands' },
  } as unknown as StudioNode;
  const negativeEdge: Edge = {
    id: 'bench-e-negative',
    source: 'bench-avoid',
    target: 'bench-gen',
    sourceHandle: 'text',
    targetHandle: 'negative',
  };
  const negNode = genNode({
    model: 'nano-banana-2',
    imageSize: '512px',
    positivePrompt: 'a red sneaker on wet concrete',
    aspectRatio: '1:1',
  });
  const negPayload = payloadFor(negNode, { nodes: [avoid], edges: [negativeEdge] });

  check(
    'the wired negative prompt reaches the request body',
    negPayload.negative_prompt === 'text, watermarks, logos, hands',
    `negative_prompt=${negPayload.negative_prompt ?? '(absent)'}`,
  );
  if (FULL) {
    await runCase('generation with a negative prompt returns an image', negNode, token, {
      nodes: [avoid],
      edges: [negativeEdge],
    });
  } else {
    skip('negative-prompt paid generation', 'wire contract is checked above; use -- --full');
  }

  await runVariationCases(token);

  note(
    'NOT covered by this run: the exact bytes of the Vertex request body. That the negative ' +
      'text is folded into the outgoing Gemini instruction is asserted in-process by ' +
      'Continuum-Backend/App/ai-studio/services/image-service.spec.ts.',
  );
  note(
    'NOT covered by this run: gpt-image-2 (run with -- --azure) or flux-2-* (need FAL_KEY). ' +
      'They take no imageSize, which the node reflects.',
  );

  console.log('');
  console.log(
    failures === 0
      ? `PASS — ai-studio:image sniper path generated, persisted, returned URL-only, and registered.`
      : `FAIL — ai-studio:image: ${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('bench crashed:', err);
  process.exit(1);
});
