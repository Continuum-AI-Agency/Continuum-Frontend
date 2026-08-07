// What to do when the sources disagree, and how to say so.
//
// A brand supplies its identity through several channels at once — an uploaded design
// system, a PDF brand book, the live site, and whatever onboarding already stored —
// and they will not agree. The site is usually stale, the PDF is usually aspirational,
// and the design system is usually right but not always.
//
// The resolution rule is simple and stated once: an uploaded design system wins.
// The interesting part is the RECORD. A silent overwrite is what makes a brand
// distrust the platform when it notices its site colour vanished, so every
// disagreement becomes a row the card can render — with both values named, and with
// the reason one beat the other. That shape deliberately mirrors
// `AuthorityResolution.warnings` in the creative compiler, so the two are one idea.

import { z } from 'zod';
import { AUTHORITY_RANK, type AuthoritySource } from '../creative-system/creative-spec';
import { type DesignSection, designSectionSchema } from './sections';

/**
 * Where a competing value came from.
 *
 * Ordered lowest-authority-first so it reads the same direction as
 * `AUTHORITY_SOURCES`, and mapped onto that ladder by `authorityForOrigin` rather
 * than carrying a second ranking. One ladder or the receipts start disagreeing.
 */
export const designConflictOriginSchema = z.enum([
  'scrape',
  'brand_tokens',
  'document',
  'design_system',
  'user_edit',
]);
export type DesignConflictOrigin = z.infer<typeof designConflictOriginSchema>;

export const ORIGIN_LABELS: Record<DesignConflictOrigin, string> = {
  scrape: 'the live site',
  brand_tokens: 'the existing brand book',
  document: 'an uploaded document',
  design_system: 'the design system',
  user_edit: 'a manual edit',
};

/**
 * A user's own edit outranks the design system, which outranks everything else.
 *
 * `user_edit` maps to `user-explicit` rather than to `brand-hard`: a person changing
 * a swatch in the card editor is making an explicit choice, and modelling it as a
 * brand LAW would let it survive trimming in places a manual tweak should not.
 */
export function authorityForOrigin(
  origin: DesignConflictOrigin,
  designSystemAuthority: AuthoritySource,
): AuthoritySource {
  switch (origin) {
    case 'user_edit':
      return 'user-explicit';
    case 'design_system':
      return designSystemAuthority;
    case 'document':
      return 'brand-preferred';
    case 'brand_tokens':
      return 'taste-shortcut';
    case 'scrape':
      return 'provider-default';
  }
}

export const designConflictSchema = z
  .object({
    section: designSectionSchema,
    /** What disagreed, in the brand's own terms: "accent colour", "body typeface". */
    field: z.string().min(1).max(160),
    winner: z
      .object({
        origin: designConflictOriginSchema,
        value: z.string().min(1).max(300),
      })
      .strict(),
    loser: z
      .object({
        origin: designConflictOriginSchema,
        value: z.string().min(1).max(300),
      })
      .strict(),
    /** Rendered sentence for the warning bar. */
    detail: z.string().min(1).max(600),
    /** Set when a human has seen this and chosen to leave it. */
    acknowledgedAt: z.string().nullable().default(null),
  })
  .strict();
export type DesignConflict = z.infer<typeof designConflictSchema>;

/**
 * Resolve one contested field across origins, recording what lost.
 *
 * Returns null when nothing genuinely competes — one candidate, or every candidate
 * agreeing. Filing a conflict for values that match would fill the card with rows
 * saying the sources agree, which is noise that trains people to ignore the bar.
 *
 * Comparison is case-insensitive and trimmed because `#FFAA1C` and `#ffaa1c` are the
 * same colour, and a warning bar that fires on casing is a warning bar nobody reads.
 */
export function resolveDesignConflict(args: {
  section: DesignSection;
  field: string;
  designSystemAuthority: AuthoritySource;
  candidates: ReadonlyArray<{ origin: DesignConflictOrigin; value: string }>;
}): { value: string; origin: DesignConflictOrigin; conflict: DesignConflict | null } | null {
  const present = args.candidates.filter((candidate) => candidate.value.trim().length > 0);
  if (present.length === 0) return null;

  const ranked = [...present].sort(
    (left, right) =>
      AUTHORITY_RANK[authorityForOrigin(right.origin, args.designSystemAuthority)] -
      AUTHORITY_RANK[authorityForOrigin(left.origin, args.designSystemAuthority)],
  );
  const winner = ranked[0];
  const same = (value: string): boolean =>
    value.trim().toLowerCase() === winner.value.trim().toLowerCase();

  const beaten = ranked.slice(1).find((candidate) => !same(candidate.value));
  if (!beaten) return { value: winner.value, origin: winner.origin, conflict: null };

  return {
    value: winner.value,
    origin: winner.origin,
    conflict: {
      section: args.section,
      field: args.field,
      winner: { origin: winner.origin, value: winner.value },
      loser: { origin: beaten.origin, value: beaten.value },
      detail:
        `${capitalize(ORIGIN_LABELS[beaten.origin])} reports ${beaten.value} for ${args.field}; ` +
        `${ORIGIN_LABELS[winner.origin]} declares ${winner.value}. ` +
        `${capitalize(ORIGIN_LABELS[winner.origin])} wins.`,
      acknowledgedAt: null,
    },
  };
}

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
