import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// "No page reads the brand tier." Access comes from billing products; the tier survives only as
// the not-live fallback, read in exactly ONE place and marked `billing-cutover` so wave 4 can
// delete it. This walks src/ and fails on any other read — a regression shows up by file and line.
//
// The admin panel is out of scope: it is the tool that manages access, and keeps its Tier
// control until go-live (owned by the admin access grid).

const SRC = path.resolve(import.meta.dir, '../..');
const ALLOWED_TIER_READ = path.join('lib', 'billing', 'brandAccess.server.ts');
const SKIPPED = [
  path.join('components', 'admin'),
  path.join('app', '(post-auth)', 'admin'),
  path.join('lib', 'supabase', 'types.ts'),
];

const BRAND_TIER_READS: { name: string; pattern: RegExp }[] = [
  { name: 'a select of a tier column', pattern: /\.select\(\s*['"`][^'"`]*\btier\b/ },
  { name: 'activeBrandTier', pattern: /\bactiveBrandTier\b/ },
  { name: 'a tier predicate', pattern: /\b(isPaidTier|isTemplateForgeTier|brandTierAllows\w*)\b/ },
  { name: 'TierAccessRedirect', pattern: /\bTierAccessRedirect\b/ },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('no src/ file reads the brand tier', () => {
  const files = sourceFiles(SRC)
    .map((file) => path.relative(SRC, file))
    .filter((file) => !SKIPPED.some((skip) => file.startsWith(skip)));

  test('walks the real tree', () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files).toContain(ALLOWED_TIER_READ);
  });

  test('every brand-tier read is the one billing-cutover fallback', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(path.join(SRC, file), 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const { name, pattern } of BRAND_TIER_READS) {
          if (pattern.test(line) && file !== ALLOWED_TIER_READ) {
            offenders.push(`${file}:${index + 1} ${name}: ${line.trim()}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  test('the one fallback read is marked for the cutover', () => {
    const source = readFileSync(path.join(SRC, ALLOWED_TIER_READ), 'utf8');
    const tierSelect = source.indexOf(".select('tier')");
    expect(tierSelect).toBeGreaterThan(-1);
    expect(source.slice(Math.max(0, tierSelect - 200), tierSelect)).toContain('billing-cutover');
  });
});
