import { signHyperframeComposition } from '@/lib/organic/hyperframeSign';
import { createHyperframeMp4Renderer } from '@/lib/organic/renderHyperframeMp4';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ClientRenderExecutor } from '../executorRegistry';

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
};

export const executeOrganicHyperframeClientRender: ClientRenderExecutor = async (context) => {
  const spec = context.job.executionSpec;
  if (spec.kind !== 'organic_hyperframe') {
    throw new Error('The Organic HyperFrame executor received the wrong render job kind.');
  }
  await context.update({ state: 'rendering', progress: 0, phase: 'Rendering HyperFrame' });
  const htmlUrl = await signHyperframeComposition(context.job.brandId, spec.htmlPath);
  if (!htmlUrl) throw new Error('Could not load the HyperFrame composition.');
  const blob = await createHyperframeMp4Renderer({
    htmlUrl,
    width: spec.width,
    height: spec.height,
    durationSec: spec.durationSeconds,
    signal: context.signal,
  })();
  if (context.signal.aborted) throw new DOMException('Render stopped.', 'AbortError');

  await context.update({ state: 'saving', progress: 1, phase: 'Saving to Library' });
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke('link-hyperframe-mp4', {
    body: {
      compositionId: spec.compositionId,
      brandId: context.job.brandId,
      draftId: spec.draftId,
      mp4Base64: await blobToBase64(blob),
      mimeType: 'video/mp4',
      durationSec: spec.durationSeconds,
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
