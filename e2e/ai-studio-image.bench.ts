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
 *   4. A NEGATIVE PROMPT IS ACCEPTED         — wired from a text node into the new
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
 *   bun run dev:be                      # backend on :4000, with a real GEMINI_API_KEY
 * Run with: bun run ai-studio:image:bench          (add -- --full for the 2K/4K tiers)
 */

import { coerceImageSize, createNodeData, IMAGE_SIZE_PIXELS } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../src/StudioCanvas/types';
import type { NodeOutput } from '../src/StudioCanvas/types/execution';
import { buildNanoGenPayload, toBackendPayload } from '../src/StudioCanvas/utils/buildNodePayload';
import { mintAccessTokenForEmail } from './support/auth';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const OWNER_EMAIL = process.env.BENCH_OWNER_EMAIL ?? 'local@continuum.test';
const BRAND_ID = process.env.BENCH_BRAND_ID ?? '00000000-0000-0000-0000-0000000000b1';
const FULL = process.argv.includes('--full');

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
}

async function generate(body: Record<string, unknown>, token: string): Promise<GenerationOutcome> {
  const res = await fetch(`${API}/ai-studio/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (res.status !== 200 || !res.body) {
    return { status: res.status, error: (await res.text()).slice(0, 300) };
  }

  let signedUrl: string | undefined;
  let base64: string | undefined;
  let mimeType: string | undefined;
  let streamError: string | undefined;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const event = chunk.match(/^event: (.+)$/m)?.[1];
      const raw = chunk.match(/^data: (.+)$/m)?.[1];
      if (!event || !raw) continue;
      const data = JSON.parse(raw) as Record<string, unknown>;

      if (event === 'image') {
        if (typeof data.signed_url === 'string') signedUrl = data.signed_url;
        if (typeof data.base64 === 'string') base64 = data.base64;
        if (typeof data.mime_type === 'string') mimeType = data.mime_type;
      }
      if (event === 'error') streamError = String(data.message ?? 'unknown');
    }
  }

  if (streamError) return { status: 200, error: streamError };

  if (base64) {
    return { status: 200, bytes: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), mimeType };
  }
  if (signedUrl) {
    const image = await fetch(signedUrl);
    if (!image.ok) return { status: 200, error: `signed url ${image.status}` };
    return { status: 200, bytes: new Uint8Array(await image.arrayBuffer()), mimeType };
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

function payloadFor(node: StudioNode, extra: { nodes?: StudioNode[]; edges?: Edge[] } = {}) {
  const allNodes = [node, ...(extra.nodes ?? [])];
  const built = buildNanoGenPayload(
    node,
    new Map<string, NodeOutput>(),
    allNodes,
    extra.edges ?? [],
    BRAND_ID,
  );
  if (!built) throw new Error('payload builder returned null');
  return toBackendPayload(built);
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
}

async function main(): Promise<void> {
  console.log('── AI Studio image bench ─────────────────────────────────');
  console.log(`api    ${API}`);
  console.log(`brand  ${BRAND_ID}`);
  console.log(`owner  ${OWNER_EMAIL}`);
  console.log('');

  const token = await mintAccessTokenForEmail(OWNER_EMAIL);

  console.log('model x size — every combination the canvas can produce');

  // gemini-2.5-flash-image takes no size parameter at all: it always renders 1024px.
  // The node no longer offers a size for it, and no longer implies one.
  await runCase(
    'nano-banana (no size) 16:9',
    genNode({
      model: 'nano-banana',
      positivePrompt: 'a red sneaker on wet concrete',
      aspectRatio: '16:9',
    }),
    token,
  );

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

  if (FULL) {
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
    skip('2K / 4K tiers', 'slow + costly; run with -- --full');
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
  await runCase('agent-authored node generates (was: 400 on every run)', agentNode, token);

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
  await runCase('generation with a negative prompt returns an image', negNode, token, {
    nodes: [avoid],
    edges: [negativeEdge],
  });

  note(
    'NOT covered by this run: the exact bytes of the Vertex request body. That the negative ' +
      'text is folded into the outgoing Gemini instruction is asserted in-process by ' +
      'Continuum-Backend/App/ai-studio/services/image-service.spec.ts.',
  );
  note(
    'NOT covered by this run: gpt-image-2 / flux-2-* (fal-hosted, need FAL_KEY and paid credit). ' +
      'They take no imageSize, which the node now reflects.',
  );

  console.log('');
  console.log(
    failures === 0
      ? `PASS — ai-studio:image: every model x size generated, at the size it claimed.`
      : `FAIL — ai-studio:image: ${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('bench crashed:', err);
  process.exit(1);
});
