// Turning a stored design system into the five things a brand can actually be held to.
//
// The existing settings surface renders a design system as CARDS OF PROSE — a title, a
// provenance badge, and the brand's own sentences. That is the right shape for editing
// and the wrong shape for answering "what will the engine actually do". These
// derivations answer the second question, and every one of them is a projection of a
// row we already store: nothing here invents a number, and where a number is missing
// the derivation says so rather than filling it in.
//
// PURE. No React, no fetch, no storage — the panels render what this returns, so the
// hard part is unit-testable without a browser and the components stay layout.
//
// Two rules run through all five:
//
//   1. EVERY VALUE CARRIES WHERE IT CAME FROM. A measured curve is labelled `measured`,
//      a token's provenance is its `definedIn` file, and a fact with no provenance is
//      shown as a GAP rather than quietly rendered as if it had one.
//   2. AN EMPTY STATE IS AN INSTRUCTION. `absent` is never "" and never a blank region:
//      it is the sentence that tells the reader what to do to make the panel non-empty.

import {
  DESIGN_SECTION_LABELS,
  type DesignAdherence,
  type DesignSection,
  type DesignSystemFontFace,
  type DesignSystemSnapshot,
  type DesignToken,
  designFormatsContentSchema,
  effectiveRigorTier,
  isGateableSection,
  literalHexTokens,
  NOT_MEASURABLE_MARKERS,
  notMeasurableReason,
  projectSectionsToBrandTokens,
  readDesignCurve,
} from '@continuum/contracts';

/** `label — note — value`. The note is what tells the reader what the number MEANS. */
export interface SpecRow {
  label: string;
  note: string | null;
  value: string;
}

// Three decimals: enough to reproduce a measurement, few enough to compare in a column.
const ratio = (value: number): string => value.toFixed(3);
const percent = (fraction: number): string => `${(fraction * 100).toFixed(1)} %`;

