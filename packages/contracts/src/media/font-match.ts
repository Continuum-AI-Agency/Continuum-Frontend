// What a PostScript name spells, and which face we already hold could stand in for it.
//
// Two jobs, one file, because they share the same split and must not drift apart:
//
//   1. `faceOf` — `Poppins-ExtraBoldItalic` → Poppins, 800, italic. Lifted out of the Backend's
//      `fontHeal.ts` (where it was `googleFaceOf`) because the substitution ranker needs exactly
//      the same reading, and two copies of a name parser is how one of them ends up wrong.
//   2. `rankFontCandidates` — the ranked answer to "we do not hold Arial-BoldMT; what DO we hold
//      that a person would accept?".
//
// The foundry suffix is the reason this exists as its own file. `ArialMT` and `Arial-BoldMT` are
// what After Effects reports for plain Arial, and the original split read `BoldMT` as a style
// word it did not recognise and gave up — so a template asking for Arial offered no way forward
// at all: not held, not on Google Fonts, no candidate. Stripping `MT`/`PS`/`Std`/`Pro`/`LT` turns
// both names back into the family and weight a person would say out loud.

import { normalizeTemplateFontFamily } from './template-source';

/** A face as a name spells it. `weight` follows the CSS numeric scale. */
export interface ParsedFace {
  family: string;
  weight: number;
  italic: boolean;
}

const WEIGHTS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(thin|hairline)$/, 100],
  [/^(extralight|ultralight)$/, 200],
  [/^light$/, 300],
  [/^(regular|normal|book|)$/, 400],
  [/^medium$/, 500],
  [/^(semibold|demibold)$/, 600],
  [/^bold$/, 700],
  [/^(extrabold|ultrabold)$/, 800],
  [/^(black|heavy)$/, 900],
];

/**
 * Foundry and format markers that name a CUT, never a typeface: `ArialMT`, `TimesNewRomanPSMT`,
 * `HelveticaNeueLTStd`. Stripped from both ends of the split so the family and the weight read
 * the way a person says them.
 */
const FOUNDRY_SUFFIX = /(MT|PS|Std|Pro|LT)$/;

/** Peel every trailing foundry marker, while something recognisable is left underneath. */
function stripFoundry(value: string): string {
  let out = value;
  // `TimesNewRomanPSMT` carries two. Bounded by the fact that each pass must shorten the string.
  while (FOUNDRY_SUFFIX.test(out)) {
    const next = out.replace(FOUNDRY_SUFFIX, '');
    // A name that IS its marker (`MT`) is a family called MT, not an empty one.
    if (next.length < 3) break;
    out = next;
  }
  return out;
}

/**
 * The family, weight and slant a PostScript name spells, or null when its style word is not one
 * we can read (`Condensed`, `36CompBold`) — never a guess.
 *
 * `PlusJakartaSans-ExtraBoldItalic` → Plus Jakarta Sans, 800, italic.
 * `Arial-BoldMT` → Arial, 700. `ArialMT` → Arial, 400.
 */
export function faceOf(postScriptName: string): ParsedFace | null {
  const dash = postScriptName.lastIndexOf('-');
  const styleWord = dash === -1 ? '' : stripFoundry(postScriptName.slice(dash + 1));
  const italic = /italic$/i.test(styleWord);
  const weightWord = styleWord.replace(/italic$/i, '').toLowerCase();
  const weight = WEIGHTS.find(([pattern]) => pattern.test(weightWord))?.[1];
  const family = familyOf(postScriptName);
  return weight && family ? { family, weight, italic } : null;
}

/**
 * The typeface a name is FOR, whether or not its cut can be read.
 *
 * Separate from `faceOf` because `HeadingNow-36CompBold` has an unreadable cut and a perfectly
 * readable family: refusing to name the family too would leave the one template that most needs
 * a substitute with no candidates at all.
 */
