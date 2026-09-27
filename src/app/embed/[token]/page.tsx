import type { Metadata } from 'next';
import { Suspense } from 'react';
import { loadSharePayload } from '@/app/share/[token]/loadSharePayload';
import { invokeLibraryShare } from '@/app/share/[token]/shareEdge.server';
import { HyperframesInteractivePlayer } from '@/lib/hyperframes-agent/InteractivePreview';

export const metadata: Metadata = {
  title: 'Video — Continuum',
  robots: { index: false, follow: false },
};

type InteractiveComposition = { html: string; width: number; height: number; aspectRatio: string };

// The live composition behind the film, assets signed in, read by the library-share edge
// function: Vercel holds no service-role key, and the film may live in GCS.
async function loadInteractive(
  token: string,
  assetId: string,
): Promise<InteractiveComposition | null> {
  const result = await invokeLibraryShare<{ composition: InteractiveComposition | null }>({
    action: 'interactive_composition',
    token,
    assetId,
  });
  return result.ok ? result.data.composition : null;
}

type EmbedProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mode?: string }>;
};

// Request data is read under Suspense: with cacheComponents a route-level `dynamic` flag is
// a build error, the same way the share viewer streams its token lookup.
export default function VideoEmbedPage(props: EmbedProps) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-black" />}>
      <VideoEmbed {...props} />
    </Suspense>
  );
}

async function VideoEmbed({ params, searchParams }: EmbedProps) {
  const { token } = await params;
  const { mode } = await searchParams;
  const result = await loadSharePayload(token);
  const asset =
    result.ok && result.payload.scope === 'asset' && result.payload.assets.length === 1
      ? result.payload.assets[0]?.asset
      : null;
  if (!asset || asset.kind !== 'video' || !asset.signedUrl) {
    return (
      <main className="grid min-h-screen place-items-center bg-black p-4 text-sm text-white">
        Video unavailable
      </main>
    );
  }
  if (mode === 'interactive') {
    const composition = await loadInteractive(token, asset.id);
    if (!composition)
      return (
        <main className="grid min-h-screen place-items-center bg-black p-4 text-sm text-white">
          Composition unavailable
        </main>
      );
    return (
      <main className="min-h-screen bg-black">
        <HyperframesInteractivePlayer {...composition} />
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-black">
      <video
        src={asset.signedUrl}
        controls
        playsInline
        preload="metadata"
        className="h-screen w-screen object-contain"
      >
        <track kind="captions" />
      </video>
    </main>
  );
}
