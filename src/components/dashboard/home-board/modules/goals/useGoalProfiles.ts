'use client';

// The saved goals, per scope (the brand, or one ad account), held on the client so an edit shows
// at once: each change is saved through the Home's existing actions and rolled back, with the
// action's own words, when the save fails.

import type { HomeObjective, HomeProfileRow } from '@continuum/contracts';
import { useState, useTransition } from 'react';
import {
  resetHomeObjectivesAction,
  saveHomeObjectivesAction,
} from '@/app/(post-auth)/dashboard/actions';
import { toast } from '@/components/ui/toast-imperative';

export type GoalProfiles = {
  rows: HomeProfileRow[];
  save: (scope: string, objectives: HomeObjective[]) => void;
  reset: (scope: string) => void;
};

export function useGoalProfiles(brandId: string, initialRows: HomeProfileRow[]): GoalProfiles {
  const [rows, setRows] = useState<HomeProfileRow[]>(initialRows);
  const [, startSaving] = useTransition();

  const save = (scope: string, objectives: HomeObjective[]) => {
    const previous = rows;
    setRows([
      ...rows.filter((row) => row.scope !== scope),
      { brand_id: brandId, scope, objectives, source: 'user' },
    ]);
    startSaving(async () => {
      const result = await saveHomeObjectivesAction(brandId, scope, objectives);
      if (!result.ok) {
        setRows(previous);
        toast.error(result.message);
      }
    });
  };

  const reset = (scope: string) => {
    const previous = rows;
    setRows(rows.filter((row) => row.scope !== scope));
    startSaving(async () => {
      const result = await resetHomeObjectivesAction(brandId, scope);
      if (!result.ok) {
        setRows(previous);
        toast.error(result.message);
      }
    });
  };

  return { rows, save, reset };
}
