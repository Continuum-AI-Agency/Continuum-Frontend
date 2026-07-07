'use client';

import {
  BackpackIcon,
  Component1Icon,
  LightningBoltIcon,
  MixerHorizontalIcon,
} from '@radix-ui/react-icons';
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
  const safeQuestionsByNiche = questionsByNiche ?? EMPTY_QUESTIONS_BY_NICHE;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="glass-panel h-full rounded-lg p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <BackpackIcon />
              <h4 className="text-lg font-semibold text-white">Audience Builder</h4>
            </div>
            <Separator />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">Concept name</span>
                  <SkeletonBar width="70%" />
                  <SkeletonBar width="55%" />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <span className="text-sm text-muted-foreground">Objectives</span>
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
                    <MixerHorizontalIcon />
                    <span className="font-medium">Psychographic layer</span>
                  </div>
                  <SkeletonBar width="90%" />
                  <SkeletonBar width="75%" />
                  <SkeletonBar width="60%" />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Component1Icon />
                    <span className="font-medium">Targeting layer</span>
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
                  <span className="font-medium">Behaviors</span>
                  <SkeletonBar width="80%" />
                  <SkeletonBar width="68%" />
                  <SkeletonBar width="55%" />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <span className="font-medium">Interests</span>
                  <SkeletonBar width="82%" />
                  <SkeletonBar width="65%" />
                  <SkeletonBar width="48%" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-lg border border-[var(--glass-border)] p-4">
                <div className="flex flex-col gap-2">
                  <span className="font-medium">Demographics</span>
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
                  <Pill variant="warning">Preflight</Pill>
                  <span className="font-medium">Compatibility & reach</span>
                </div>
                <SkeletonBar width="80%" />
                <SkeletonBar width="65%" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button disabled variant="secondary">
                Save preset (disabled)
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-4">
        <div className="glass-panel h-full rounded-lg p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h4 className="text-lg font-semibold text-white">Audience questions</h4>
              <Pill variant="teal">Brand Insights</Pill>
            </div>
            <span className="text-sm text-muted-foreground">
              Use these high-signal questions to refine audience segments and targeting.
            </span>
            <Separator />
            {questionsError ? (
              <Alert variant="destructive">
                <LightningBoltIcon />
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
