import type { ClientRenderCapabilities } from '@continuum/contracts';

export async function probeClientRenderCapabilities(): Promise<ClientRenderCapabilities> {
  const webCodecs =
    typeof window !== 'undefined' &&
    typeof window.VideoEncoder !== 'undefined' &&
    typeof window.VideoDecoder !== 'undefined';
  if (!webCodecs) return { webCodecs: false, avc: false, aac: false };
  const { probeHyperframesCapabilities } = await import('@/lib/hyperframes-agent/browserRenderer');
  const { avc, aac } = await probeHyperframesCapabilities();
  return { webCodecs, avc, aac };
}
