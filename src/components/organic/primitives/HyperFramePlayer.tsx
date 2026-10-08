'use client';

import type { ShaderStackV1 } from '@continuum/contracts';
import { Loader2, Play } from 'lucide-react';
import * as React from 'react';
import { Video } from '@/components/ui/video';
import { signHyperframeAsset } from '@/lib/organic/hyperframeSign';
import { cn } from '@/lib/utils';
import type { OrganicCalendarDraft } from './types';

type PlayerState = 'idle' | 'loading' | 'playing' | 'error';

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasEnabledShader(stack: ShaderStackV1 | null | undefined): boolean {
  return stack?.effects.some((effect) => effect.enabled) ?? false;
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
  const usesRenderedShaderPreview = hasEnabledShader(hyperframe?.shaderStack);
  const renderedPreviewUrl =
    usesRenderedShaderPreview && hasText(hyperframe?.mp4Url) ? hyperframe.mp4Url.trim() : null;
  const [state, setState] = React.useState<PlayerState>('idle');
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const handlePlay = React.useCallback(async () => {
    if (!hyperframe || !hasText(hyperframe.htmlPath)) {
      setErrorMessage('This HyperFrame has no playable composition yet.');
      setState('error');
      return;
    }
    setState('loading');
    setErrorMessage(null);
    if (usesRenderedShaderPreview) {
      const filmUrl =
        renderedPreviewUrl ??
        (hasText(hyperframe.mp4Path) && hasText(hyperframe.mp4Bucket)
          ? await signHyperframeAsset({
              brandId,
              bucket: hyperframe.mp4Bucket,
              path: hyperframe.mp4Path,
            })
          : null);
      if (!filmUrl) {
        setErrorMessage('Shader preview is still rendering.');
        setState('error');
        return;
      }
      setSignedUrl(filmUrl);
      setState('playing');
      return;
    }
    const url = await signHyperframeAsset({
      brandId,
      bucket: hyperframe.bucket ?? 'hyperframes-compositions',
      path: hyperframe.htmlPath,
    });
    if (!url) {
      setErrorMessage('Could not load the HyperFrame composition.');
      setState('error');
      return;
    }
    setSignedUrl(url);
    setState('playing');
  }, [brandId, hyperframe, renderedPreviewUrl, usesRenderedShaderPreview]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-black">
      {state === 'playing' && signedUrl ? (
        usesRenderedShaderPreview ? (
          <Video
            src={signedUrl}
            autoPlay
            ariaLabel={draft.title}
            className="aspect-auto! size-full rounded-none border-0"
          />
        ) : (
          <iframe
            sandbox="allow-scripts allow-same-origin"
            src={signedUrl}
            className="h-full w-full"
            title={draft.title}
          />
        )
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
        <p className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-1.5 text-center text-xs text-white">
          {hyperframe?.error ?? 'The film did not render.'}
        </p>
      ) : null}
    </div>
  );
}
