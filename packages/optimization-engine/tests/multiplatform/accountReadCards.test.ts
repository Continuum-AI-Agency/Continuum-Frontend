// The account read files every platform card under a catalogue detector, in SQL (the latest
// migration that defines the card builder — 20261015130000_optimizer_google_tab_reads.sql's
// _platform_card_candidates since G2). SQL cannot import the engine's
// rule list or the contract's detector enum, so this pins the two against the migration: a rule
// added to the engine without an arm there would persist rows no screen ever shows.

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { accountDetectorSchema, isGuardDetector } from '@continuum/contracts';
import { PLATFORM_SIGNAL_RULES } from '../../src';

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

/** The LATEST migration carrying the detector CASE: the one prod runs. Pinning a file name
 *  went stale the day the builder moved (20261007130000 → 20261015130000). */
const MIGRATION = (() => {
  const dir = findMigrationsDir();
  const definers = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => /end as detector/.test(readFileSync(join(dir, name), 'utf8')));
  const latest = definers.at(-1);
  if (!latest) throw new Error('no migration defines the platform card detector CASE');
  return join(dir, latest);
})();

/** The `when '<rule>' then '<detector>'` arms of the CASE that ends `as detector`. */
function detectorArms(sql: string): Map<string, string> {
  const block = /case split_part\(r\.trigger, ':', 2\)([\s\S]*?)end as detector/.exec(sql)?.[1];
  if (!block) throw new Error('no detector CASE in the migration');
  return new Map(
    [...block.matchAll(/when '([^']+)' then '([^']+)'/g)].map((m) => [m[1]!, m[2]!] as const),
  );
}

describe('account read: platform cards → detectors', () => {
  const arms = detectorArms(readFileSync(MIGRATION, 'utf8'));

  test('every rule the engine can emit has exactly one arm, and no arm names a rule it cannot', () => {
    expect([...arms.keys()].sort()).toEqual([...PLATFORM_SIGNAL_RULES].sort());
  });

  test('every arm names a catalogue detector, and never a guard (a card is never lifted above the list)', () => {
    for (const [rule, detector] of arms) {
      const parsed = accountDetectorSchema.safeParse(detector);
      expect({ rule, ok: parsed.success }).toEqual({ rule, ok: true });
      if (parsed.success)
        expect({ rule, guard: isGuardDetector(parsed.data) }).toEqual({ rule, guard: false });
    }
  });
});