export function familyOf(postScriptName: string): string {
  const dash = postScriptName.lastIndexOf('-');
  return stripFoundry(dash === -1 ? postScriptName : postScriptName.slice(0, dash))
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim();
}

/** A face the repository holds, as much of it as the ranker needs. */
export interface FontCandidate {
  fontId: string;
  family: string;
  postScriptName?: string | null;
  weight?: number | null;
  style?: string | null;
  scope?: 'brand' | 'house';
}

export interface RankedFontCandidate extends FontCandidate {
  /** 90 same typeface and cut · 60 same typeface, different cut · 10 same cut, different typeface. */
  score: number;
  /** Why it is offered, in the words the chip shows. */
  why: string;
}

/** Same typeface, same cut — a naming difference, not a design decision. */
const SCORE_SAME_CUT = 90;
/** Same typeface, a different cut — someone must accept the weight change. */
const SCORE_SAME_FAMILY = 60;
/** A different typeface at the same weight — a real replacement, offered last. */
const SCORE_SAME_WEIGHT = 10;

/** What a stored face calls itself, preferring its own columns over re-reading its name. */
function candidateFace(candidate: FontCandidate): ParsedFace {
  const parsed = candidate.postScriptName ? faceOf(candidate.postScriptName) : null;
  return {
    family: familyOf(candidate.family.replace(/\s+/g, '')) || candidate.family,
    weight: candidate.weight ?? parsed?.weight ?? 400,
    italic: candidate.style ? candidate.style === 'italic' : (parsed?.italic ?? false),
  };
}

const WEIGHT_LABELS: Readonly<Record<number, string>> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

const cutName = (face: ParsedFace): string => {
  const label = WEIGHT_LABELS[face.weight] ?? String(face.weight);
  return face.italic ? `${label} Italic` : label;
};

/**
 * What we hold that could stand in for a face we do not, best first.
 *
 * Deliberately coarse and entirely rule-based: three bands, no learning, no edit distance. The
 * ranker only has to put the obvious answer first — a person confirms every one of these, and a
 * near-miss ranked second costs a glance, while a clever score nobody can explain costs trust.
 */
export function rankFontCandidates(
  requested: string,
  have: readonly FontCandidate[],
): RankedFontCandidate[] {
  const asked = faceOf(requested);
  const askedKey = normalizeTemplateFontFamily(familyOf(requested));

  const ranked = have.flatMap((candidate): RankedFontCandidate[] => {
    const face = candidateFace(candidate);
    const sameFamily = normalizeTemplateFontFamily(face.family) === askedKey;
    const sameCut = asked ? face.weight === asked.weight && face.italic === asked.italic : false;

    if (sameFamily && sameCut)
      return [{ ...candidate, score: SCORE_SAME_CUT, why: 'Same typeface and weight' }];
    if (sameFamily)
      return [{ ...candidate, score: SCORE_SAME_FAMILY, why: `Same typeface, ${cutName(face)}` }];
    if (sameCut)
      return [
        { ...candidate, score: SCORE_SAME_WEIGHT, why: `Different typeface, ${cutName(face)}` },
      ];
    return [];
  });

  // Score first, then family, so a tie is ordered the same way on every call — the UI's
  // "confident only when nothing ties it" rule depends on the order being stable, not on luck.
  return ranked.sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));
}

/**
 * The candidate to pre-select, or undefined when nobody should be nudged.
 *
 * Only an unambiguous same-cut match. A tie at the top is not an answer — two faces that both
 * claim to be Arial Bold is exactly when a person needs to look, and the 2026-09-15 incident is
 * what silently picking one costs.
 */
export function confidentFontCandidate(
  ranked: readonly RankedFontCandidate[],
): RankedFontCandidate | undefined {
  const [top, second] = ranked;
  if (!top || top.score < SCORE_SAME_CUT) return undefined;
  return !second || second.score < top.score ? top : undefined;
}
