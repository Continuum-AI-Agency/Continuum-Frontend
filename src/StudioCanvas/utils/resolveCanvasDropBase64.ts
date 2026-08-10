// Base64 resolver for canvas drops.
//
// The default resolver reads the dropped reference with a browser `fetch`, which
// works for our own Supabase storage but never for the Instagram/Facebook CDN:
// those hosts send no CORS headers, so a photo dragged out of the "Import from
// Instagram" panel died as "Drop failed" on both the canvas and an Image
// Reference node. Those URLs go through the same server-side inline proxy the
// panel's "Place" button already uses; everything else keeps the Supabase path.

import { inlineRemoteImage } from '@/lib/ai-studio/inlineRemoteImage';
import type { ParsedReferenceDropPayload } from '@/lib/ai-studio/referenceDrop';
import { estimateBase64DecodedBytes } from '@/lib/ai-studio/referenceDrop';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { parseDataUrl } from './dataUrl';
import type { Base64Resolver } from './resolveCreativeAssetDrop';

// Mirrors the allowlist enforced by /api/ai-studio/instagram/inline-media — the
// proxy rejects anything else, so routing other hosts through it would only turn
// a CORS failure into a 400.
const PROXIED_HOST_SUFFIXES = ['.cdninstagram.com', '.fbcdn.net'];

export function requiresInlineProxy(parsed: ParsedReferenceDropPayload): boolean {
  if (parsed.kind !== 'remote') return false;
  if (!parsed.publicUrl) return false;
  try {
    const { protocol, hostname } = new URL(parsed.publicUrl);
    if (protocol !== 'https:') return false;
    const host = hostname.toLowerCase();
    return PROXIED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

export const resolveCanvasDropBase64: Base64Resolver = async (parsed, maxBytes) => {
  if (!requiresInlineProxy(parsed) || parsed.kind !== 'remote' || !parsed.publicUrl) {
    return resolveDroppedBase64(parsed, maxBytes);
  }

  const sourceUrl = parsed.publicUrl;
  const { dataUrl } = await inlineRemoteImage(sourceUrl);
  const inlined = parseDataUrl(dataUrl);
  if (!inlined) throw new Error('Inline proxy returned an unreadable image');

  const rawName = sourceUrl.split('/').pop() ?? 'instagram-media';
  return {
    base64: inlined.base64,
    sourceName: rawName.split('?')[0]?.split('#')[0] || 'instagram-media',
    byteLength: estimateBase64DecodedBytes(inlined.base64),
    sourceUrl,
  };
};
