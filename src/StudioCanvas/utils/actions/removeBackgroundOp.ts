import {
  actionDef,
  type BackgroundRemovalCompletedData,
  type BackgroundRemovalEvent,
  backgroundRemovalEventSchema,
} from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { useStudioStore } from '../../stores/useStudioStore';
import type { NodeOutput } from '../../types/execution';
import { runTimelineInWorker } from '../../workers/spliceWorkerClient';
import { ensureNodeAssetRef } from '../nodeAssetRef';
import type { ResolvedActionInput, RunActionArgs } from './runAction';

/**
 * `image.removeBackground` and `video.removeBackground`, both lanes.
 *
 * These are ORCHESTRATED ops, like `video.subtitles`: the matting itself happens on a
 * GPU in Cloud Run, so the runner's whole job is an authenticated call and an SSE read.
 * That is also why they are dynamically imported from `runAction` — this module pulls
 * nothing heavy, but the ORCHESTRATED map is where network-bearing ops live and the
 * boundary is worth keeping obvious.
 *
 * `replace` mode splits by what is actually behind the subject:
 *
 * - a FLAT COLOUR is the matte service's job — it already has every frame decoded, so
 *   asking it to fill is one parameter and zero extra pixels over the wire.
 * - an IMAGE PLATE wired to `background-in` is the SPLICER's job, through the very
 *   same `runTimelineInWorker` plate-over-clip composite `video.greenscreen` and the
 *   burn-in pair use. The service is never told about the plate; it just returns a
 *   transparent clip and the worker reveals the plate through it.
 *
 * That split is why `composeTimeline`'s overlay decode had to stop flattening alpha
 * onto black — see the `alpha: true` note there, pinned by `matte:alpha:bench`.
 */

export interface RemoveBackgroundDeps {
  resolveBrandId?: () => string | null;
  getToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  newRequestId?: () => string;
  /** Injected so the pointer ladder can be driven without the store or the network. */
  ensureAssetRef?: typeof ensureNodeAssetRef;
}

const REQUEST_TIMEOUT_MS = 50 * 60 * 1_000;

/**
 * Reads `data:`-prefixed SSE lines off the response body and yields each parsed
 * frame. Hand-rolled for the same reason `useWorkflowExecution` hand-rolls one:
 * `EventSource` cannot send an Authorization header or a POST body.
 */
async function* readEvents(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<BackgroundRemovalEvent> {
  const body = response.body;
  if (!body) throw new Error('The background remover returned no stream');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) throw new Error('Background removal cancelled');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line; anything after the last one is a
      // partial frame and stays in the buffer.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const payload = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('');
        if (!payload) continue;
        // A frame we cannot parse is a contract break, not a hiccup — surfacing it
        // beats silently waiting for a `completed` that will never come.
        yield backgroundRemovalEventSchema.parse(JSON.parse(payload));
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

async function requestRemoval(
  args: RunActionArgs,
  config: Record<string, unknown>,
  kind: 'image' | 'video',
  deps: RemoveBackgroundDeps,
): Promise<BackgroundRemovalCompletedData> {
  // Both entry points funnel through here — the action node via `runAction`, and the
  // Video Editor's clip inspector via `removeClipBackground` — so a lane held back in
  // the registry is refused once, for both, rather than in each caller.
  const heldBack = actionDef(`${kind}.removeBackground`)?.comingSoon;
  if (heldBack) throw new Error(heldBack);

  const source: ResolvedActionInput | undefined = args.inputs.find((i) => i.handle === 'in');
  if (!source) throw new Error('Nothing is connected to this action\'s "in" input');

  const brandId = (deps.resolveBrandId ?? (() => useStudioStore.getState().brandId))();
  if (!brandId) throw new Error('Select a brand before removing a background');

  // The cutout is registered as a DERIVATIVE of its source, so this needs a Library
  // asset. Most inputs already carry one; a node that does not — media pulled in from
  // stock, or an older graph — gets one minted from the bytes it holds rather than a
  // refusal, because "it came out of the Library" and "the canvas knows its id" turned
  // out to be different things.
  const sourceAssetId =
    source.assetId ??
    (source.sourceNodeId
      ? (
          await (deps.ensureAssetRef ?? ensureNodeAssetRef)({
            nodeId: source.sourceNodeId,
            brandId,
            kind,
          })
        )?.assetId
      : undefined);
  if (!sourceAssetId) {
    throw new Error(
      'Save this media to the Library first — the background remover records the cutout against its source.',
    );
  }

  const mode = config.mode === 'replace' ? 'replace' : 'remove';
  const requestId = (deps.newRequestId ?? (() => crypto.randomUUID()))();
  const token = await (deps.getToken ?? getBrowserAccessToken)();
  const fetchImpl = deps.fetchImpl ?? fetch;

  const response = await fetchImpl(`${getApiBaseUrl()}/api/ai-studio/remove-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      brandId,
      sourceAssetId,
      requestId,
      kind,
      mode,
      ...(mode === 'replace' && typeof config.replacement === 'string'
        ? { replacement: config.replacement }
        : {}),
      featherPx: typeof config.featherPx === 'number' ? config.featherPx : 0,
    }),
    signal: args.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Background removal failed (${response.status})`);
  }

  for await (const event of readEvents(response, args.signal)) {
    if (event.type === 'background_removal.progress') {
      args.onProgress?.(event.data.progress / 100);
      continue;
    }
    if (event.type === 'background_removal.failed') throw new Error(event.data.message);
    if (event.type === 'background_removal.completed') {
      args.onProgress?.(1);
      return event.data;
    }
  }
  throw new Error('The background remover closed without finishing');
}

