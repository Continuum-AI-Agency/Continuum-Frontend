import { describe, expect, it } from 'bun:test';
import { paidScaffoldPlanSchema } from '@continuum/contracts';
import type { CanvasHydration } from '@/lib/campaign-canvas/hydrate';
import { pickerValue, recordBarBlockers, recordBarEmptyState } from './ScaffoldRecordBar';

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
    expect(
      recordBarBlockers({ ...base, isDirty: true, hydration: hydration(PLAN) }).deploy,
    ).toContain('Save your edits first');
    const blocked = {
      ...PLAN,
      blockers: [{ code: 'page_unresolved', path_key: null, message: 'No single Page' }],
    };
    expect(recordBarBlockers({ ...base, hydration: hydration(blocked) }).deploy).toBe(
      'No single Page',
    );
  });
});

// PP-L1-campaign-canvas-near-blank-landing: a brand WITH proposals landed on an empty canvas, a
// picker whose trigger printed nothing ('' is a value to the Select, so no placeholder) and two
// disabled buttons — 46 visible characters and no named state.
describe('recordBarEmptyState', () => {
  const landing = { hydration: null, nodeCount: 0, isLoadingGraph: false };

  it('names the empty canvas when proposals exist but none is loaded', () => {
    expect(recordBarEmptyState({ ...landing, scaffoldCount: 3 })).toBe(
      'Nothing on the canvas yet. Pick a proposal to edit it here, or ask Jaina to propose a campaign.',
    );
  });

  it('keeps the no-proposals sentence for a brand with none', () => {
    expect(recordBarEmptyState({ ...landing, scaffoldCount: 0 })).toBe(
      'No proposals yet — ask Jaina to propose a campaign and it will appear here.',
    );
  });

  it('is silent while the list or a graph loads, once a graph is on screen, or nodes were drawn', () => {
    expect(recordBarEmptyState({ ...landing, scaffoldCount: null })).toBeNull();
    expect(recordBarEmptyState({ ...landing, scaffoldCount: 3, isLoadingGraph: true })).toBeNull();
    expect(
      recordBarEmptyState({ ...landing, scaffoldCount: 3, hydration: hydration(PLAN) }),
    ).toBeNull();
    expect(recordBarEmptyState({ ...landing, scaffoldCount: 3, nodeCount: 2 })).toBeNull();
  });
});

describe('pickerValue', () => {
  it('hands the Select null for "nothing chosen", so its placeholder shows', () => {
    expect(pickerValue('')).toBeNull();
    expect(pickerValue('scaffold-1')).toBe('scaffold-1');
  });
});
