'use client';

import type {
  GenerationDirection,
  OnboardingGeneratedImage,
  OnboardingGenerationStreamFrame,
} from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { streamGeneration } from '@/lib/onboarding/inspirationsClient';
import { cn } from '@/lib/utils';
import { useBackgroundJobs } from '../state/BackgroundJobsProvider';

const DIRECTION_LABEL: Record<GenerationDirection, string> = {
  brand_awareness: 'Brand values',
  product: 'Promo',
  hybrid: 'Social proof',
};

type Phase = 'generating' | 'done' | 'error';

type Props = {
  brandId: string;
  onFinish: () => void;
  finishing: boolean;
  onBack: () => void;
  emailReportOptIn: boolean;
  onEmailReportOptInChange: (value: boolean) => void;
};

// Creatives are generated up-front by the `creativePrewarm` background job (kicked
// the moment the brand profile is finished, decoupled from the strategic analysis).
// This screen displays those results; it only generates locally as a fallback when
// the prewarm didn't run or produced nothing. Brand-guidelines only — no competitor
// reference.
export function InspirationGenerationScreen({
  brandId,
  onFinish,
  finishing,
  onBack,
  emailReportOptIn,
  onEmailReportOptInChange,
}: Props) {
  const { jobs } = useBackgroundJobs();
  const prewarm = jobs.creativePrewarm;
  const prewarmImages =
    (prewarm.data as { images?: OnboardingGeneratedImage[] } | null)?.images ?? [];

  const [total, setTotal] = useState(3);
  const [images, setImages] = useState<OnboardingGeneratedImage[]>([]);
  const [phase, setPhase] = useState<Phase>('generating');
  const selfStartedRef = useRef(false);
  const erroredRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const runGeneration = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    selfStartedRef.current = true;
    erroredRef.current = false;
    setImages([]);
    setPhase('generating');

    const handleFrame = (frame: OnboardingGenerationStreamFrame) => {
      switch (frame.type) {
        case 'generation_started':
          setTotal(frame.data.total);
          break;
        case 'image_ready':
          setImages((prev) => [...prev, frame.data]);
          break;
        case 'generation_complete':
          setPhase('done');
          break;
        case 'error':
          erroredRef.current = true;
          break;
      }
    };

    void streamGeneration({ brandId, signal: controller.signal, onFrame: handleFrame })
      .then(() =>
        setPhase((p) => (p === 'generating' ? (erroredRef.current ? 'error' : 'done') : p)),
      )
      .catch(() => {
        if (!controller.signal.aborted) setPhase('error');
      });
  }, [brandId]);

  // Always abort an in-flight self-generation on unmount.
  useEffect(() => () => controllerRef.current?.abort(), []);

  // Start logic: defer to the prewarm while it runs / when it produced images;
  // otherwise generate locally exactly once.
  useEffect(() => {
    if (selfStartedRef.current) return;
    if (prewarm.status === 'running') return;
    if (prewarm.status === 'done' && prewarmImages.length > 0) return;
    runGeneration();
  }, [prewarm.status, prewarmImages.length, runGeneration]);

  const usingPrewarm =
    !selfStartedRef.current &&
    (prewarm.status === 'running' || (prewarm.status === 'done' && prewarmImages.length > 0));
  const displayImages = usingPrewarm ? prewarmImages : images;
  const displayPhase: Phase = usingPrewarm
    ? prewarm.status === 'done'
      ? 'done'
      : 'generating'
    : phase;

  const slots = Array.from({ length: Math.max(total, displayImages.length) });

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col px-4 pb-28 md:px-8">
      <header className="py-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Your first on-brand creatives</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generated from your brand guidelines. They&apos;re saving to your library now.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {slots.map((_, index) => {
          const image = displayImages[index];
          return (
            <div
              key={image?.assetId ?? `slot-${index}`}
              className={cn(
                'flex flex-col overflow-hidden rounded-xl border border-border bg-card',
                !image && 'animate-pulse',
              )}
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.signedUrl} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                  {displayPhase === 'error' ? 'Generation failed' : 'Generating…'}
                </div>
              )}
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {image ? DIRECTION_LABEL[image.direction] : ' '}
              </div>
            </div>
          );
        })}
      </div>

      {displayPhase === 'error' ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-center text-sm text-muted-foreground">
            We couldn&apos;t generate previews right now — try again, or continue and create them
            later in the studio.
          </p>
          <Button variant="default" size="sm" onClick={runGeneration} disabled={finishing}>
            Try again
          </Button>
        </div>
      ) : null}

      <footer className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8">
        <Button variant="outline" size="sm" onClick={onBack} disabled={finishing}>
          ← Back
        </Button>
        <div className="flex items-center gap-3">
          {displayPhase === 'generating' ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Still creating — they&apos;ll keep saving to your library.
            </span>
          ) : null}
          <div className="flex items-center gap-2">
            <Switch
              id="onboarding-email-report"
              checked={emailReportOptIn}
              onCheckedChange={onEmailReportOptInChange}
              disabled={finishing}
            />
            <label
              htmlFor="onboarding-email-report"
              className="cursor-pointer select-none text-xs text-muted-foreground"
            >
              Email me my brand readiness report
            </label>
          </div>
          {/* Never block the finale: creatives persist to the library server-side,
              so the user can head to the dashboard even while generation runs. */}
          <Button variant="success" size="sm" onClick={onFinish} disabled={finishing}>
            {finishing ? 'Finishing…' : 'Go to dashboard ✦'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
