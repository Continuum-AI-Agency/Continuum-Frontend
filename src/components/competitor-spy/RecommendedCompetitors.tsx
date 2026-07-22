'use client';

import type { RecommendedCompetitor } from '@continuum/contracts';
import { useState } from 'react';
import {
  useCreateCompetitor,
  useDismissRecommendation,
  useRecommendedCompetitors,
} from '@/lib/api/competitorSpy';
import { RecommendedCompetitorCard } from './RecommendedCompetitorCard';

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3';

export function RecommendedCompetitors({ brandId }: { brandId: string }) {
  const { data, isLoading, isError } = useRecommendedCompetitors(brandId);
  const create = useCreateCompetitor(brandId);
  const dismiss = useDismissRecommendation(brandId);
  const [trackingName, setTrackingName] = useState<string | null>(null);

  const limitReached =
    create.error instanceof Error && create.error.message === 'competitor_limit_reached';

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
      <h3 className="text-sm font-semibold">Recommended from onboarding</h3>
      {recommendations.length > 0 ? (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {recommendations.length}
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
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted/70" />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="space-y-3">
        {heading}
        <p className="text-xs text-muted-foreground">Couldn’t load recommendations right now.</p>
      </section>
    );
  }

  if (recommendations.length === 0) {
    return (
      <section className="space-y-3">
        {heading}
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">Looking for competitors from your onboarding…</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Competitors detected in your brand report show up here. Check back shortly.
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
          You can track at most 5 competitors. Remove one to add another.
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
