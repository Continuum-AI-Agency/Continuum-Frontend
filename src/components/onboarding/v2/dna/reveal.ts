// What the reveal is allowed to SAY, derived from what the run actually read.
//
// The Brand DNA screen is the first thing a customer sees us claim about their brand, so
// every field on it has to answer two questions rather than one: what is the value, and
// did we READ it or did it come back EMPTY. An empty field is a correct outcome — a site
// that states nothing about its voice has an empty voice, and showing a placeholder in
// its place is the same lie as drawing a substitute typeface.
//
// PURE, like `settings/brand/brandPanels.ts`: no React, no fetch. Nothing here invents a
// value, and nothing here writes a sentence a row did not already record. Where the run
// recorded a ROLE (a palette key, a typography slot) the sentence restates that role; a
// colour that arrived as a bare hex has no role, and says so.

import type { WebsitePalette, WebsiteTypography } from '@/lib/onboarding/agentClient';

/** Did the run read this field, and off what. `null` source means it came back empty. */
export interface FieldProvenance {
  read: boolean;
  /** Where the value came from — only meaningful when `read`. */
  source: string | null;
}

export const readFrom = (source: string): FieldProvenance => ({ read: true, source });
export const EMPTY: FieldProvenance = { read: false, source: null };

/** `read` when the value is a non-blank string, `EMPTY` otherwise. */
export function provenanceOf(value: unknown, source: string): FieldProvenance {
  if (typeof value === 'string') return value.trim().length > 0 ? readFrom(source) : EMPTY;
  if (Array.isArray(value)) return value.length > 0 ? readFrom(source) : EMPTY;
  return value == null ? EMPTY : readFrom(source);
}

/* ── typography ─────────────────────────────────────────────────────────────── */

export interface RevealedTypeface {
  /** `Primary` is heading/display, `Secondary` is body — the contract's own split. */
  slot: 'Primary' | 'Secondary';
  family: string | null;
  usedFor: string;
  provenance: FieldProvenance;
}

const TYPE_SLOTS = [
  { slot: 'Primary', key: 'primary', usedFor: 'Headings and display' },
  { slot: 'Secondary', key: 'secondary', usedFor: 'Body copy' },
] as const;

/**
 * The two families the run looked for, each with whether it found one.
 *
 * Both slots are always returned. A brand whose site declares one family has an EMPTY
 * secondary, and hiding that row would read as "we only look for one".
 */
export function deriveRevealedTypography(
  typography: WebsiteTypography | { primary: string | null; secondary: string | null } | null,
  source: string,
): RevealedTypeface[] {
  return TYPE_SLOTS.map(({ slot, key, usedFor }) => {
    const family = typography?.[key]?.trim() || null;
    return { slot, family, usedFor, provenance: provenanceOf(family, source) };
  });
}

/* ── palette ────────────────────────────────────────────────────────────────── */

export interface RevealedColour {
  hex: string;
  /** The palette key the run recorded this hex under, or `null` for a bare hex. */
  role: string | null;
  /**
   * The rule, restated from the recorded role. `null` when nothing recorded one — the
   * row then says so rather than carrying a sentence somebody made up.
   */
  rule: string | null;
}

const PALETTE_ROLES = ['primary', 'secondary', 'accent', 'background', 'text'] as const;

/**
 * A palette the run recorded ROLES for keeps them; a bare hex list keeps none.
 *
 * `brand.colors` is a flat `string[]` — whatever produced it threw the roles away, so no
 * amount of inspection here can recover one. That is the case the `null` rule exists for.
 */
export function deriveRevealedPalette(
  colors: string[],
  palette: WebsitePalette | null | undefined,
): RevealedColour[] {
  const roled: RevealedColour[] = [];
  for (const role of PALETTE_ROLES) {
    const hex = palette?.[role];
    if (hex) roled.push({ hex, role, rule: `Read from the site as the ${role} colour.` });
  }
  if (roled.length > 0) return roled;
  return colors.map((hex) => ({ hex, role: null, rule: null }));
}
