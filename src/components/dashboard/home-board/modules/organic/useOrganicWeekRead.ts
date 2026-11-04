'use client';

// The Backend's organic week (R4) for the week the calendar opens on. The tile and its sheet ask
// the same question, so React Query answers both from one read.

import { type HomeOrganicWeekData, homeOrganicWeekReadSchema } from '@continuum/contracts';
import { useMemo } from 'react';
import { readyDataOf } from '../../homeRead';
import { useHomeRead } from '../../useHomeRead';
import { organicWeekQuery, organicWeekReadFor } from './organicWeekRead';

export type OrganicWeekRead = {
  /** The read answered about this week. */
  data: HomeOrganicWeekData | null;
  /** The route is not here yet, so reach per post cannot be said. */
  unavailable: boolean;
};

export function useOrganicWeekRead(brandId: string, enabled: boolean): OrganicWeekRead {
  const query = useMemo(
    () => organicWeekQuery(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone),
    [],
  );
  const load = useHomeRead<HomeOrganicWeekData>({
    name: 'organicWeek',
    brandId,
    schema: homeOrganicWeekReadSchema,
    query,
    enabled,
  });
  return {
    data: organicWeekReadFor(readyDataOf(load), query.weekStart),
    unavailable: load.status === 'unavailable',
  };
}
