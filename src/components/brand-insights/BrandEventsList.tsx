'use client';

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
        secondaryValue: event.date ?? 'No date',
        platforms: event.platforms?.length ? event.platforms : platforms,
        tags: [],
        details: [
          { label: 'Date', value: event.date },
          { label: 'Description', value: event.description },
          { label: 'Opportunity', value: event.opportunity },
        ],
      })),
    [normalizedEvents, platforms],
  );

  return (
    <BrandInsightsDataTable
      rows={rows}
      countLabel="events"
      searchPlaceholder="Search events"
      secondaryHeaderLabel="Date"
      emptyTitle="No dated events yet"
      emptyDescription="No event opportunities were found in this generation window."
      density={density}
      scrollWithinSection
    />
  );
}
