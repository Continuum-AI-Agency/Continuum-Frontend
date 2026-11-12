'use client';

import type { RecommendedCompetitor } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatCompetitorNumber } from '@/components/competitor-spy/brandVisuals';
import { competitorApiCode } from '@/components/competitors/competitorErrorCopy';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCreateCompetitor,
  useDismissRecommendation,
  useRecommendedCompetitors,
} from '@/lib/api/competitorSpy';
import { RecommendedCompetitorCard } from './RecommendedCompetitorCard';

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3';

export function RecommendedCompetitors({ brandId }: { brandId: string }) {
  const uiLocale = useLocale();

  const uiText = useTranslations('competitor');
  const { data, isLoading, isError } = useRecommendedCompetitors(brandId);
  const create = useCreateCompetitor(brandId);
  const dismiss = useDismissRecommendation(brandId);
  const [trackingName, setTrackingName] = useState<string | null>(null);

  const limitReached = competitorApiCode(create.error) === 'competitor_limit_reached';

  const track = (rec: RecommendedCompetitor) => {
    setTrackingName(rec.name);
    create.mutate(
      { name: rec.name, instagramUsername: rec.instagramHandle ?? undefined },
      { onSettled: () => setTrackingName(null) },
    );
  };

  const recommendations = data ?? [];
  const heading = (
    <div className="flex items-baseline justify-between">
      <h3 className="text-sm font-semibold">{uiText('recommended_from_onboarding_294d005')}</h3>
      {recommendations.length > 0 ? (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatCompetitorNumber(recommendations.length, uiLocale)}
        </span>
      ) : null}
    </div>
  );

  if (isLoading) {
    return (
      <section className="space-y-3">
        {heading}
        <div className={GRID}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="space-y-3">
        {heading}
        <p className="text-xs text-muted-foreground">
          {uiText('couldn_t_load_recommendations_right_now_c50612d')}
        </p>
      </section>
    );
  }

  if (recommendations.length === 0) {
    return (
      <section className="space-y-3">
        {heading}
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">
            {uiText('looking_for_competitors_from_your_onboarding_fe052c6')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {uiText('competitors_detected_in_your_brand_report_sho_6be4916')}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {heading}
      {limitReached ? (
        <p className="text-xs text-destructive">
          {uiText('you_can_track_at_most_5_competitors_remove_on_bcdf59c')}
        </p>
      ) : null}
      <div className={GRID}>
        {recommendations.map((rec) => (
          <RecommendedCompetitorCard
            key={rec.name}
            competitor={rec}
            onTrack={() => track(rec)}
            onDismiss={() => dismiss.mutate({ name: rec.name })}
            isTracking={trackingName === rec.name && create.isPending}
          />
        ))}
      </div>
    </section>
  );
}
