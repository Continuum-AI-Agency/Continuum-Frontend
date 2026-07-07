'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { PreviewRateLimitedError, runOnboardingPreview } from '@/lib/onboarding/agentClient';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  type BrandBookGenerationPayload,
  brandBookGenerationStatus,
  canGenerateBrandBook,
} from './brandBookGeneration';

/**
 * Shown when a brand has no brand_report_composite yet (the `get-brand-book` read
 * 404s). Instead of a dead-end line of text, this lets the user kick off the same
 * durable `preview` run onboarding uses to generate the report. A Realtime listener
 * on the composite table is the backstop: whenever the row lands it refreshes the
 * RSC so the viewer swaps from this panel to the populated Brand Book.
 */
export function BrandBookEmptyState({
  brandId,
  brandName,
  payload,
}: {
  brandId: string;
  brandName: string;
  payload: BrandBookGenerationPayload | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshedRef = useRef(false);

  useEffect(() => {
    const channel = supabase
      .channel(`brand_book_generate_${brandId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'brand_profiles',
          table: 'brand_report_composites',
          filter: `brand_profile_id=eq.${brandId}`,
        },
        () => {
          // The composite was just written — pull it in. Guard so a flurry of
          // INSERT/UPDATE events only triggers one refresh.
          if (!refreshedRef.current) {
            refreshedRef.current = true;
            router.refresh();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [brandId, supabase, router]);

  // Abort an in-flight run if the user navigates away from the panel.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleGenerate = async () => {
    if (!canGenerateBrandBook(payload)) {
      show({
        title: "Can't generate yet",
        description:
          "We couldn't assemble this brand's profile. Finish onboarding first, then try again.",
        variant: 'error',
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setStatusLine('Starting analysis…');

    try {
      await runOnboardingPreview({
        payload,
        signal: controller.signal,
        onEvent: (event) => {
          const line = brandBookGenerationStatus(event);
          if (line) setStatusLine(line);
        },
      });
      show({
        title: 'Brand Book generated',
        description: 'Your brand report is ready.',
        variant: 'success',
      });
      router.refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      const description =
        error instanceof PreviewRateLimitedError
          ? `Too many runs right now — try again in ${error.retryAfterSeconds}s.`
          : error instanceof Error
            ? error.message
            : 'Please try again.';
      show({
        title: "Couldn't generate Brand Book",
        description,
        variant: 'error',
      });
      setIsGenerating(false);
      setStatusLine(null);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 px-5 py-6">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">No Brand Book yet</h3>
        <p className="text-sm text-muted-foreground">
          Continuum hasn&rsquo;t generated a brand report for {brandName} yet. Run the analysis to
          build your living brand identity — voice, audience, strategy, readiness, and more.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? 'Generating…' : 'Generate Brand Book'}
        </Button>
        {isGenerating && statusLine ? (
          <span className="text-xs text-muted-foreground">{statusLine}</span>
        ) : null}
      </div>

      {isGenerating ? (
        <p className="text-xs text-muted-foreground">
          This runs the full brand analysis and can take a few minutes. Keep this page open while it
          works.
        </p>
      ) : null}
    </div>
  );
}
