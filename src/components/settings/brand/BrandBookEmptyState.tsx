'use client';

import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';
import { PreviewRateLimitedError, runOnboardingPreview } from '@/lib/onboarding/agentClient';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
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
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const router = useRouter();
  const { show } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const refreshedRef = useRef(false);

  useEffect(() => {
    return subscribeToPostgresChanges({
      label: `brand_book_generate_${brandId}`,
      bindings: [
        {
          event: '*',
          schema: 'brand_profiles',
          table: 'brand_report_composites',
          filter: `brand_profile_id=eq.${brandId}`,
          onRow: () => {
            // The composite was just written — pull it in. Guard so a flurry of
            // INSERT/UPDATE events only triggers one refresh.
            if (!refreshedRef.current) {
              refreshedRef.current = true;
              router.refresh();
            }
          },
        },
      ],
    });
  }, [brandId, router, tUi]);

  // Abort an in-flight run if the user navigates away from the panel.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleGenerate = async () => {
    if (!canGenerateBrandBook(payload)) {
      show({
        title: tUi('m_8edf28bf6f'),
        description: tUi('m_cf987fe672'),
        variant: 'error',
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setStatusLine(tUi('m_f132df62c3'));

    try {
      await runOnboardingPreview({
        payload,
        signal: controller.signal,
        onEvent: (event) => {
          const line = brandBookGenerationStatus(event, tUi);
          if (line) setStatusLine(line);
        },
      });
      show({
        title: tUi('m_a85c9517e3'),
        description: tUi('m_06a1260092'),
        variant: 'success',
      });
      router.refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      const description =
        error instanceof PreviewRateLimitedError
          ? tUi('brandPreviewRateLimited', { seconds: error.retryAfterSeconds })
          : error instanceof Error
            ? uiErrorMessage(error)
            : tUi('m_83a6fd7b78');
      show({
        title: tUi('m_6e1ce07f14'),
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
        <h3 className="text-base font-semibold text-foreground">{tUi('m_2561490142')}</h3>
        <p className="text-sm text-muted-foreground">
          {tUi('m_f1acfdec41')}
          {brandName}
          {tUi('m_acff41b9b3')}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? tUi('m_11edad70c1') : tUi('m_d769b99077')}
        </Button>
        {isGenerating && statusLine ? (
          <span className="text-xs text-muted-foreground">{statusLine}</span>
        ) : null}
      </div>

      {isGenerating ? <p className="text-xs text-muted-foreground">{tUi('m_220012bab5')}</p> : null}
    </div>
  );
}
