import { describe, expect, it } from 'bun:test';
import {
  templateForgeProgressSchema,
  templateForgeRunIsMoving,
  templateForgeRunPercent,
  templateForgeRunSchema,
} from './template-forge-run';

// The real wire shape of src/app/progress.js, mid-run: the AEP has been parsed, so the total is
// known, and the provisioner is partway through creating nineteen columns.
const PROVISIONING = {
  total: 35,
  done: 12,
  pct: 34,
  phase: 'provision',
  detail: 'fields 7/19',
  phases: [
    { name: 'analyze', total: 2, done: 2 },
    { name: 'derive', total: 2, done: 2 },
    { name: 'provision', total: 25, done: 7 },
    { name: 'seed', total: 1, done: 0 },
    { name: 'load', total: 0, done: 0 },
    { name: 'build', total: 2, done: 0 },
    { name: 'validate', total: 2, done: 0 },
  ],
};

// The same run seconds earlier: intake, before the Essential Graphics have been read. Nobody can
// know how many columns the AEP implies yet, so two phases are unsized and the TOTAL is unknown.
const AT_INTAKE = {
  total: null,
  done: 0,
  pct: null,
  phase: null,
  detail: null,
  phases: [
    { name: 'analyze', total: 2, done: 0 },
    { name: 'derive', total: null, done: 0 },
    { name: 'provision', total: null, done: 0 },
    { name: 'seed', total: 1, done: 0 },
    { name: 'load', total: 0, done: 0 },
    { name: 'build', total: 2, done: 0 },
    { name: 'validate', total: 2, done: 0 },
  ],
};

describe('templateForgeProgressSchema', () => {
  it('reads a sized, mid-flight run', () => {
    expect(templateForgeProgressSchema.parse(PROVISIONING).detail).toBe('fields 7/19');
  });

  // The property the whole progress model exists to protect. A schema that made these non-null
  // would force a caller to invent a number, and 0 is the one number that reads as "started and
  // stuck" — which is exactly how a wedged run would then look healthy.
  it('keeps an unknown total and pct as null, not zero', () => {
    const parsed = templateForgeProgressSchema.parse(AT_INTAKE);
    expect(parsed.total).toBeNull();
    expect(parsed.pct).toBeNull();
    expect(parsed.phases.find((p) => p.name === 'derive')?.total).toBeNull();
  });

  // A phase with nothing to do is sized 0 rather than marked done, so pct:100 always means the
  // work finished and never that a step was skipped quietly.
  it('keeps a zero-sized phase distinguishable from an unsized one', () => {
    const parsed = templateForgeProgressSchema.parse(AT_INTAKE);
    expect(parsed.phases.find((p) => p.name === 'load')?.total).toBe(0);
  });
});

describe('templateForgeRunPercent', () => {
  it('reports the percentage when the total is known', () => {
    expect(templateForgeRunPercent({ progress: templateForgeProgressSchema.parse(PROVISIONING) })).toBe(34);
  });

  it('reports null — never 0 — while the total is unknown', () => {
    expect(templateForgeRunPercent({ progress: templateForgeProgressSchema.parse(AT_INTAKE) })).toBeNull();
    expect(templateForgeRunPercent({ progress: null })).toBeNull();
  });
});

describe('templateForgeRunIsMoving', () => {
  it('is true only while the engine is advancing the run itself', () => {
    expect(templateForgeRunIsMoving({ done: false, state: 'mapping' })).toBe(true);
  });

  // `done` covers needs_input and draft_ready too — states a PERSON moves, not the engine. A
  // poller that kept going on those would spin against a run that cannot change until someone
  // acts.
  it('is false for every state the engine parks on', () => {
    for (const state of ['needs_input', 'draft_ready', 'review_ready', 'published', 'failed']) {
      expect(templateForgeRunIsMoving({ done: true, state })).toBe(false);
    }
  });
});

describe('templateForgeRunSchema', () => {
  const base = {
    runId: 'run_1',
    assetId: crypto.randomUUID(),
    brandId: crypto.randomUUID(),
    state: 'mapping',
    done: false,
    ok: null,
    progress: PROVISIONING,
    findings: [],
    needs: [],
    error: null,
    application: 'Six_app',
    rootTable: 'tpl_inyogo_root',
    startedAt: new Date().toISOString(),
    polledAt: null,
    finishedAt: null,
  };

  it('accepts a run in flight, with ok still unanswered', () => {
    const parsed = templateForgeRunSchema.parse(base);
    expect(parsed.ok).toBeNull();
    expect(parsed.done).toBe(false);
  });

  // done && ok === false is a run blocked on `needs` OR failed. Both are real, and a schema that
  // required ok to be boolean whenever done is true would make the blocked case unrepresentable.
  it('accepts a parked run that is not a success', () => {
    const parsed = templateForgeRunSchema.parse({ ...base, state: 'needs_input', done: true, ok: false });
    expect(parsed.ok).toBe(false);
  });

  // Findings are display data the forge owns and extends; a new key on one must not cost the
  // whole run its ingestion.
  it('tolerates a finding carrying a field this build does not know', () => {
    const parsed = templateForgeRunSchema.parse({
      ...base,
      findings: [{ code: 'SEED_SKIPPED', what: 'seed row', resolver: null, introducedIn: 'w4' }],
    });
    expect(parsed.findings[0]?.code).toBe('SEED_SKIPPED');
  });
});
