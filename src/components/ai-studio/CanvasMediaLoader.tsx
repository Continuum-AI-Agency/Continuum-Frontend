'use client';
import { Image, Video, Wand2 } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';

import React from 'react';
import { ErrorRetryState } from '@/components/shared/state';
import { cn } from '@/lib/utils';

// "loading" keeps the decorative canvas warm-up (the default, unchanged
// behaviour). "error" is the deterministic failure surface (IMP-011): when the
// caller's realtime status resolves to a failure, it passes status="error" plus
// an onRetry so the canvas never sits on an ambiguous forever-loading state.
type CanvasMediaLoaderStatus = 'loading' | 'error';

type CanvasMediaLoaderProps = {
  className?: string;
  status?: CanvasMediaLoaderStatus;
  errorMessage?: string;
  onRetry?: () => void;
};

export function CanvasMediaLoader({
  className,
  status = 'loading',
  errorMessage,
  onRetry,
}: CanvasMediaLoaderProps) {
  const translateUi = useUiTranslations('studio');

  if (status === 'error') {
    return (
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/20 px-6 py-8',
          className,
        )}
      >
        <div className="relative z-10 w-full max-w-[520px] rounded-lg border border-border/70 bg-background/95 p-[var(--card-pad)] shadow-sm backdrop-blur">
          <ErrorRetryState
            title={translateUi('ai_studio_canvas_didn_t_load_5c7f5edb')}
            message={errorMessage ?? translateUi('canvasMediaDefaultError')}
            onRetry={onRetry}
            retryLabel={translateUi('retry_942087cc')}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={translateUi('loading_ai_studio_canvas_a9c90f65')}
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/20 px-6 py-8',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-6 h-64 w-64 rounded-full bg-primary/15 blur-3xl motion-reduce:animate-none" />
        <div className="absolute -right-12 bottom-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl motion-reduce:animate-none" />
      </div>

      <div className="relative z-10 w-full max-w-[520px] rounded-lg border border-border/70 bg-background/95 p-[var(--card-pad)] shadow-sm backdrop-blur">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Continuum AI Studio
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {translateUi('preparing_media_canvas_f4db731b')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {' '}
            {translateUi('restoring_your_workspace_syncing_co_e244f481')}{' '}
          </p>
        </div>

        <div className="relative h-52 overflow-hidden rounded-lg border border-border/70 bg-muted/40">
          <div className="absolute left-[10%] top-[22%] flex w-28 items-center gap-2 rounded-lg border border-primary/25 bg-background/90 px-3 py-2 shadow-sm">
            <Image className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">
              {translateUi('image_1aa4cb0b')}
            </span>
          </div>

          <div className="absolute right-[10%] top-[22%] flex w-28 items-center gap-2 rounded-lg border border-primary/25 bg-background/90 px-3 py-2 shadow-sm">
            <Video className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">
              {translateUi('video_d534be82')}
            </span>
          </div>

          <div className="absolute bottom-[16%] left-1/2 flex w-32 -translate-x-1/2 items-center gap-2 rounded-lg border border-primary/25 bg-background/90 px-3 py-2 shadow-sm">
            <Wand2 className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground">
              {translateUi('prompt_5c391238')}
            </span>
          </div>

          <div className="absolute left-[36%] top-[32%] h-px w-[28%] bg-primary/60" />
          <div className="absolute left-[31%] top-[44%] h-px w-[20%] origin-left -rotate-[35deg] bg-primary/60" />
          <div className="absolute right-[31%] top-[44%] h-px w-[20%] origin-right rotate-[35deg] bg-primary/60" />

          <div className="absolute left-[49%] top-[31%] h-2.5 w-2.5 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
          <div
            className="absolute left-[41%] top-[38%] h-2.5 w-2.5 rounded-full bg-primary animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: '220ms' }}
          />
          <div
            className="absolute right-[41%] top-[38%] h-2.5 w-2.5 rounded-full bg-primary animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: '440ms' }}
          />

          <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <div className="absolute inset-0 rounded-full border border-primary/40 animate-spin motion-reduce:animate-none" />
            <div
              className="absolute inset-[6px] rounded-full border border-primary/45 animate-spin motion-reduce:animate-none"
              style={{ animationDirection: 'reverse', animationDuration: '2.8s' }}
            />
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background shadow-sm">
              <Wand2 className="h-4 w-4 text-foreground" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse motion-reduce:animate-none" />{' '}
            {translateUi('session_6959b415')}{' '}
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full bg-primary animate-pulse motion-reduce:animate-none"
              style={{ animationDelay: '180ms' }}
            />{' '}
            {translateUi('nodes_7ac36206')}{' '}
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full bg-primary animate-pulse motion-reduce:animate-none"
              style={{ animationDelay: '360ms' }}
            />{' '}
            {translateUi('media_engine_415840c3')}{' '}
          </span>
        </div>
      </div>
    </div>
  );
}
