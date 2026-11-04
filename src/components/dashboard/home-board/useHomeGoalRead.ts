'use client';

// A Backend read that speaks in the brand's goal. There is one goal and the Goal tile holds it
// (contracts home/reads/readGoal.ts), so the read waits for what the tile resolved, then asks with
// it. The month's read is shared with the tile under one React Query key: this costs no extra call
// on a board that shows the Goal tile.

import {
  HOME_READ_GOAL_PARAM,
  type HomeReadEnvelope,
  type HomeReadName,
} from '@continuum/contracts';
import { useMemo, useState } from 'react';
import type { ZodType } from 'zod';
import type { HomeReadLoad } from './homeRead';
import {
  boardGoalMetric,
  boardGoalNeedsResults,
  monthToDateWindow,
} from './modules/goals/goalModel';
import { useGoalRead } from './modules/goals/useGoalRead';
import type { HomeBoardContext } from './types';
import { useHomeRead } from './useHomeRead';

export type HomeGoalContext = Pick<
  HomeBoardContext,
  'brandId' | 'adAccounts' | 'profileRows' | 'reading'
>;

export function useHomeGoalRead<T>(
  ctx: HomeGoalContext,
  read: {
    name: HomeReadName;
    schema: ZodType<HomeReadEnvelope<T>>;
    query?: Record<string, string | undefined>;
  },
): HomeReadLoad<T> {
  const [now] = useState(() => new Date());
  const monthWindow = useMemo(() => monthToDateWindow(now), [now]);
  const needsResults = boardGoalNeedsResults(ctx.profileRows);
  const load = useGoalRead(ctx.brandId, ctx.adAccounts, needsResults ? monthWindow : null);
  const goal = boardGoalMetric({
    rows: ctx.profileRows,
    accounts: ctx.adAccounts,
    window: monthWindow,
    load,
    suggested: ctx.reading.goal.suggested,
  });
  return useHomeRead<T>({
    name: read.name,
    brandId: ctx.brandId,
    schema: read.schema,
    query: { ...read.query, [HOME_READ_GOAL_PARAM]: goal.metric },
    enabled: goal.settled,
  });
}
