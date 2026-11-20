'use client';

import { Backpack, Component, SlidersHorizontal, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { BrandQuestionsList } from '@/components/brand-insights/BrandQuestionsList';
import { Pill } from '@/components/kibo-ui/pill';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { BrandInsightsQuestionsByNiche } from '@/lib/schemas/brandInsights';

type AudienceBuilderPrimitiveProps = {
  questionsByNiche?: BrandInsightsQuestionsByNiche;
  questionsError?: string | null;
};

function SkeletonBar({ width = '100%' }: { width?: string }) {
  return (
    <div
      className="rounded-md"
      style={{
        width,
        height: '10px',
        background:
          'linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.16), rgba(255,255,255,0.08))',
      }}
      aria-hidden
    />
  );
}

const EMPTY_QUESTIONS_BY_NICHE: BrandInsightsQuestionsByNiche = {
  questionsByNiche: {},
  status: undefined,
  summary: undefined,
  generatedAt: undefined,
};

export function AudienceBuilderPrimitive({
  questionsByNiche,
  questionsError,
}: AudienceBuilderPrimitiveProps) {
  const uiText = useTranslations('scale');
  const safeQuestionsByNiche = questionsByNiche ?? EMPTY_QUESTIONS_BY_NICHE;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="glass-panel h-full rounded-lg p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Backpack />
              <h4 className="text-lg font-semibold text-white">
                {uiText('audience_builder_be951e7')}
              </h4>
            </div>
            <Separator />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {uiText('concept_name_4bd0e55')}
                  </span>
                  <SkeletonBar width="70%" />
                  <SkeletonBar width="55%" />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {uiText('objectives_eba9295')}
                  </span>
                  <SkeletonBar width="60%" />
                  <SkeletonBar width="40%" />
                </div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal />
                    <span className="font-medium">{uiText('psychographic_layer_4163a67')}</span>
                  </div>
                  <SkeletonBar width="90%" />
                  <SkeletonBar width="75%" />
                  <SkeletonBar width="60%" />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Component />
                    <span className="font-medium">{uiText('targeting_layer_bebf337')}</span>
                  </div>
                  <SkeletonBar width="85%" />
                  <SkeletonBar width="50%" />
                  <SkeletonBar width="45%" />
                </div>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <span className="font-medium">{uiText('behaviors_5066deb')}</span>
                  <SkeletonBar width="80%" />
                  <SkeletonBar width="68%" />
                  <SkeletonBar width="55%" />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <span className="font-medium">{uiText('interests_756aaea')}</span>
                  <SkeletonBar width="82%" />
                  <SkeletonBar width="65%" />
                  <SkeletonBar width="48%" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <span className="font-medium">{uiText('demographics_7bcf032')}</span>
                  <SkeletonBar width="78%" />
                  <SkeletonBar width="52%" />
                  <SkeletonBar width="40%" />
                </div>
              </div>
            </div>
            <Separator />
            <div className="rounded-lg border border-[var(--glass-border)] p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Pill variant="warning">{uiText('preflight_54614e8')}</Pill>
                  <span className="font-medium">{uiText('compatibility_reach_9696fa4')}</span>
                </div>
                <SkeletonBar width="80%" />
                <SkeletonBar width="65%" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button disabled variant="secondary">
                {uiText('save_preset_disabled_acd6512')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-4">
        <div className="glass-panel h-full rounded-lg p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-white">
                {uiText('audience_questions_21a2863')}
              </h4>
              <Pill variant="teal">{uiText('brand_insights_afac9a0')}</Pill>
            </div>
            <span className="text-sm text-muted-foreground">
              {uiText('use_these_high_signal_questions_to_refine_aud_b5642b4')}
            </span>
            <Separator />
            {questionsError ? (
              <Alert variant="destructive">
                <Zap />
                <AlertDescription>{questionsError}</AlertDescription>
              </Alert>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto pr-2">
                <BrandQuestionsList
                  questionsByNiche={safeQuestionsByNiche.questionsByNiche}
                  density="compact"
                  scrollWithinSection
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
