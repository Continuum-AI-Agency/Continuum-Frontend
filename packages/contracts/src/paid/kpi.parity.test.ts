// The drift guard.
//
// paid_media.kpi_for_goal() (SQL) and kpiForOptimizationGoal() (TS) both decide which
// currency an ad is priced in. The win-rate RPCs use the SQL one; the verdicts and the
// budget optimizer use the TS one. If they disagree, the two halves of the product
// quote DIFFERENT medians for the same ad and neither looks wrong — every number stays
// plausible, which is what makes it expensive.
//
// So this test does not restate the mapping (that would prove nothing). It parses the
// CASE arms out of the migration that defines the live SQL function and asserts the TS
// function reproduces them.

import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { KNOWN_OPTIMIZATION_GOALS, kpiForOptimizationGoal, type PaidKpi } from './kpi';

const DEFINES = 'function paid_media.kpi_for_goal';

/** Walk up to the repo root to find supabase/migrations.
 *
 *  This package is VENDORED into the Frontend (`bun run sync:contracts`), so the same
 *  file runs from two different depths. A fixed `../../../..` resolves correctly from one
 *  and lands outside the repo from the other. */
function findMigrationsDir(): string {
  let dir = import.meta.dir;
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, 'supabase/migrations');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error('supabase/migrations not found above ' + import.meta.dir);
}

const MIGRATIONS_DIR = findMigrationsDir();

/** The sentinel the SQL falls back to (`else p_fallback`). TS signals the same by
 *  returning null so the caller can choose its own fallback. */
const FALLBACK = '__fallback__';

/** The LIVE definition is whichever migration defines the function LAST — migrations
 *  replay in lexical order, so a later CREATE OR REPLACE wins. Pinning a filename would
 *  let a newer migration drift away from TS while this test kept passing against a body
 *  that no longer runs anywhere. */
function readLiveKpiForGoalSql(): string {
  const defining = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8').includes(DEFINES));

  expect(defining.length).toBeGreaterThan(0);
  return readFileSync(join(MIGRATIONS_DIR, defining[defining.length - 1]), 'utf8');
}

/** Pull `when 'GOAL' then 'kpi'` pairs out of the kpi_for_goal body only. */
function parseSqlGoalMap(sql: string): Map<string, string> {
  const start = sql.indexOf(DEFINES);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('$$;', start);
  expect(end).toBeGreaterThan(start);
  const body = sql.slice(start, end);

  const map = new Map<string, string>();
  for (const match of body.matchAll(/when\s+'([A-Z_]+)'\s+then\s+'([a-z_]+)'/g)) {
    map.set(match[1], match[2]);
  }
  return map;
}

const sqlGoalMap = parseSqlGoalMap(readLiveKpiForGoalSql());

/** TS, expressed in the SQL's own terms: no promoted-event refinement, fallback as a
 *  sentinel rather than null. This is the shape the two can actually be compared in. */
const tsGoalToKpi = (goal: string): string => kpiForOptimizationGoal(goal) ?? FALLBACK;

describe('kpi_for_goal parity — SQL is the same function as TS', () => {
  it('parsed a non-trivial mapping out of the migration', () => {
    // Guards the guard: a regex that silently matched nothing would make every
    // assertion below vacuously pass.
    expect(sqlGoalMap.size).toBeGreaterThanOrEqual(12);
    expect(sqlGoalMap.get('CONVERSATIONS')).toBe('conversations');
  });

  it('agrees with TS on every goal the SQL maps', () => {
    for (const [goal, sqlKpi] of sqlGoalMap) {
      expect(`${goal} -> ${tsGoalToKpi(goal)}`).toBe(`${goal} -> ${sqlKpi}`);
    }
  });

  it('agrees with TS on every goal TS claims to know', () => {
    for (const goal of KNOWN_OPTIMIZATION_GOALS) {
      const sqlKpi = sqlGoalMap.get(goal) ?? FALLBACK;
      expect(`${goal} -> ${tsGoalToKpi(goal)}`).toBe(`${goal} -> ${sqlKpi}`);
    }
  });

  it('falls back rather than inventing a conversion for attention-buying goals', () => {
    // REACH / IMPRESSIONS / AD_RECALL_LIFT buy attention, not an action. Mapping them
    // to `clicks` here would quietly price an awareness ad as if it were failing to
    // convert.
    for (const goal of ['REACH', 'IMPRESSIONS', 'AD_RECALL_LIFT']) {
      expect(kpiForOptimizationGoal(goal)).toBeNull();
      expect(sqlGoalMap.has(goal)).toBe(false);
    }
  });

  it('returns null for an unknown or absent goal so the caller can fall back', () => {
    expect(kpiForOptimizationGoal(null)).toBeNull();
    expect(kpiForOptimizationGoal(undefined)).toBeNull();
    expect(kpiForOptimizationGoal('')).toBeNull();
    expect(kpiForOptimizationGoal('SOME_GOAL_META_ADDS_NEXT_YEAR')).toBeNull();
  });
});

describe('the promoted-event refinement is TS-only, deliberately', () => {
  // SQL maps OFFSITE_CONVERSIONS -> 'purchases' unconditionally, because
  // promoted_object.custom_event_type is fetched by adSync but NOT yet persisted on
  // paid_media.ads, so the RPCs have nothing to read. TS can do better when the caller
  // has the event in hand.
  //
  // This is a KNOWN divergence, not an oversight. It is asserted so it cannot rot
  // silently, and so that whoever persists custom_event_type sees exactly which SQL
  // arm has to move with it.
  it('prices a LEAD-optimizing conversions ad set in leads when the event is known', () => {
    expect(kpiForOptimizationGoal('OFFSITE_CONVERSIONS', 'LEAD')).toBe<PaidKpi>('leads');
    expect(kpiForOptimizationGoal('ONSITE_CONVERSIONS', 'offsite_conversion.fb_pixel_lead')).toBe(
      'leads',
    );
  });

  it('still prices it in purchases when the event is unknown — matching SQL', () => {
    expect(kpiForOptimizationGoal('OFFSITE_CONVERSIONS')).toBe<PaidKpi>('purchases');
    expect(kpiForOptimizationGoal('OFFSITE_CONVERSIONS', 'PURCHASE')).toBe<PaidKpi>('purchases');
    expect(sqlGoalMap.get('OFFSITE_CONVERSIONS')).toBe('purchases');
  });
});
