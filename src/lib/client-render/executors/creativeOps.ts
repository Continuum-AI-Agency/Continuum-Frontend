import { creativeOpsSourceAssetIds } from '@continuum/contracts';

import { loadBrandTypeInputs } from '@/lib/brands/brandTypeInputs.client';
import { persistGeneratedMedia } from '@/lib/library/persistGeneratedMedia';
import { signMediaAsset } from '@/lib/organic/hyperframeSign';
import type { NodeOutput } from '@/StudioCanvas/types/execution';
import { runRecipe } from '@/StudioCanvas/utils/actions/runRecipe';
import { buildDataUrl } from '@/StudioCanvas/utils/dataUrl';
import type { ClientRenderExecutor } from '../executorRegistry';

/**
 * Run an agent's creative-ops recipe on this browser.
 *
 * This is the PRIMARY lane: the person's own machine already has the fonts, the GPU
 * and a WebCodecs stack, and the work costs us nothing. The render service exists for
 * when nobody is here to claim the job, not because this lane is the weaker one.
 */
export const executeCreativeOpsClientRender: ClientRenderExecutor = async (context) => {
  const spec = context.job.executionSpec;
  if (spec.kind !== 'creative_ops') {
    throw new Error('The creative-ops executor received the wrong render job kind.');
  }
  const { brandId } = context.job;
  const recipe = spec.recipe;

  await context.update({ state: 'rendering', progress: 0, phase: 'Preparing' });

  // Only `image.text` reads the brand, and it reads it PER RUN rather than from a
  // cache: a brand re-ingested this morning must not set type in the face it had
  // yesterday. Same rule the canvas executor follows at its own `runAction` call.
  const needsBrand = recipe.some((step) => step.actionId === 'image.text');
  const brand = needsBrand ? await loadBrandTypeInputs(brandId) : null;

  const output = await runRecipe({
    recipe,
    brand,
    signal: context.signal,
    resolveAssetUrl: (assetId) => signMediaAsset({ brandId, assetId }),
    onStep: ({ index, total, label }) => {
      void context
        .update({ state: 'rendering', progress: index / total, phase: label })
        .catch(() => undefined);
    },
  });
  if (context.signal.aborted) throw new DOMException('Render stopped.', 'AbortError');

  await context.update({ state: 'saving', progress: 1, phase: 'Saving to Library' });

  const items = output.type === 'collection' ? output.items : [output];
  const sourceAssetIds = creativeOpsSourceAssetIds(recipe);
  const resultAssetIds: string[] = [];

  for (const [index, item] of items.entries()) {
    const { blob, kind } = await toBlob(item);
    const suffix = items.length > 1 ? `-${index + 1}` : '';
    const registered = await persistGeneratedMedia({
      blob,
      brandId,
      kind,
      fileName: `${slug(context.job.title)}${suffix}.${kind === 'video' ? 'mp4' : 'png'}`,
      operation: 'creative_ops',
      originRef: {
        kind: 'creative_ops',
        jobId: context.job.id,
        steps: recipe.map((step) => step.actionId),
        lane: 'client',
      },
      sourceAssetIds,
      title: context.job.title,
      ...(await dimensionsOf(blob, kind)),
    });
    resultAssetIds.push(registered.assetId);
  }

  return {
    resultAssetIds,
    title: context.job.title,
    description:
      resultAssetIds.length === 1
        ? 'The edit is saved to Library.'
        : `${resultAssetIds.length} results saved to Library.`,
  };
};

const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'creative-ops';

async function toBlob(output: NodeOutput): Promise<{ blob: Blob; kind: 'image' | 'video' }> {
  if (output.type === 'video') {
    const response = await fetch(output.url);
    if (!response.ok) throw new Error(`Could not read the finished video (${response.status}).`);
    return { blob: await response.blob(), kind: 'video' };
  }
  if (output.type === 'image') {
    const source =
      output.url ?? (output.base64 ? buildDataUrl(output.mimeType, output.base64) : null);
    if (!source) throw new Error('The finished image has no readable bytes.');
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not read the finished image (${response.status}).`);
    return { blob: await response.blob(), kind: 'image' };
  }
  throw new Error(`A recipe cannot end in ${output.type}.`);
}

/** Fail-soft: the Library shows dimensions when it has them and copes when it does not. */
async function dimensionsOf(
  blob: Blob,
  kind: 'image' | 'video',
): Promise<{ width?: number; height?: number }> {
  if (kind !== 'image') return {};
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}
