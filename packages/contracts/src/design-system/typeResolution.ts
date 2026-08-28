// Where a brand's TYPE and its INK come from — a chain, not a single table.
//
// The burn-in used to read one place, the design system's typography section, and refuse the
// whole node when that place was empty. That was the right instinct applied at the wrong
// scope: a guessed brand COLOUR is worse than a refusal, but a brand whose typefaces are
// written in its brand book got a wall for no reason. Type lives in four places in this
// product and only one of them is a design system.
//
// TWO RULES HOLD THIS UP:
//
//   • EVERY RUNG PROJECTS TO ONE SHAPE. `projectSectionsToBrandTokens` already narrows a
//     design system to `{ colors, typography }`; `extractBrandColorTokens` /
//     `extractBrandFontTokens` already narrow a kit and a scrape to the same pair. So the
//     chain is a list of those pairs walked in order, not four bespoke readers that each
//     decide separately what "the brand's display face" means.
//   • THE SOURCE IS RETURNED, NEVER INFERRED. A fallback face is fine; an unlabelled one is
//     a lie, and it is the exact lie this codebase spends effort not telling elsewhere — the
//     typography panel refuses to draw a substitute specimen, onboarding marks a field READ
//     or EMPTY. `BrandTypeSource` is a discriminated value rather than a boolean because the
//     UI has to name the place, and a boolean cannot.
//
// INK IS SYMMETRIC WITH TYPE, but its last rung is a different KIND of thing. Type's fallback
// is a lookup — a face we ship. Ink's fallback cannot be, because a hard-coded hex is a guess
// dressed as a value: black is right on a bright photo and invisible on a night scene, and the
// treatment ladder would then wash the whole picture out trying to rescue it. So the ink chain
// walks the brand shapes and stops (`resolveBrandInk` has no `fallback` member on purpose),
// and the last rung is `deriveLegibleInk` — a MEASUREMENT of the photo, made by the caller
// that has pixels. Same provenance story as everything else here: nothing is invented, and
// whichever rung answered is named.

import {
  type BrandColorToken,
  type BrandFontToken,
  type BrandMdTokens,
  extractBrandColorTokens,
  extractBrandFontTokens,
} from '../onboarding/brand-md';
import type { BrandPalette, BrandTypography } from '../onboarding/website-summary';
import {
  brightPercentileContrast,
  darkPercentileContrast,
  type FractionalBox,
  type PixelBuffer,
  type Rgb,
} from './image-analysis';
import type { DesignSystemSnapshot } from './manifest';
import { projectSectionsToBrandTokens } from './sections';
import { isLiteralHex } from './tokens';

/** Ordered worst-last. The array IS the precedence; nothing re-declares it. */
export const BRAND_TYPE_SOURCES = [
  'design-system',
  'brand-md',
  'brand-kit',
  'scrape',
  'fallback',
] as const;
export type BrandTypeSource = (typeof BRAND_TYPE_SOURCES)[number];

/**
 * The rungs an ink can come from THE BRAND. `fallback` is deliberately absent: this walker
 * never invents a colour, it only reports what a brand shape actually carries. The fallback ink
 * is not a lookup at all — it is {@link deriveLegibleInk}, a measurement of the photo — so it is
 * added by the caller that has pixels, and is typed as the wider {@link BrandTypeSource}.
 */
export type BrandInkSource = Exclude<BrandTypeSource, 'fallback'>;

/** What the node and the config panel say out loud. One string, so they cannot disagree. */
export const BRAND_TYPE_SOURCE_LABEL: Record<BrandTypeSource, string> = {
  'design-system': 'the design system',
  'brand-md': 'the brand book',
  'brand-kit': 'the brand kit',
  scrape: 'the website',
  fallback: 'no brand face found',
};

/** The same map for INK. Only the last rung differs, and only the last rung matters. */
export const BRAND_INK_SOURCE_LABEL: Record<BrandTypeSource, string> = {
  ...BRAND_TYPE_SOURCE_LABEL,
  fallback: 'no brand colour found',
};

/**
 * The last rung: faces this product ships and self-hosts.
 *
 * Both are families in `Continuum-Frontend/src/lib/clips/captionFonts.ts` with real woff2
 * files under `public/fonts/`, which is what makes this rung honest — the renderer can embed
 * the bytes, so a piece that reports `fallback` is genuinely set in Montserrat rather than in
 * whatever the machine happened to substitute. Both are VARIABLE files on purpose: the
 * headline changes weight mid-sentence, and a single-weight face (Anton) would silently
 * flatten `**bold**` into the light run.
 */
export const PRELOADED_TYPE_FACES = { display: 'Montserrat', body: 'Inter' } as const;

/** Whatever brand shapes the caller could reach. Every field is optional by design: a read
 *  that failed and a value that is absent are the same thing to this resolver. */