export async function runRemoveImageBackground(
  args: RunActionArgs,
  config: Record<string, unknown>,
  deps: RemoveBackgroundDeps = {},
): Promise<NodeOutput> {
  const done = await requestRemoval(args, config, 'image', deps);
  return {
    type: 'image',
    mimeType: done.mimeType,
    url: done.signedUrl,
    storagePath: done.storagePath,
    storageBucket: done.bucket,
    assetId: done.assetId,
    assetVersionId: done.versionId,
  };
}

export async function runRemoveVideoBackground(
  args: RunActionArgs,
  config: Record<string, unknown>,
  deps: RemoveBackgroundDeps = {},
): Promise<NodeOutput> {
  const plate = await plateFor(args, config);
  // With a plate wired, the service is asked for a plain CUTOUT even in replace mode:
  // the colour fill it would otherwise paint is about to be covered by the plate, and
  // painting it first would just destroy the alpha the composite needs.
  const done = await requestRemoval(
    args,
    plate ? { ...config, mode: 'remove' } : config,
    'video',
    deps,
  );
  if (!plate) {
    return {
      type: 'video',
      url: done.signedUrl,
      storagePath: done.storagePath,
      storageBucket: done.bucket,
      assetId: done.assetId,
      assetVersionId: done.versionId,
    };
  }

  const cutout = await fetchCutout(done.signedUrl);
  const composed = await runTimelineInWorker({
    // Plate underneath, cutout on top — the same base/overlay arrangement
    // `plateComposite` uses for greenscreen, and for the same reason: the overlay
    // track is the only one that does not fill its background first.
    items: [
      {
        itemId: 'cutout-plate',
        kind: 'image',
        blob: plate,
        durationSec: Math.max(0.1, (done.durationMs ?? 0) / 1_000),
      },
    ],
    overlays: [{ itemId: 'cutout-subject', kind: 'video', blob: cutout, startSec: 0 }],
    targetWidth: done.width,
    targetHeight: done.height,
    signal: args.signal,
    onProgress: ({ progress }) => args.onProgress?.(progress),
  });
  // A composited result is a NEW video that no longer matches the registered cutout,
  // so it carries no assetId — `registerCanvasIfDurable` registers it downstream like
  // any other locally produced clip.
  return { type: 'video', url: composed.objectUrl, sizeBytes: composed.blob.size };
}

/**
 * The image wired to `background-in`, but only when replace mode would use it.
 *
 * The executor resolves IMAGE ports to a URL and VIDEO ports to bytes, so a plate
 * almost always arrives as `imageUrl` and has to be fetched. The `blob` branch is for
 * a collection fan-out item, which arrives already read.
 */
async function plateFor(
  args: RunActionArgs,
  config: Record<string, unknown>,
): Promise<Blob | null> {
  if (config.mode !== 'replace') return null;
  const wired = args.inputs.find((input) => input.handle === 'background-in');
  if (!wired) return null;
  if (wired.blob) return wired.blob;
  if (!wired.imageUrl) return null;
  const response = await fetch(wired.imageUrl);
  if (!response.ok) {
    throw new Error(`Could not read the background image (${response.status})`);
  }
  return response.blob();
}

async function fetchCutout(signedUrl: string): Promise<Blob> {
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`Could not read the cutout back (${response.status})`);
  return response.blob();
}

export const __testing = { requestRemoval, readEvents, plateFor };
