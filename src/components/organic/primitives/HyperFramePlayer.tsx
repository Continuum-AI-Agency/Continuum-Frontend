'use client';

import { Loader2, Play } from 'lucide-react';
import * as React from 'react';
import { createClientRenderJob } from '@/lib/api/clientRenderJobs.client';
import { openClientRenderInbox } from '@/lib/client-render/ClientRenderProvider';
import { signHyperframeComposition } from '@/lib/organic/hyperframeSign';
import { cn } from '@/lib/utils';
import type { OrganicCalendarDraft } from './types';

const DEFAULT_DURATION_SEC = 15;

// 720p render dimensions per aspect ratio (short edge = 720) so the generated
// MP4 matches the composition's authored shape instead of always being forced
// to landscape. Unknown/absent aspect ratios fall back to 16:9.
const RENDER_DIMENSIONS_720P = {
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 720, height: 720 },
} as const;

const DEFAULT_DIMENSIONS = RENDER_DIMENSIONS_720P['16:9'];

type PlayerState = 'idle' | 'loading' | 'playing' | 'error';

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toDataUrl(base64: string): string {
  const normalized = base64.trim();
  if (normalized.startsWith('data:')) return normalized;
  return `data:image/png;base64,${normalized}`;
}

function resolveCoverUrl(draft: OrganicCalendarDraft): string | null {
  const hf = draft.mediaSuggestion?.hyperframe;
  if (!hf) return null;
  if (hasText(hf.coverImageUrl)) return hf.coverImageUrl.trim();
  if (hasText(hf.coverBase64)) return toDataUrl(hf.coverBase64);
  return null;
}

// The authored values win. `spec` is the legacy scene graph and is null on
// everything the composition agent writes — reading only from it silently
// letterboxed every vertical piece into 16:9 at a fixed 15s.
function resolveDurationSec(draft: OrganicCalendarDraft): number {
  const hyperframe = draft.mediaSuggestion?.hyperframe;
  const authored = hyperframe?.durationSeconds;
  if (typeof authored === 'number' && Number.isFinite(authored) && authored > 0) return authored;
  const spec = hyperframe?.spec;
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const candidate = (spec as Record<string, unknown>).durationSec;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return DEFAULT_DURATION_SEC;
}

function resolveRenderDimensions(draft: OrganicCalendarDraft): { width: number; height: number } {
  const hyperframe = draft.mediaSuggestion?.hyperframe;
  const width = hyperframe?.width;
  const height = hyperframe?.height;
  if (
    typeof width === 'number' &&
    typeof height === 'number' &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return { width, height };
  }
  const spec = hyperframe?.spec;
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const candidate = (spec as Record<string, unknown>).aspectRatio;
    if (candidate === '16:9' || candidate === '9:16' || candidate === '1:1') {
      return RENDER_DIMENSIONS_720P[candidate];
    }
  }
  return DEFAULT_DIMENSIONS;
}

function resolveSourceAssets(
  draft: OrganicCalendarDraft,
): Array<{ assetId: string; kind: 'image' | 'video' | 'audio' }> {
  const assets = draft.mediaSuggestion?.hyperframe?.sourceAssets;
  return Array.isArray(assets) ? assets : [];
}

export function HyperFramePlayer({
  draft,
  brandId,
}: {
  draft: OrganicCalendarDraft;
  brandId: string;
}) {
  const hyperframe = draft.mediaSuggestion?.hyperframe ?? null;
  const coverUrl = resolveCoverUrl(draft);
  const mp4Status = hyperframe?.mp4Status ?? null;
  const [state, setState] = React.useState<PlayerState>('idle');
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  // Project the composition into the durable brand queue. Viewing or playing the
  // preview never consents to an encode and never claims the job.
  React.useEffect(() => {
    if (
      !hyperframe ||
      !hasText(hyperframe.htmlPath) ||
      !hyperframe.compositionId ||
      !draft.backendDraftId ||
      mp4Status === 'ready'
    ) {
      return;
    }
    const dimensions = resolveRenderDimensions(draft);
    void createClientRenderJob({
      brandId,
      sourceId: hyperframe.compositionId,
      sourceRevision: hyperframe.compositionId,
      title: `HyperFrame: ${draft.title}`,
      inputs: [
        {
          position: 0,
          kind: 'composition',
          sourceId: hyperframe.compositionId,
          label: 'HyperFrame composition',
          sourceRevision: hyperframe.compositionId,
          storage: { bucket: 'hyperframes-compositions', path: hyperframe.htmlPath },
          durationSeconds: resolveDurationSec(draft),
          mimeType: 'text/html',
        },
      ],
      executionSpec: {
        kind: 'organic_hyperframe',
        draftId: draft.backendDraftId,
        compositionId: hyperframe.compositionId,
        htmlPath: hyperframe.htmlPath,
        durationSeconds: resolveDurationSec(draft),
        width: dimensions.width,
        height: dimensions.height,
        assets: resolveSourceAssets(draft),
        origin: {
          label: 'Organic HyperFrame',
          viewHref: '/planner',
        },
      },
    }).catch(() => undefined);
  }, [brandId, draft, hyperframe, mp4Status]);

  const handleRetry = React.useCallback(() => {
    openClientRenderInbox();
  }, []);

  const handlePlay = React.useCallback(async () => {
    if (!hyperframe || !hasText(hyperframe.htmlPath)) {
      setErrorMessage('This HyperFrame has no playable composition yet.');
      setState('error');
      return;
    }
    setState('loading');
    setErrorMessage(null);
    const url = await signHyperframeComposition(brandId, hyperframe.htmlPath);
    if (!url) {
      setErrorMessage('Could not load the HyperFrame composition.');
      setState('error');
      return;
    }
    setSignedUrl(url);
    setState('playing');
  }, [brandId, hyperframe]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-black">
      {state === 'playing' && signedUrl ? (
        <iframe
          sandbox="allow-scripts allow-same-origin"
          src={signedUrl}
          className="h-full w-full"
          title={draft.title}
        />
      ) : (
        <button
          type="button"
          onClick={handlePlay}
          disabled={state === 'loading'}
          className={cn(
            'group absolute inset-0 flex items-center justify-center',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-label={`Play HyperFrame: ${draft.title}`}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={draft.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#5A48F9] to-[#7C6FFF]" />
          )}
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
            {state === 'loading' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Play className="h-6 w-6 translate-x-[1px]" />
            )}
          </span>
        </button>
      )}

      {state === 'error' && errorMessage ? (
        <p className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1.5 text-center text-xs text-white">
          {errorMessage}
        </p>
      ) : null}

      {state !== 'playing' && mp4Status === 'failed' ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/70 px-3 py-1.5 text-xs text-white">
          <span>Video render needs attention.</span>
          <button type="button" onClick={handleRetry}>
            Render inbox
          </button>
        </div>
      ) : null}
    </div>
  );
}