export interface BrandTypeInputs {
  readonly designSystem?: DesignSystemSnapshot | null;
  readonly brandMd?: Pick<BrandMdTokens, 'colors' | 'typography'> | null;
  readonly brandKit?: {
    readonly typography?: BrandTypography | null;
    readonly colors?: readonly string[] | null;
  } | null;
  readonly scrape?: {
    readonly typography?: BrandTypography | null;
    readonly palette?: BrandPalette | null;
  } | null;
}

export interface ResolvedBrandType {
  /** The headline face. */
  readonly display: string;
  /** The supporting face; equal to `display` when the source names only one. */
  readonly body: string;
  readonly source: BrandTypeSource;
}

export interface ResolvedBrandInk {
  /** A literal hex, ready to parse. Never an alias, never a var() reference. */
  readonly hex: string;
  /** The token this came from when the source named one — for the message a refusal prints. */
  readonly tokenName: string | null;
  readonly source: BrandInkSource;
}

/**
 * A family name that can be interpolated into a CSS font shorthand and an XML attribute.
 *
 * Checked HERE rather than at the draw site so an unusable name falls through to the next
 * rung instead of poisoning the chain: a brand.md with `family: "Helvetica'; }"` should get
 * the brand kit's face, not a refusal and not a broken SVG.
 */
