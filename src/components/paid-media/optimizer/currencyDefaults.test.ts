import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// A null currency renders the bare figure — never "$", never USD.
//
// The optimizer-status body for Easy Fit's MXN portfolios carried
// `hero_brief.brief.growth.currency: null`. `formatCurrency` already prints a bare figure for
// that (format.ts), but a single `currency ?? 'USD'` at a call site relabels pesos as dollars
// on a card a client reads, and nothing fails loudly when it happens. So the rule is asserted
// over every optimizer surface rather than per component: the only place allowed to spell a
// dollar sign is format.ts, and only for a code that IS USD.

const OPTIMIZER_ROOT = import.meta.dir;
const SRC = join(import.meta.dir, '..', '..', '..');

/** Optimizer surfaces that live outside the optimizer directory. */
const ELSEWHERE = [
  'lib/api/optimizerNotifications.client.ts',
  'lib/jaina/optimizerCitedRead.ts',
  'components/settings/account/OptimizerNotificationsSection.tsx',
  'components/paid-media/jaina/blocks/JainaOptimizerCitations.tsx',
  'components/paid-media/jaina/blocks/JainaOptimizerHyperframes.tsx',
  'components/paid-media/jaina/blocks/OptimizerCardBlock.tsx',
].map((path) => join(SRC, path));

/** The one formatter that may print "$" — for a USD code, never for a missing one. */
const FORMATTER = join(OPTIMIZER_ROOT, 'format.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === '__fixtures__' ? [] : sourceFiles(path);
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.(test|bench|stories)\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

/** Comments explain why "$" is banned and have to be free to say it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const RULES: { name: string; pattern: RegExp; formatterMay?: boolean }[] = [
  { name: 'a missing value defaulted to USD', pattern: /(\?\?|\|\|)\s*['"`]USD['"`]/ },
  { name: 'a missing value defaulted to "$"', pattern: /(\?\?|\|\|)\s*['"`]\$['"`]/ },
  { name: 'a currency hard-coded to USD', pattern: /currency\s*[:=]\s*['"`]USD['"`]/i },
  {
    name: 'Intl currency style (it needs a code, which invites a default)',
    pattern: /style\s*:\s*['"`]currency['"`]/,
  },
  { name: 'a "$" string literal', pattern: /['"`]\$\s*['"`]/, formatterMay: true },
  { name: 'a "$" glued to an interpolation', pattern: /\$\$\{/, formatterMay: true },
];

function currencyDefaultViolations(file: string, source: string): string[] {
  const code = stripComments(source);
  return RULES.filter((rule) => !(rule.formatterMay && file === FORMATTER))
    .filter((rule) => rule.pattern.test(code))
    .map((rule) => `${file.slice(SRC.length + 1)}: ${rule.name}`);
}

describe('optimizer money never defaults to dollars', () => {
  const files = [...sourceFiles(OPTIMIZER_ROOT), ...ELSEWHERE];

  it('scans a meaningful number of files (guards against a broken walker)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(FORMATTER);
  });

  it('has no call site that answers a missing currency with "$" or USD', () => {
    const violations = files.flatMap((file) =>
      currencyDefaultViolations(file, readFileSync(file, 'utf8')),
    );
    expect(violations).toEqual([]);
  });

  it('catches each shape it bans (the guard is not vacuous)', () => {
    const site = join(OPTIMIZER_ROOT, 'sections', 'Example.tsx');
    for (const offence of [
      "formatCurrency(v, currency ?? 'USD')",
      "const unit = account.currency || '$';",
      "const fallback = { currency: 'USD' };",
      "new Intl.NumberFormat('en-US', { style: 'currency', currency: code })",
      "const prefix = '$';",
      'return `$${value.toFixed(2)}/day`;',
    ]) {
      expect(currencyDefaultViolations(site, offence).length).toBeGreaterThan(0);
    }
    expect(currencyDefaultViolations(site, "// a null currency never prints '$'")).toEqual([]);
    expect(currencyDefaultViolations(site, 'formatCurrency(v, currency ?? null)')).toEqual([]);
  });
});
