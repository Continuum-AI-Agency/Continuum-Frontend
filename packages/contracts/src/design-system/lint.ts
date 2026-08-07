// Checking generated markup against the system's own adherence rules.
//
// This is the part that makes a design system different in kind from a brand book. A
// brand book can only be described to a model and hoped for; an adherence config is a
// predicate, and generated HTML is a string, so the two can actually be compared. When
// the CBA system says "raw hex color — use a design-system color token via var()", that
// is not guidance we paraphrase into a prompt. It is a test.
//
// Findings are advisory to the CALLER, not automatically fatal. The composition agent
// gets them back from `lint_composition` and repairs; whether a violation blocks a
// render is a decision for the rigor tier, made where that context exists.

import type { DesignAdherence, DesignToken } from './tokens';

export interface AdherenceFinding {
  rule: 'raw-hex' | 'raw-px' | 'font-not-allowed';
  /** The offending literal, for a message the model can act on. */
  value: string;
  /** How many times it occurs. */
  count: number;
  message: string;
}

// Hex literals in style attributes, <style> blocks, or inline JS.
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
// Bare px values. `0px` is exempt: it is the one length with no scale position, and
// flagging it produces noise on every reset rule a composition legitimately needs.
const PX_RE = /(?<![\w-])(-?\d{1,4}(?:\.\d+)?)px\b/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;{}"']+)/gi;

/**
 * Values that are never a design-token violation regardless of the config.
 *
 * These are structural rather than aesthetic. A composition is authored at a fixed
 * pixel canvas (`1920px`), its safe areas are expressed in px, and a 1px hairline is a
 * device pixel, not a spacing-scale step. Flagging them would make the linter report
 * violations the system never intended and that no token could express.
 */
const STRUCTURAL_PX = new Set(['0', '1', '2']);

const normalizeHex = (value: string): string => value.trim().toLowerCase();

/**
 * Lint generated markup.
 *
 * `tokens` supplies the permitted values: a hex that EQUALS a declared token is not a
 * violation even under `forbidRawHex`, because the intent of that rule is "do not
 * invent colours", and a composition that inlines the brand's own orange has obeyed it
 * in substance. Enforcing the letter instead would reject correct output for a
 * stylistic preference about `var()` usage.
 */
export function lintAgainstAdherence(args: {
  html: string;
  adherence: DesignAdherence;
  tokens: readonly DesignToken[];
}): AdherenceFinding[] {
  const findings: AdherenceFinding[] = [];
  const { html, adherence } = args;

  if (adherence.forbidRawHex) {
    const permitted = new Set(
      args.tokens
        .filter((token) => token.kind === 'color')
        .map((token) => normalizeHex(token.resolvedValue ?? token.value)),
    );
    const offenders = new Map<string, number>();
    for (const match of html.matchAll(HEX_RE)) {
      const hex = normalizeHex(match[0]);
      if (permitted.has(hex)) continue;
      // #RGB and #RRGGBB spellings of one colour are the same colour.
      if (hex.length === 4) {
        const expanded = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        if (permitted.has(expanded)) continue;
      }
      offenders.set(hex, (offenders.get(hex) ?? 0) + 1);
    }
    for (const [value, count] of offenders) {
      findings.push({
        rule: 'raw-hex',
        value,
        count,
        message: `${value} is not a colour in this design system. Use one of the declared palette tokens.`,
      });
    }
  }

  if (adherence.forbidRawPx) {
    const permitted = new Set(
      args.tokens
        .filter((token) => token.kind === 'dimension')
        .map((token) => (token.resolvedValue ?? token.value).trim().replace(/px$/i, '')),
    );
    const offenders = new Map<string, number>();
    for (const match of html.matchAll(PX_RE)) {
      const raw = match[1];
      if (STRUCTURAL_PX.has(raw) || permitted.has(raw)) continue;
      offenders.set(`${raw}px`, (offenders.get(`${raw}px`) ?? 0) + 1);
    }
    // Report the worst offenders only. A composition has hundreds of lengths and a
    // wall of findings is one the model skims rather than fixes.
    const worst = [...offenders.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8);
    for (const [value, count] of worst) {
      findings.push({
        rule: 'raw-px',
        value,
        count,
        message: `${value} is not on this system's spacing scale. Use the nearest declared step.`,
      });
    }
  }

  if (adherence.fontAllowlist.length > 0) {
    const allowed = adherence.fontAllowlist.map((family) => family.toLowerCase());
    const offenders = new Map<string, number>();
    for (const match of html.matchAll(FONT_FAMILY_RE)) {
      // Only the FIRST family in a stack is the choice; everything after it is a
      // fallback, and a system that names Poppins then `sans-serif` has complied.
      const first = match[1]
        .split(',')[0]
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (first.length === 0 || first.startsWith('var(')) continue;
      if (allowed.some((family) => family === first.toLowerCase())) continue;
      offenders.set(first, (offenders.get(first) ?? 0) + 1);
    }
    for (const [value, count] of offenders) {
      findings.push({
        rule: 'font-not-allowed',
        value,
        count,
        message: `"${value}" is not part of this design system. Use ${adherence.fontAllowlist.join(' or ')}.`,
      });
    }
  }

  return findings;
}

/** One-line summaries for a tool result the model reads. */
export function summarizeFindings(findings: readonly AdherenceFinding[]): string[] {
  return findings.map(
    (finding) => `${finding.message}${finding.count > 1 ? ` (${finding.count} occurrences)` : ''}`,
  );
}