const humanize = (key: string): string => {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

const sectionNamed = (snapshot: DesignSystemSnapshot, section: DesignSection) =>
  snapshot.sections.find((candidate) => candidate.section === section) ?? null;

/* ── 1. Layout spec ─────────────────────────────────────────────────────────── */

export interface LayoutSpec {
  /** The instruction to render INSTEAD of rows. Null when there is geometry to show. */
  absent: string | null;
  /** The denominator every fraction below is a fraction of. */
  baseWidth: number | null;
  rows: SpecRow[];
}

const NO_FORMATS =
  'No format geometry recorded. This panel reads the ratios a brand measured off its own ' +
  'finished adaptations — the numbers that survive every canvas, which a pixel never does. ' +
  'Import a design system that declares a Formats group, or add one on the Formats card above.';

/**
 * The brand's layout spec, as ratios and percentages only.
 *
 * A format's own width/height is the one pixel pair in the whole panel, and it rides in
 * the NOTE rather than the value — because it is the thing every other number is measured
 * against, not a number to compare down a column. Everything in a `value` is a ratio, a
 * percentage, or the word `none`.
 */
export function deriveLayoutSpec(snapshot: DesignSystemSnapshot): LayoutSpec {
  const section = sectionNamed(snapshot, 'formats');
  if (!section) return { absent: NO_FORMATS, baseWidth: null, rows: [] };

  const parsed = designFormatsContentSchema.safeParse(section.content);
  if (!parsed.success) {
    return {
      absent:
        `The Formats card carries content this build cannot read — ${parsed.error.issues[0]?.message ?? 'invalid shape'}. ` +
        'Re-import the design system, or correct the card above.',
      baseWidth: null,
      rows: [],
    };
  }

  const { baseWidth, formats, curves } = parsed.data;
  const rows: SpecRow[] = [];

  for (const format of formats) {
    rows.push({
      label: format.id,
      note: `${format.width} x ${format.height} — a format's own dimensions are the only pixels in this spec`,
      value: `${ratio(format.width / format.height)} : 1`,
    });
    rows.push(
      format.safeZone === null
        ? {
            label: `${format.id} · safe zone`,
            note: 'a stated decision, not a missing measurement — this format puts no text over imagery',
            value: 'none',
          }
        : {
            label: `${format.id} · safe zone`,
            note: 'where a headline may sit, as fractions of the frame — the same box the legibility gate measures',
            value:
              `x ${percent(format.safeZone.x0)} – ${percent(format.safeZone.x1)} · ` +
              `y ${percent(format.safeZone.y0)} – ${percent(format.safeZone.y1)}`,
          },
    );
  }

  const first = formats[0] ?? null;
  for (const [name, curve] of Object.entries(curves)) {
    const values = curve.points.map(([, y]) => y);
    const aspects = curve.points.map(([x]) => x);
    const readAt = first === null ? null : readDesignCurve(curve, first.width / first.height);
    rows.push({
      label: humanize(name),
      note:
        `measured on ${curve.points.length} real pieces across aspects ` +
        `${ratio(Math.min(...aspects))}–${ratio(Math.max(...aspects))}; read between them, and ` +
        'held at the endpoint outside that range rather than extrapolated' +
        (first && readAt !== null
          ? ` — at ${first.id} it reads ${curve.unit === 'fraction' ? percent(readAt) : ratio(readAt)}`
          : ''),
      value:
        curve.unit === 'fraction'
          ? `measured ${percent(Math.min(...values))} – ${percent(Math.max(...values))} of the base width`
          : `measured ${ratio(Math.min(...values))} – ${ratio(Math.max(...values))}`,
    });
  }

  return { absent: null, baseWidth, rows };
}

/* ── 2. Typography as a capability inventory ────────────────────────────────── */

export interface TypeFaceRow {
  family: string;
  weight: number;
  /** The tokens that point at this family, or why we cannot name one. */
  usedFor: string;
  /** True when the store holds a file for exactly this family and weight. */
  present: boolean;
  /** `woff2 · 24.1 kB` for a held face; the reason it is absent otherwise. */
  detail: string;
}

export interface TypeInventory {
  rows: TypeFaceRow[];
  /** True when the Backend never reported the store — NOT the same as "no fonts". */
  storeUnknown: boolean;
  absent: string | null;
}

// `@font-face` with no `font-weight` resolves at 400; a row has to stand somewhere.
const DEFAULT_WEIGHT = 400;
const MAX_FAMILIES = 12;
const MAX_WEIGHTS_PER_FAMILY = 6;

// `--w-bold: 700`, `--font-weight-medium: 500`. A weight the SYSTEM declared, not a guess.
const WEIGHT_TOKEN_NAME = /^--?(?:w|fw|weight|font-weight)(?:-|$)/i;

function declaredWeights(tokens: readonly DesignToken[]): number[] {
  const found = new Set<number>();
  for (const token of tokens) {
    if (!WEIGHT_TOKEN_NAME.test(token.name)) continue;
    const weight = Number.parseInt((token.resolvedValue ?? token.value).trim(), 10);
    if (Number.isInteger(weight) && weight >= 1 && weight <= 1000) found.add(weight);
  }
  return [...found].sort((left, right) => left - right);
}

const sameFamily = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

const kilobytes = (bytes: number): string => `${(bytes / 1024).toFixed(1)} kB`;

/**
 * One row per family per weight, and a badge that answers a question a specimen cannot.
 *
 * There is deliberately no specimen here. A brand's faces are almost always commercially
 * licensed, and when the engine does not hold one the only specimen we COULD render is a
 * substitute — which teaches the reader that their type looks like Georgia. The honest
 * output is the badge, and the badge is a fact about the store, not about the document.
 */
export function deriveTypeInventory(
  snapshot: DesignSystemSnapshot,
  facesInStore: readonly DesignSystemFontFace[] | null,
): TypeInventory {
  const faces = facesInStore ?? [];
  const storeUnknown = facesInStore === null;
  const systemWeights = declaredWeights(snapshot.tokens);

  const families: { family: string; usedFor: string }[] = snapshot.fonts
    .slice(0, MAX_FAMILIES)
    .map((font) => ({
      family: font.family,
      usedFor:
        font.tokens.length > 0
          ? font.tokens.join(', ')
          : snapshot.adherence.fontAllowlist.some((allowed) => sameFamily(allowed, font.family))
            ? "on the system's font allowlist"
            : 'declared, with no token pointing at it',
    }));

  // A face the store holds that the system never declared is still a real capability —
  // and its absence from the document is the interesting part, so it gets a row.
  for (const face of faces) {
    if (families.length >= MAX_FAMILIES) break;
    if (families.some((entry) => sameFamily(entry.family, face.family))) continue;
    families.push({
      family: face.family,
      usedFor: 'held by the engine, and not declared by this design system',
    });
  }

  if (families.length === 0) {
    return {
      rows: [],
      storeUnknown,
      absent:
        'No typeface declared and none held. Import a design system that names its families, ' +
        'then upload the font files so the engine can set type in them rather than approximate them.',
    };
  }

  const rows: TypeFaceRow[] = [];
  for (const entry of families) {
    const stored = faces.filter((face) => sameFamily(face.family, entry.family));
    const weights = [
      ...new Set([...systemWeights, ...stored.map((face) => face.weight ?? DEFAULT_WEIGHT)]),
    ].sort((left, right) => left - right);
    const shown = (weights.length > 0 ? weights : [DEFAULT_WEIGHT]).slice(
      0,
      MAX_WEIGHTS_PER_FAMILY,
    );

    for (const weight of shown) {
      const face = stored.find((candidate) => (candidate.weight ?? DEFAULT_WEIGHT) === weight);
      rows.push({
        family: entry.family,
        weight,
        usedFor: entry.usedFor,
        present: face !== undefined,
        detail: face
          ? `${face.format} · ${kilobytes(face.bytes)}`
          : storeUnknown
            ? 'the engine could not be asked'
            : 'no file in the store',
      });
    }
  }

  return { rows, storeUnknown, absent: null };
}

/* ── 3. Colour, twice ───────────────────────────────────────────────────────── */

export interface ColourRow {
  name: string;
  hex: string;
  /** The rule this colour carries, or the instruction for recording one. */
  usage: string;
  /** False when `usage` is the instruction rather than a recorded rule. */
  recorded: boolean;
}

const NO_USAGE =
  'No usage recorded. Write the sentence on the Palette card above — the engine states only ' +
  'what you record, and an unstated role is one the model will invent.';

/**
 * The same colours twice: a strip for recognition, a table for the rule.
 *
 * The strip alone is a mood board. The rule — "the headline is ALWAYS this colour" — is the
 * part a generator can be held to, and it gets its own right-aligned column so a reader can
 * scan the rules without reading the hexes.
 */
export function deriveColourUsage(snapshot: DesignSystemSnapshot): ColourRow[] {
  const tokens = literalHexTokens(snapshot.tokens).slice(0, 24);
  const paletteRules = sectionNamed(snapshot, 'palette')?.rules ?? [];
  const roleByName = new Map(
    projectSectionsToBrandTokens({
      brandName: snapshot.brandName,
      tokens: snapshot.tokens,
      fontFamilies: [],
    }).colors.map((colour) => [colour.name, colour.role]),
  );

  return tokens.map((token) => {
    const hex = (token.resolvedValue ?? token.value).toLowerCase();
    const matched = paletteRules.find(
      (rule) =>
        rule.value?.toLowerCase() === hex ||
        rule.target?.endsWith(token.name) ||
        rule.statement.includes(token.name) ||
        rule.statement.toLowerCase().includes(hex),
    );
    const role = roleByName.get(token.name);

    if (token.description)
      return { name: token.name, hex, usage: token.description, recorded: true };
    if (matched) return { name: token.name, hex, usage: matched.statement, recorded: true };
    if (role) {
      return {
        name: token.name,
        hex,
        usage: `Carries the ${role} role wherever the engine narrows this system to five colours.`,
        recorded: true,
      };
    }
    return { name: token.name, hex, usage: NO_USAGE, recorded: false };
  });
}

/* ── 4. Facts that cannot be invented ───────────────────────────────────────── */

export interface FactRow {
  fact: string;
  /** Where it came from, or null — which is rendered as a GAP, never as a blank. */
  provenance: string | null;
}

export interface BrandFacts {
  rows: FactRow[];
  /** How many rows carry no provenance at all. The number worth acting on. */
  withoutProvenance: number;
}

const MAX_FACTS = 40;

const PROVENANCE_LABEL: Record<string, string> = {
  declared: 'declared in the source',
  inferred: 'read from prose',
  scraped: 'harvested from the live site',
  edited: 'edited by your team',
};

/**
 * The allowlist of brand facts, rendered as UI so a human can audit it.
 *
 * Every row is a literal an agent is permitted to state — the values that reach a prompt
 * through `renderDesignSystemBlock` and a stylesheet through
 * `renderDesignSystemStylesheet`. A fact with no provenance is the interesting one: it is a
 * value we will hand a model with nothing behind it, and hiding that would make the panel
 * an assurance rather than an audit.
 */
export function deriveBrandFacts(snapshot: DesignSystemSnapshot): BrandFacts {
  const rows: FactRow[] = [
    { fact: `The brand is called ${snapshot.brandName}.`, provenance: 'the brand record' },
  ];

  for (const token of literalHexTokens(snapshot.tokens).slice(0, 16)) {
    rows.push({
      fact: `${token.name} is ${(token.resolvedValue ?? token.value).toLowerCase()}.`,
      provenance: token.definedIn,
    });
  }

  for (const font of snapshot.fonts.slice(0, 8)) {
    rows.push({
      fact: `${font.family} is a typeface of this system.`,
      provenance:
        font.source ?? (font.tokens.length > 0 ? `declared by ${font.tokens.join(', ')}` : null),
    });
  }

  const formats = sectionNamed(snapshot, 'formats');
  const parsedFormats = formats ? designFormatsContentSchema.safeParse(formats.content) : null;
  if (formats && parsedFormats?.success) {
    for (const format of parsedFormats.data.formats.slice(0, 8)) {
      rows.push({
        fact: `${format.id} ships at ${format.width} x ${format.height}.`,
        provenance: `Formats card · ${PROVENANCE_LABEL[formats.provenance] ?? formats.provenance}`,
      });
    }
  }

  if (snapshot.adherence.fontAllowlist.length > 0) {
    rows.push({
      fact: `No family outside ${snapshot.adherence.fontAllowlist.join(', ')} belongs to this system.`,
      provenance: "the system's own adherence config",
    });
  }

  for (const section of snapshot.sections) {
    for (const rule of section.rules) {
      if (rule.strength !== 'hard' || rule.value === null) continue;
      rows.push({ fact: rule.statement, provenance: rule.sourceRef });
    }
  }

  const capped = rows.slice(0, MAX_FACTS);
  return {
    rows: capped,
    withoutProvenance: capped.filter((row) => row.provenance === null).length,
  };
}

/* ── 5. Rules, by measurement ───────────────────────────────────────────────── */

export interface MeasuredRuleRow {
  section: DesignSection;
  sectionLabel: string;
  statement: string;
  /** How it is checked on the rendered piece. A rule without one is not on this list. */
  measurement: string;
  severity: 'blocking' | 'warning';
  /** True when we READ this rule rather than the brand declaring it. */
  learned: boolean;
  /** The checker that actually runs it, or null for stored-and-inert. */
  enforcedBy: string | null;
}

export interface PendingRuleRow {
  reported: string;
  whyNotMeasurable: string;
}

export interface RuleLedger {
  rules: MeasuredRuleRow[];
  pending: PendingRuleRow[];
  absent: string | null;
}

/**
 * The one checker in this codebase that runs a design system against a rendered piece.
 *
 * `lintAgainstAdherence` is reached from exactly one place — the HyperFrames agent's
 * `lint_composition` tool — and only when an adherence config is supplied. Naming it per
 * rule is the difference between "we enforce your palette" and the truth, which is "we
 * enforce your palette on the one surface that authors HTML, if you told us to". Nothing
 * else here is enforced, and the panel says so rather than implying otherwise.
 */
function checkerFor(section: DesignSection, adherence: DesignAdherence): string | null {
  const lint = 'HyperFrames lint_composition → lintAgainstAdherence';
  if (section === 'palette' && adherence.forbidRawHex) return `${lint} (raw-hex)`;
  if (section === 'typography' && adherence.fontAllowlist.length > 0)
    return `${lint} (font-not-allowed)`;
  if (section === 'radii' && adherence.forbidRawPx) return `${lint} (raw-px)`;
  return null;
}

function measurementFor(
  rule: { target: string | null; value: string | null },
  section: DesignSection,
): string | null {
  if (!isGateableSection(section)) return null;
  if (rule.target && rule.value)
    return `compiler field ${rule.target} reads ${rule.value} on the rendered piece`;
  if (rule.target)
    return `compiler field ${rule.target} is read off every render and compared with this system`;
  if (rule.value) return `the rendered piece uses ${rule.value} literally`;
  return null;
}

/**
 * Split every stored rule by whether anything can MEASURE it.
 *
 * The split is the contract's own: a complaint with no measurement is not a rule, it is a
 * pending row that says why. The marker convention is `notMeasurableReason`'s, used here
 * rather than restated, so a reason this panel shows and a reason the rule bank would
 * refuse cannot drift apart.
 */
export function deriveRuleLedger(snapshot: DesignSystemSnapshot): RuleLedger {
  const gating = effectiveRigorTier(snapshot) === 'strict';
  const rules: MeasuredRuleRow[] = [];
  const pending: PendingRuleRow[] = [];

  for (const section of snapshot.sections) {
    const label = DESIGN_SECTION_LABELS[section.section] ?? section.section;
    for (const rule of section.rules) {
      const measurement = measurementFor(rule, section.section);
      if (measurement === null) {
        const admission = isGateableSection(section.section)
          ? `${NOT_MEASURABLE_MARKERS[0]}: no compiler field and no literal is attached, so there is nothing on the render to compare it against`
          : `${NOT_MEASURABLE_MARKERS[0]}: ${label} is not observable on a rendered pixel — this section can only shape the prompt`;
        pending.push({
          reported: rule.statement,
          whyNotMeasurable: notMeasurableReason(admission) ?? admission,
        });
        continue;
      }
      rules.push({
        section: section.section,
        sectionLabel: label,
        statement: rule.statement,
        measurement,
        severity: rule.strength === 'hard' && gating ? 'blocking' : 'warning',
        learned: section.provenance === 'inferred' || section.provenance === 'scraped',
        enforcedBy: checkerFor(section.section, snapshot.adherence),
      });
    }
  }

  return {
    rules,
    pending,
    absent:
      rules.length === 0 && pending.length === 0
        ? 'No rules recorded on any card. A rule is what a palette cannot express — "radii ' +
          'small or zero, editorial means straight" — and it is the part of a design system a ' +
          'generator can actually be held to. Add one on any card above.'
        : null,
  };
}
