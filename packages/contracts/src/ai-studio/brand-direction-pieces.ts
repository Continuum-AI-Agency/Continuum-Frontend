// What a brand has ACTUALLY authored, so a surface can offer toggles that mean something.
//
// The Canvas brand-book toggle speaks the v1 `BrandBookPieceKind` vocabulary — `colors`,
// `typography`, `imagery` — and drives the legacy grounding path. The compiler speaks v2
// `BrandDirectionPiece` — `colour-behaviour`, `photography`, `visual-thesis`. The two enums
// share no member and no mapping between them is authored anywhere, deliberately: `imagery`
// is equally defensibly `visual-thesis`, `photography` or `illustration-graphic`, and a
// guessed mapping silently drops rules the brand approved.
//
// So a surface that wants to switch parts of the COMPILER on and off has to speak v2, and to
// do that it has to know which v2 pieces this brand has written. That is what this read is
// for. It reports only what exists — a brand with no `motion` rule gets no `motion` toggle,
// because a switch for a rule nobody wrote does nothing and implies something was lost.

import { z } from 'zod';

import { brandDirectionPieceEnum } from '../onboarding/brand-direction';

/**
 * One piece a brand has authored, with enough detail for a surface to label the control.
 *
 * `approvedCount` is separated from `ruleCount` because only approved rules can reach a
 * prompt. A piece with rules that are all still proposals is worth SHOWING — the author knows
 * they wrote something — and worth marking, because toggling it on changes nothing yet.
 */
export const authoredBrandPieceSchema = z
  .object({
    piece: brandDirectionPieceEnum,
    ruleCount: z.number().int().min(1),
    approvedCount: z.number().int().min(0),
    /** True when at least one approved rule in this piece is `hard` and can therefore gate. */
    gates: z.boolean(),
  })
  .strict();
export type AuthoredBrandPiece = z.infer<typeof authoredBrandPieceSchema>;

export const brandDirectionPiecesResponseSchema = z
  .object({
    brandId: z.string().uuid(),
    /**
     * Null when this brand has no v2 direction at all — which is a real answer and not an
     * error. A surface should say "this brand has not authored creative direction yet"
     * rather than render an empty control panel that looks like everything is switched off.
     */
    directionVersion: z.number().int().min(1).nullable(),
    pieces: z.array(authoredBrandPieceSchema),
  })
  .strict();
export type BrandDirectionPiecesResponse = z.infer<typeof brandDirectionPiecesResponseSchema>;
