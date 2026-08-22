// Server-side proxy that fetches an Instagram/Facebook CDN image and returns it
// as an inline base64 data URL. Browsers cannot read these CDN URLs (no CORS
// headers), so canvas reference images grabbed from Instagram are otherwise
// invisible to the generation model. Fetching server-side bypasses CORS.
//
// SSRF defense: only https URLs on the Instagram/Facebook CDN host allowlist are
// fetched. This route does real work (fetch + encode) and is not a thin
// auth-forwarding proxy.

import { type NextRequest, NextResponse } from 'next/server';

import { IMAGE_REFERENCE_MAX_BYTES } from '@/lib/ai-studio/referenceDrop';

const ALLOWED_HOST_SUFFIXES = ['.cdninstagram.com', '.fbcdn.net'];

function isAllowedImageUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) || host === suffix.slice(1));
}

export async function POST(request: NextRequest) {
  let url: unknown;
  try {
    ({ url } = (await request.json()) as { url?: unknown });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof url !== 'string' || url.trim().length === 0) {
    return NextResponse.json({ error: 'A url is required' }, { status: 400 });
  }

  if (!isAllowedImageUrl(url)) {
    return NextResponse.json(
      { error: 'Only https Instagram/Facebook CDN image URLs are allowed' },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    // Manual redirect handling: the host allowlist only validates the initial
    // URL, so following a redirect from an allowlisted host could reach an
    // internal address (SSRF). Reject any 3xx instead of chasing Location.
    upstream = await fetch(url, { redirect: 'manual' });
  } catch (error) {
    console.error('inline-media upstream fetch threw:', error);
    return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    console.warn(`inline-media refused redirect (${upstream.status}) for image fetch`);
    return NextResponse.json({ error: 'Redirects are not allowed' }, { status: 400 });
  }

  if (!upstream.ok) {
    console.warn(`inline-media upstream responded ${upstream.status} for image fetch`);
    return NextResponse.json({ error: `Upstream responded ${upstream.status}` }, { status: 502 });
  }

  const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (!contentType.startsWith('image/')) {
    return NextResponse.json(
      { error: `Expected an image, received ${contentType || 'unknown'}` },
      { status: 415 },
    );
  }

  const declaredLength = Number(upstream.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > IMAGE_REFERENCE_MAX_BYTES) {
    return NextResponse.json({ error: 'Image exceeds size limit' }, { status: 413 });
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  if (buffer.byteLength > IMAGE_REFERENCE_MAX_BYTES) {
    return NextResponse.json({ error: 'Image exceeds size limit' }, { status: 413 });
  }

  const base64 = buffer.toString('base64');
  return NextResponse.json({
    dataUrl: `data:${contentType};base64,${base64}`,
    mimeType: contentType,
    byteLength: buffer.byteLength,
  });
}
