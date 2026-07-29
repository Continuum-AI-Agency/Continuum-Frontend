import type { HyperframesBrowserAsset } from '@/lib/hyperframes-agent/browserRenderer';
import { renderHyperframesVideo } from '@/lib/hyperframes-agent/browserRenderer';
import { signHyperframeComposition, signMediaAsset } from '@/lib/organic/hyperframeSign';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ClientRenderExecutor } from '../executorRegistry';

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
};

const MIME_BY_KIND = {
  image: 'image/png',
  video: 'video/mp4',
  audio: 'audio/mpeg',
} as const;

/**
 * Re-sign each embedded library asset. A composition stores `hf-asset://<id>`
 * rather than a URL precisely so this can happen at render time; an asset that
 * fails to sign is dropped rather than fatal, so one missing reference degrades
 * the frame instead of losing the whole video.
 */
async function resolveAssets(
  brandId: string,
  refs: ReadonlyArray<{ assetId: string; kind: 'image' | 'video' | 'audio' }>,
): Promise<HyperframesBrowserAsset[]> {
  const resolved = await Promise.all(
    refs.map(async (ref): Promise<HyperframesBrowserAsset | null> => {
      const url = await signMediaAsset({ brandId, assetId: ref.assetId });
      if (!url) return null;
      return {
        assetId: ref.assetId,
        kind: ref.kind,
        mimeType: MIME_BY_KIND[ref.kind],
        url,
      };
    }),
  );
  return resolved.filter((asset): asset is HyperframesBrowserAsset => asset !== null);
}

export const executeOrganicHyperframeClientRender: ClientRenderExecutor = async (context) => {
  const spec = context.job.executionSpec;
  if (spec.kind !== 'organic_hyperframe') {
    throw new Error('The Organic HyperFrame executor received the wrong render job kind.');
  }
  await context.update({ state: 'rendering', progress: 0, phase: 'Rendering HyperFrame' });
  const htmlUrl = await signHyperframeComposition(context.job.brandId, spec.htmlPath);
  if (!htmlUrl) throw new Error('Could not load the HyperFrame composition.');

  // Shares the AI Studio renderer rather than keeping a second one. The old
  // Organic renderer sampled the DOM at wall-clock cadence and assumed the
  // composition autoplayed — but every HyperFrames composition, from both
  // producers, builds a PAUSED GSAP timeline on window.__timelines. Nothing ever
  // advanced it, so every frame captured t=0 and the MP4 came out static. This
  // renderer seeks the timeline per frame, and brings audio, hf-asset:// media
  // and video-element seeking with it.
  let lastReportedBucket = -1;
  const rendered = await renderHyperframesVideo({
    composition: {
      htmlUrl,
      assets: await resolveAssets(context.job.brandId, spec.assets ?? []),
      width: spec.width,
      height: spec.height,
      durationSeconds: spec.durationSeconds,
      fps: 30,
    },
    signal: context.signal,
    onProgress: (progress) => {
      const bucket = Math.floor(progress * 10);
      if (bucket <= lastReportedBucket) return;
      lastReportedBucket = bucket;
      void context
        .update({ state: 'rendering', progress, phase: 'Rendering HyperFrame' })
        .catch(() => undefined);
    },
  });
  if (context.signal.aborted) throw new DOMException('Render stopped.', 'AbortError');

  await context.update({ state: 'saving', progress: 1, phase: 'Saving to Library' });
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke('link-hyperframe-mp4', {
    body: {
      compositionId: spec.compositionId,
      brandId: context.job.brandId,
      draftId: spec.draftId,
      mp4Base64: await blobToBase64(rendered.blob),
      mimeType: 'video/mp4',
      durationSec: rendered.durationSeconds,
    },
  });
  const response = data as { ok?: boolean; message?: string } | null;
  if (error || !response?.ok) {
    throw new Error(response?.message ?? error?.message ?? 'Could not save the HyperFrame video.');
  }
  return {
    resultAssetIds: [],
    title: 'HyperFrame video finished',
    description: 'The publishable video is saved to Library.',
  };
};
