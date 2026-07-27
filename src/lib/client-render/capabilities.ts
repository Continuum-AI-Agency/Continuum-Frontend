import type { ClientRenderCapabilities } from '@continuum/contracts';
import { probeHyperframesCapabilities } from '@/lib/hyperframes-agent/browserRenderer';

export async function probeClientRenderCapabilities(): Promise<ClientRenderCapabilities> {
  const webCodecs =
    typeof window !== 'undefined' &&
    typeof window.VideoEncoder !== 'undefined' &&
    typeof window.VideoDecoder !== 'undefined';
  if (!webCodecs) return { webCodecs: false, avc: false, aac: false };
  const { avc, aac } = await probeHyperframesCapabilities();
  return { webCodecs, avc, aac };
}
