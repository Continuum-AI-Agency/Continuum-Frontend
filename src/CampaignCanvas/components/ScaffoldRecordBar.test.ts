import { describe, expect, it } from 'bun:test';
import { paidScaffoldPlanSchema } from '@continuum/contracts';
import type { CanvasHydration } from '@/lib/campaign-canvas/hydrate';
import { recordBarBlockers } from './ScaffoldRecordBar';

const PLAN = paidScaffoldPlanSchema.parse({
  schema_version: 1,
  objective: 'OUTCOME_TRAFFIC',
  currency: 'USD',
  adsets: [],
  ads: [],
  evidence: [],
  expected: {
    daily_budget_minor_units: 0,
    currency: 'USD',
    cpa: null,
    cpa_window: null,
    conversions_per_day: null,
    basis: 'none',
  },
  optimizer_enrollment: {
    portfolio: { new_name: 'P' },
    apply_mode: 'recommend',
    autopilot_scopes: {
      budget: false,
      creative_swap: false,
      audience_change: false,
      new_audience: false,
      new_creatives: false,
    },
  },
  blockers: [],
});

const hydration = (plan: CanvasHydration['plan']): CanvasHydration => ({
  scaffoldId: 's',
  scaffoldName: 'S',
  versionId: 'v',
  version: 1,
  lifecycle: 'proposed',
  adAccountId: 'act_1',
  contentHash: 'h',
  plan,
  specialAdCategories: [],
  sourceRows: {},
});

const base = { isDirty: false, isSaving: false, deployInFlight: false };

describe('recordBarBlockers', () => {
  it('a clean, deployable version: nothing to save, Deploy open', () => {
    expect(recordBarBlockers({ ...base, hydration: hydration(PLAN) })).toEqual({
      save: 'No unsaved edits.',
      deploy: null,
    });
  });

  it('a version with no typed plan: Deploy says to save it, and Save is ENABLED even when clean', () => {
    const blockers = recordBarBlockers({ ...base, hydration: hydration(null) });
    expect(blockers.save).toBeNull();
    expect(blockers.deploy).toContain('Save it as a new version to deploy it');
  });

  it('while a save runs, neither acts; while a deploy is in flight, Deploy waits', () => {
    expect(recordBarBlockers({ ...base, isSaving: true, hydration: hydration(PLAN) })).toEqual({
      save: 'Saving…',
      deploy: 'Wait for the save to finish.',
    });
    expect(
      recordBarBlockers({ ...base, deployInFlight: true, hydration: hydration(PLAN) }).deploy,
    ).toContain('Opening the approval');
  });

  it("unsaved edits block Deploy; the version's own blockers are named", () => {
    expect(recordBarBlockers({ ...base, isDirty: true, hydration: hydration(PLAN) }).deploy).toContain(
      'Save your edits first',
    );
    const blocked = { ...PLAN, blockers: [{ code: 'page_unresolved', path_key: null, message: 'No single Page' }] };
    expect(recordBarBlockers({ ...base, hydration: hydration(blocked) }).deploy).toBe('No single Page');
  });
});