export const isUsableFontFamily = (family: string): boolean =>
  /^[^'"(){};\\\r\n<>&]+$/.test(family.trim()) && family.trim().length > 0;

const cleanFamily = (family: string): string | null => {
  const clean = family.trim().replace(/^['"]|['"]$/g, '');
  return isUsableFontFamily(clean) ? clean : null;
};

/**
 * The families a design system names, best first.
 *
 * A font TOKEN outranks the declared font list because the token is what the system tells its
 * own consumers to use; `fonts[]` is an inventory of everything the archive mentioned. Only
 * the first family of a stack is taken — the rest of a stack is the fallback the renderer
 * appends anyway.
 */
export function designSystemFontFamilies(snapshot: DesignSystemSnapshot): string[] {
  const fromTokens = snapshot.tokens
    .filter((token) => token.kind === 'font')
    .map((token) => cleanFamily((token.resolvedValue ?? token.value).split(',')[0] ?? ''));
  const declared = snapshot.fonts.map((font) => cleanFamily(font.family));
  return [...new Set([...fromTokens, ...declared].filter((f): f is string => f !== null))];
}

/** One rung: a source and the brand tokens it yielded. */
interface TypeRung {
  readonly source: BrandInkSource;
  readonly colors: readonly BrandColorToken[];
  readonly typography: readonly BrandFontToken[];
}

/**
 * The chain, in order, with empty rungs left IN.
 *
 * An empty rung is not skipped here because the two walkers disagree about what "empty"
 * means — a source can carry a colour and no face, or the reverse — and dropping it once for
 * both would make the ink chain lie about which source it read.
 */
function rungsOf(inputs: BrandTypeInputs): TypeRung[] {
  const rungs: TypeRung[] = [];

  if (inputs.designSystem) {
    const projected = projectSectionsToBrandTokens({
      brandName: inputs.designSystem.brandName,
      tokens: inputs.designSystem.tokens,
      fontFamilies: designSystemFontFamilies(inputs.designSystem),
    });
    rungs.push({
      source: 'design-system',
      colors: projected.colors,
      typography: projected.typography,
    });
  }

  if (inputs.brandMd) {
    rungs.push({
      source: 'brand-md',
      colors: inputs.brandMd.colors ?? [],
      typography: inputs.brandMd.typography ?? [],
    });
  }

  if (inputs.brandKit) {
    rungs.push({
      source: 'brand-kit',
      colors: extractBrandColorTokens(null, inputs.brandKit.colors ?? []),
      typography: extractBrandFontTokens(inputs.brandKit.typography),
    });
  }

  if (inputs.scrape) {
    rungs.push({
      source: 'scrape',
      colors: extractBrandColorTokens(inputs.scrape.palette, []),
      typography: extractBrandFontTokens(inputs.scrape.typography),
    });
  }

  return rungs;
}

const facesFrom = (
  typography: readonly BrandFontToken[],
): { display: string; body: string } | null => {
  const usable = typography
    .map((token) => ({ role: token.role, family: cleanFamily(token.family) }))
    .filter(
      (token): token is { role: BrandFontToken['role']; family: string } => token.family !== null,
    );
  if (usable.length === 0) return null;
  const display = usable.find((token) => token.role === 'display') ?? usable[0];
  const body = usable.find((token) => token.role === 'body') ?? display;
  return { display: display.family, body: body.family };
};

/**
 * The faces to set, and WHERE THEY CAME FROM.
 *
 * Always answers. A brand with type nowhere gets the preloaded pair and a `fallback` source
 * the caller is expected to show; that is the whole difference between this and the refusal
 * it replaces.
 */
export function resolveBrandType(inputs: BrandTypeInputs): ResolvedBrandType {
  for (const rung of rungsOf(inputs)) {
    const faces = facesFrom(rung.typography);
    if (faces) return { ...faces, source: rung.source };
  }
  return { ...PRELOADED_TYPE_FACES, source: 'fallback' };
}

/**
 * Names a brand gives its body ink, in preference order.
 *
 * `role === 'text'` is checked first because every rung tags roles — `projectSectionsToBrandTokens`
 * maps `fg-1|text|ink|foreground` onto it, and a kit/scrape palette carries it outright. The
 * name patterns catch the leftovers a role-less brand.md entry leaves behind.
 */
const DEFAULT_INK_NAMES = /^(fg-1|text|ink|foreground|body|navy)$/;

const bareName = (name: string): string => name.trim().toLowerCase().replace(/^--/, '');

const literal = (token: BrandColorToken): string | null => {
  const value = token.value.trim();
  return isLiteralHex(value) ? value : null;
};

/**
 * The ink to set the type in, and where it came from — or null.
 *
 * NULL, not a throw and not a default. The caller owns the message, because only the caller
 * knows whether the type resolved: "this brand has no colour" and "this brand has nothing at
 * all" are different sentences, and the old code printed one of them for both.
 *
 * A NAMED token is matched by name across every rung before any default is considered. Asking
 * for `--accent` and silently getting the body ink because the design system was missing is
 * the same class of quiet substitution the source label exists to prevent.
 */
export function resolveBrandInk(inputs: BrandTypeInputs, tokenName = ''): ResolvedBrandInk | null {
  const rungs = rungsOf(inputs);
  const wanted = bareName(tokenName);

  if (wanted) {
    for (const rung of rungs) {
      for (const token of rung.colors) {
        if (token.name === undefined || bareName(token.name) !== wanted) continue;
        const hex = literal(token);
        if (hex) return { hex, tokenName: token.name, source: rung.source };
      }
    }
    return null;
  }

  for (const rung of rungs) {
    const byRole = rung.colors.filter((token) => token.role === 'text');
    const byName = rung.colors.filter(
      (token) => token.name !== undefined && DEFAULT_INK_NAMES.test(bareName(token.name)),
    );
    for (const token of [...byRole, ...byName, ...rung.colors]) {
      const hex = literal(token);
      if (hex) return { hex, tokenName: token.name ?? null, source: rung.source };
    }
  }
  return null;
}

// ── The last ink rung: measured, never invented ──────────────────────────────────────────

/**
 * The two candidates the fallback chooses BETWEEN. Not a brand colour and never presented as
 * one — near-black rather than pure black because #000 against a veiled photo reads as a hole
 * punched in the picture, and the two extra points of luminance cost nothing measurable.
 */
export const FALLBACK_INK_DARK: Rgb = [0x11, 0x11, 0x11];
export const FALLBACK_INK_LIGHT: Rgb = [0xff, 0xff, 0xff];

export interface DerivedInk {
  readonly rgb: Rgb;
  /** Plain-language name of the winner, for the label a user reads. */
  readonly name: 'black' | 'white';
  /** The winner's WCAG ratio against its OWN worst case. */
  readonly ratio: number;
  /** The loser, carried so a caller can report what the measurement rejected. */
  readonly alternative: { readonly name: 'black' | 'white'; readonly ratio: number };
}

/**
 * A legible ink for a brand that has none, MEASURED off the photo rather than assumed.
 *
 * This is the only rung of either chain that produces a value no brand ever wrote down, so it
 * is the one that most needs to be defensible. Hard-coding black would be defensible on a
 * bright photo and simply wrong on a dark one — the headline would be invisible, and the
 * treatment ladder would then veil a whole night scene white trying to rescue it.
 *
 * EACH CANDIDATE IS JUDGED AGAINST ITS OWN WORST CASE: dark ink against the darkest slice of
 * the box, light ink against the brightest. Comparing both against the same slice is the
 * "bright sky, dark silhouette" mistake `darkPercentileContrast` exists to prevent, and
 * measuring white against the shadows is that same mistake upside down.
 *
 * Ties go to black: it is the ink a reader expects on a piece with no brand, and on a photo
 * where both clear equally the expectation is worth more than the tiebreak.
 */
export function deriveLegibleInk(pixels: PixelBuffer, box: FractionalBox): DerivedInk {
  const dark = darkPercentileContrast(pixels, box, FALLBACK_INK_DARK).ratio;
  const light = brightPercentileContrast(pixels, box, FALLBACK_INK_LIGHT).ratio;
  return light > dark
    ? {
        rgb: FALLBACK_INK_LIGHT,
        name: 'white',
        ratio: light,
        alternative: { name: 'black', ratio: dark },
      }
    : {
        rgb: FALLBACK_INK_DARK,
        name: 'black',
        ratio: dark,
        alternative: { name: 'white', ratio: light },
      };
}

/** True when the caller reached at least one brand shape. Distinguishes "this brand has no
 *  colour" from "nothing about this brand could be read", which are different refusals. */
export const hasAnyBrandShape = (inputs: BrandTypeInputs): boolean => rungsOf(inputs).length > 0;
