import { clipGenerationFrameSchema, mediaAssetSchema } from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { cutAndPersistSection, extractAndUploadAudio } from '@/lib/clips/clipClientCut';
import { parseNdjson } from '@/lib/streaming/parseNdjson';
import type { ClientRenderExecutor } from '../executorRegistry';

export const executeMcpClipBatchClientRender: ClientRenderExecutor = async (context) => {
  const spec = context.job.executionSpec;
  if (spec.kind !== 'mcp_clip_batch') {
    throw new Error('The UGC clip executor received the wrong render job kind.');
  }

  await context.update({ state: 'rendering', progress: 0, phase: 'Loading source video' });
  const query = new URLSearchParams({
    brandId: context.job.brandId,
    assetId: spec.sourceAssetId,
    limit: '1',
  });
  const assetResponse = await fetch(`/api/library/assets?${query}`, { signal: context.signal });
  if (!assetResponse.ok) throw new Error('Could not load the UGC source video.');
  const assetPayload = (await assetResponse.json()) as { items?: unknown[] };
  const asset = mediaAssetSchema.parse(assetPayload.items?.[0]);
  if (asset.kind !== 'video' || !asset.signedUrl) {
    throw new Error('The UGC source video is not ready.');
  }
  const sourceResponse = await fetch(asset.signedUrl, { signal: context.signal });
  if (!sourceResponse.ok) {
    throw new Error(`Could not download the source video (${sourceResponse.status}).`);
  }
  const sourceBlob = await sourceResponse.blob();

  await context.update({ state: 'rendering', progress: 0.05, phase: 'Extracting audio' });
  const { audioBucket, audioStoragePath } = await extractAndUploadAudio({
    brandId: context.job.brandId,
    sourceAssetId: spec.sourceAssetId,
    sourceBlob,
    signal: context.signal,
  });
  const token = await getBrowserAccessToken();
  const response = await fetch(`${getApiBaseUrl()}/api/clips/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      brandId: context.job.brandId,
      sourceAssetId: spec.sourceAssetId,
      audioBucket,
      audioStoragePath,
    }),
    signal: context.signal,
  });
  if (!response.ok || !response.body) throw new Error('Could not start UGC clip generation.');

  const resultAssetIds: string[] = [];
  let sawPlan = false;
  for await (const raw of parseNdjson(response.body)) {
    const parsed = clipGenerationFrameSchema.safeParse(raw);
    if (!parsed.success) continue;
    const frame = parsed.data;
    if (frame.type === 'job_failed') throw new Error(frame.error);
    if (frame.type === 'stage') {
      await context.update({
        state: 'rendering',
        phase: frame.stage.replaceAll('_', ' '),
      });
    }
    if (frame.type !== 'clip_plan_ready') continue;
    sawPlan = true;
    for (const [position, section] of frame.plan.sections.entries()) {
      if (context.signal.aborted) throw new DOMException('Render stopped.', 'AbortError');
      await context.update({
        state: 'rendering',
        progress: 0.1 + (position / Math.max(1, frame.plan.sections.length)) * 0.8,
        phase: `Cutting clip ${position + 1} of ${frame.plan.sections.length}`,
      });
      const persisted = await cutAndPersistSection({
        brandId: context.job.brandId,
        sourceAssetId: spec.sourceAssetId,
        sourceBlob,
        section,
        score: frame.scores?.[section.index] ?? frame.score,
        signal: context.signal,
      });
      resultAssetIds.push(persisted.assetId);
    }
  }
  if (!sawPlan || resultAssetIds.length === 0) {
    throw new Error('No UGC clips were produced.');
  }
  await context.update({ state: 'saving', progress: 1, phase: 'Saving clips' });
  return {
    resultAssetIds,
    title: 'UGC clips finished',
    description: `${resultAssetIds.length} clip${resultAssetIds.length === 1 ? '' : 's'} saved to Library.`,
  };
};
