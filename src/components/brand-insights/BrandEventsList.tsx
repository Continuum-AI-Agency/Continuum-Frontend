'use client';

import { useTranslations } from 'next-intl';

import { useMemo } from 'react';

import {
  BrandInsightsDataTable,
  type BrandInsightsTableRow,
} from '@/components/brand-insights/BrandInsightsDataTable';
import { type BrandInsightsEvent, brandInsightsEventSchema } from '@/lib/schemas/brandInsights';

type BrandEventsListProps = {
  events: BrandInsightsEvent[];
  platforms?: string[];
  density?: 'default' | 'compact';
};

export function BrandEventsList({
  events,
  platforms = [],
  density = 'default',
}: BrandEventsListProps) {
  const uiText = useTranslations('common');
  const normalizedEvents = useMemo(() => {
    const parsed = brandInsightsEventSchema.array().safeParse(events);
    return parsed.success ? parsed.data : [];
  }, [events]);

  const rows = useMemo<BrandInsightsTableRow[]>(
    () =>
      normalizedEvents.map((event) => ({
        id: event.id,
        title: event.title,
        subtitle: event.description ?? event.opportunity,
        secondaryValue: event.date ?? uiText('insightNoDate'),
        platforms: event.platforms?.length ? event.platforms : platforms,
        tags: [],
        details: [
          { label: uiText('date_99c40ab'), value: event.date },
          { label: uiText('description_526e008'), value: event.description },
          { label: uiText('m_ff325cb88f'), value: event.opportunity },
        ],
      })),
    [normalizedEvents, platforms, uiText],
  );

  return (
    <BrandInsightsDataTable
      rows={rows}
      formatCount={(count) => uiText('insightCount', { kind: 'events', count })}
      searchPlaceholder={uiText('insightSearchEvents')}
      secondaryHeaderLabel={uiText('date_99c40ab')}
      emptyTitle={uiText('insightNoEvents')}
      emptyDescription={uiText('insightNoEventsDescription')}
      density={density}
      scrollWithinSection
    />
  );
}
