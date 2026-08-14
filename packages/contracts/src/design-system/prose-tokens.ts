// Tokens a brand guideline states in sentences rather than in code.
//
// A design-system export declares `--cba-orange: #FFAA1C` in CSS and the parser reads
// it exactly. A brand guideline PDF says "Naranjo CBA — #FFAA1C" on a page, and that
// hex is just as much the brand's palette. Without this, a document import produces
// prose sections and NO tokens, which means no palette projection into `brand_tokens`
// and no stylesheet for HyperFrames — the two things that make an import reach the
// generators at all.
//
// Deliberately narrow: colours and font families only. Everything else a document
// states (spacing policy, radii policy, what may sit next to what) is prose, and the
// per-section model pass already reads prose better than a regex can. Widening this
// into a general "parse a design system out of English" is the failure mode to avoid.

import { type DesignToken, isLiteralHex } from './tokens';

const HEX_IN_TEXT = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const FONT_DECLARATION =
  /(?:font(?:[-\s]?family)?|typefaces?|tipograf[ií]as?|tipo de letra)\s*[:：\-–]\s*([A-Za-z][A-Za-z0-9 ]{1,40})/gi;

/** Colours can repeat on every page of a deck; the schema caps tokens at 600. */
const MAX_COLORS = 60;
const MAX_FONTS = 8;

/** Slug a token name out of whatever labelled the colour on its own line. */
function nameFromLabel(line: string, fallbackIndex: number): string {
  const words = line
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-3);
  const slug = words
    .join('-')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  return slug ? `--${slug}` : `--color-${fallbackIndex}`;
}

/**
 * Read literal colours and declared font families out of extracted document text.
 *
 * Names are deduplicated by VALUE, not by label: the same hex captioned three
 * different ways across a deck is one token, and keeping all three would put three
 * competing names for one colour into the palette the generators read.
 */
export function parseTokensFromProse(text: string, definedIn: string): DesignToken[] {
  const tokens: DesignToken[] = [];

  const seenColors = new Set<string>();
  const seenNames = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    for (const match of line.matchAll(HEX_IN_TEXT)) {
      const value = match[0].toUpperCase();
      if (!isLiteralHex(value) || seenColors.has(value)) continue;
      if (seenColors.size >= MAX_COLORS) break;
      seenColors.add(value);
      let name = nameFromLabel(line.slice(0, match.index), seenColors.size);
      if (seenNames.has(name)) name = `${name}-${seenColors.size}`;
      seenNames.add(name);
      tokens.push({
        name,
        value,
        kind: 'color',
        resolvedValue: value,
        definedIn,
        description: null,
      });
    }
  }

  const seenFamilies = new Set<string>();
  for (const match of text.matchAll(FONT_DECLARATION)) {
    const family = match[1].trim().replace(/\s+/g, ' ');
    const key = family.toLowerCase();
    if (seenFamilies.has(key) || seenFamilies.size >= MAX_FONTS) continue;
    seenFamilies.add(key);
    tokens.push({
      name: `--font-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      value: family,
      kind: 'font',
      resolvedValue: family,
      definedIn,
      description: null,
    });
  }

  return tokens;
}

/** The families `parseTokensFromProse` found, for the snapshot's `fonts` list. */
export function fontFamiliesFromProseTokens(tokens: readonly DesignToken[]): string[] {
  return tokens.filter((token) => token.kind === 'font').map((token) => token.value);
}
