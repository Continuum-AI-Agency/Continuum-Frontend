// WHICH parts of the brand design system apply to WHICH kind of canvas node.
//
// Before this, a generation node's `designSystemSections` had exactly two useful
// states: `undefined` ("the Backend resolves it from the rigor tier", which in
// practice means every section the brand left enabled) and a list the user picked by
// hand in the grounding popover. Nobody picks by hand, so in the field every node on
// every canvas carried the same blanket: a video generator was told the brand's type
// scale and its border radii, and an image generator was told its motion easing.
//
// A design system is not one undifferentiated blob. Typography does not belong on a
// video prompt — a diffusion model cannot set type, and 44px/64px/96px spends prompt
// budget that the palette and the motion rules needed. `SECTION_AUTO_APPLY` is the
// per-node-type AMBIENT default that replaces the blanket.
//
// The second half is the override. A `designRef` node names ONE section explicitly and
// wires it into a generator — as a specimen the model can look at, as a token summary,
// or both. When that happens the ambient copy of that section is redundant at best and
// contradictory at worst, so the wired section is removed from the ambient set ON THE
// TARGET NODE. Explicit beats blanket.
//
// Both rules live here, in contracts, rather than in `buildNodePayload.ts`, because the
// Frontend canvas and the headless canvas runner both assemble the same payload and a
// second copy of this map is a second answer to the same question.
//
// DATA + PURE FUNCTIONS ONLY. No React, no I/O, no storage paths.

import { z } from 'zod';
import type { DesignSystemSnapshot } from '../design-system/manifest';
import { renderDesignSystemBlock } from '../design-system/render';
import type { DesignExemplar } from '../design-system/sections';
import { type DesignSection, designSectionSchema } from '../design-system/sections';
import type { GraphEdgeLike, GraphNodeLike, StudioNodeType } from './workflow-graph';

/* -------------------------------------------------------------------------- */
/*  The contextual map                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The ambient design-system sections for one node type.
 *
 * PARTIAL on purpose. A type with no entry has no ambient set, and absence keeps its
 * existing meaning end to end: the payload sends `undefined` and the Backend resolves
 * from the rigor tier exactly as it always has. Adding a type here is a deliberate
 * statement that we know which parts of a design system that node can actually act on;
 * inventing an entry for `layerEditor` or `export` would be a guess dressed as a rule.
 *
 * Every value is checked against the closed `designSectionSchema` in the tests, so a
 * typo here is a failing test rather than a section that silently never applies.
 */
export const SECTION_AUTO_APPLY: Partial<Record<StudioNodeType, readonly DesignSection[]>> = {
  // Stills. A model rendering a picture can honour a palette, an imagery direction and
  // a logo lockup. It cannot set type, so `typography` is deliberately absent — the one
  // surface that CAN set type is hyperframesAgent, below, because it writes HTML.
  nanoGen: ['palette', 'imagery', 'logo'],
  // `omniGen` emits video but is prompted as an image editor, so it takes the still row.
  omniGen: ['palette', 'imagery', 'logo'],

  // Motion. `motion` earns its place here and nowhere else: easing curves and durations
  // are meaningless to a still and load-bearing for a clip. `logo` is out — a generated
  // clip that tries to draw a wordmark produces a smeared approximation of the brand's
  // mark, which is worse than no mark at all.
  videoGen: ['palette', 'motion', 'imagery'],
  veoDirector: ['palette', 'motion', 'imagery'],
  veoFast: ['palette', 'motion', 'imagery'],
  extendVideo: ['palette', 'motion', 'imagery'],

  // HTML. The only generator that can USE a type scale rather than approximate it, and
  // the only one that can place a real logo file, so it gets the widest row.
  hyperframesAgent: ['typography', 'palette', 'components', 'logo'],

  // Copy. Enrichment writes words; `voice` is the only section that shapes words.
  string: ['voice'],

  // A cut. The editor composes existing clips and draws titles/lower-thirds over them,
  // so type and colour apply; nothing here generates imagery.
  timelineEditor: ['typography', 'palette'],
};

/* -------------------------------------------------------------------------- */
/*  The designRef node                                                         */
/* -------------------------------------------------------------------------- */

/**
 * How much of the section a `designRef` hands downstream.
 *
 * `image` is the specimen a generator looks at, `tokens` is the same section as text
 * folded into the prompt, `both` sends each down its own port. The default is `both`
 * because the two ports carry genuinely different information and a node wired to only
 * one of them simply leaves the other unconnected.
 */
export const designRefModeSchema = z.enum(['tokens', 'image', 'both']);
export type DesignRefMode = z.infer<typeof designRefModeSchema>;

/** Where a specimen came from. The distinction is user-visible and must stay so. */
export const designRefSpecimenSourceSchema = z.enum(['exemplar', 'generated']);
export type DesignRefSpecimenSource = z.infer<typeof designRefSpecimenSourceSchema>;

/**
 * `designRef` node data.
 *
 * `section` + `mode` are the configuration — and the whole of `AGENT_FIELD_WHITELIST`
 * for this type (`workflow-projection.ts`). Everything below them is RESOLVED state the
 * node writes after it has looked the section up; an agent never authors it, which is
 * why widening this schema does not widen what an agent may set.
 */
export const designRefNodeDataSchema = z
  .object({
    section: designSectionSchema.nullable().default(null),
    mode: designRefModeSchema.default('both'),
    /** Signed URL or data URL of the specimen this node emits on its `image` port. */
    specimenUrl: z.string().optional(),
    specimenMimeType: z.string().optional(),
    /**
     * Which rung of the ladder produced `specimenUrl`.
     *
     * `exemplar` is the brand's own artifact, pixel-exact. `generated` is a model's
     * approximation of the section. The node states which, because a generated swatch
     * presented as the brand's own palette card is a lie the user cannot see through.
     */
    specimenSource: designRefSpecimenSourceSchema.nullable().default(null),
    /** media.assets id when the specimen was registered to the Library. */
    specimenAssetId: z.string().optional(),
    /** The section as prompt text, emitted on the `text` port. */
    tokenSummary: z.string().optional(),
  })
  .passthrough();
export type DesignRefNodeData = z.infer<typeof designRefNodeDataSchema>;

/** The three palette-menu presets. Same node type, seeded configuration. */
export const DESIGN_REF_PRESETS: readonly {
  readonly section: DesignSection;
  readonly mode: DesignRefMode;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    section: 'typography',
    mode: 'both',
    label: 'Typography',
    hint: 'The type scale and families, as a specimen and as text',
  },
  {
    section: 'palette',
    mode: 'both',
    label: 'Palette',
    hint: 'The brand colours, as a swatch and as hex values',
  },
  {
    section: 'logo',
    mode: 'image',
    label: 'Logo',
    hint: 'The mark itself — a picture, never a description',
  },
];

/** What a `designRef` actually hands downstream, as opposed to what it is set to. */
export interface DesignRefEmission {
  readonly section: DesignSection;
  readonly emitsImage: boolean;
  readonly emitsText: boolean;
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Read a `designRef`'s emission from its raw node data.
 *
 * Takes `unknown` because every caller holds loosely-typed canvas node data and a cast
 * at each site is how one of them ends up reading a field that is not there.
 *
 * Returns `null` for a node with no section chosen — an unconfigured `designRef` is
 * inert, exactly like an `action` with no op.
 */
export function designRefEmission(data: unknown): DesignRefEmission | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;

  const section = designSectionSchema.safeParse(record['section']);
  if (!section.success) return null;

  const mode = designRefModeSchema.safeParse(record['mode']);
  const resolvedMode: DesignRefMode = mode.success ? mode.data : 'both';

  return {
    section: section.data,
    // A mode that promises a picture but has no specimen yet emits NOTHING. This is the
    // load-bearing half: see `suppressedDesignSections` below, where a node that emits
    // nothing must not be allowed to suppress the ambient grounding it was going to
    // replace.
    emitsImage:
      (resolvedMode === 'image' || resolvedMode === 'both') && nonEmpty(record['specimenUrl']),
    emitsText:
      (resolvedMode === 'tokens' || resolvedMode === 'both') && nonEmpty(record['tokenSummary']),
  };
}

/* -------------------------------------------------------------------------- */
/*  The override rule                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Sections that arrive at `targetNodeId` through a connected `designRef`.
 *
 * Scoped to ONE node deliberately. A `designRef` wired into generator A says nothing
 * about generator B, even when B is downstream of A — B's grounding is B's own, and
 * propagating the suppression along the graph would silently strip a section from a
 * node the user never touched.
 *
 * Suppression is EARNED: a `designRef` set to `image` whose specimen has not been
 * resolved yet contributes nothing, so it suppresses nothing. Letting it suppress would
 * mean choosing a section and forgetting to generate DELETES that section's grounding —
 * a control that makes the output worse the moment you reach for it.
 */
export function suppressedDesignSections(
  targetNodeId: string,
  nodes: readonly GraphNodeLike[],
  edges: readonly GraphEdgeLike[],
): DesignSection[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const found = new Set<DesignSection>();

  for (const edge of edges) {
    if (edge.target !== targetNodeId) continue;
    const source = byId.get(edge.source);
    if (source?.type !== 'designRef') continue;
    const emission = designRefEmission(source.data);
    if (!emission) continue;
    if (emission.emitsImage || emission.emitsText) found.add(emission.section);
  }

  return [...found];
}

/**
 * The design-system sections one node's payload should carry.
 *
 * The whole rule, in one place:
 *
 * | `selected`  | type has an entry | result                                  |
 * | ----------- | ----------------- | --------------------------------------- |
 * | `undefined` | no                | `undefined` — Backend resolves by tier   |
 * | `undefined` | yes               | the entry, minus `suppressed`            |
 * | a list      | either            | that list, minus `suppressed`            |
 * | `[]`        | either            | `[]`                                     |
 *
 * `undefined` KEEPS its existing meaning end to end — that is the one semantic this
 * change must not move, because it is what every node that predates the map sends.
 *
 * Narrowing can empty the list, and an emptied list stays `[]`. Collapsing it back to
 * `undefined` would turn "everything here is supplied explicitly" into "apply the whole
 * system", which is the exact inversion the tri-state exists to prevent.
 *
 * There is one honest gap: a type with NO entry and no user selection has no ambient set
 * to narrow, so a `designRef` wired into it cannot suppress anything and the payload
 * stays `undefined`. Unreachable in practice — every node type a `designRef` can legally
 * feed a section to has an entry above — and pinned by a test so it stays that way.
 */
export function resolveAmbientDesignSections(
  nodeType: string | undefined,
  selected: readonly DesignSection[] | undefined,
  suppressed: readonly DesignSection[] = [],
): DesignSection[] | undefined {
  const ambient =
    selected ?? (nodeType ? SECTION_AUTO_APPLY[nodeType as StudioNodeType] : undefined);
  if (ambient === undefined) return undefined;
  if (suppressed.length === 0) return [...ambient];

  const drop = new Set(suppressed);
  return ambient.filter((section) => !drop.has(section));
}

/* -------------------------------------------------------------------------- */
/*  What a designRef emits                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The section's own artifact, when it has one that is actually a picture.
 *
 * Rung 1 of the emission ladder: an exemplar is the brand's real work, so emitting it
 * costs nothing and is pixel-exact where a generated specimen can only approximate.
 *
 * `mediaType` is the gate, and it matters more than it looks. Every exemplar in
 * production today is `text/html` — the design-system export ships preview CARDS, UI
 * kits and slides, which are web pages, not images. Wiring one into a reference-image
 * port would hand a diffusion model an HTML file. So this returns `null` for all of
 * them and the caller falls to rung 2, which is the honest outcome rather than a
 * mimeType lie. Image exemplars arrive with `kind: 'asset'` exports and DTCG bundles.
 *
 * The upgrade path for the HTML ones is a HyperFrames render through
 * `client_render_jobs` — font-exact, and out of scope here.
 */
export function pickSectionExemplar(
  snapshot: DesignSystemSnapshot | null | undefined,
  section: DesignSection,
): DesignExemplar | null {
  if (!snapshot) return null;
  const card = snapshot.sections.find((entry) => entry.section === section);
  if (!card) return null;

  const images = card.exemplars.filter((exemplar) =>
    exemplar.mediaType.toLowerCase().startsWith('image/'),
  );
  if (images.length === 0) return null;

  // A preview card is authored to SHOW the section; a loose asset merely belongs to it.
  return images.find((exemplar) => exemplar.kind === 'preview_card') ?? images[0] ?? null;
}

/**
 * The section as prompt text — the `text` port's payload.
 *
 * Delegates to `renderDesignSystemBlock` with a one-section selection rather than
 * formatting a second time: that function already decides how a rule reads next to a
 * token list, and the Backend renders the AMBIENT sections through it. Two formatters
 * would mean a wired palette and an ambient palette reaching the same model in two
 * different shapes.
 *
 * Returns "" when the section is empty or switched off, which `designRefEmission` then
 * reads as "emits no text".
 */
export function designSectionTokenSummary(
  snapshot: DesignSystemSnapshot | null | undefined,
  section: DesignSection,
): string {
  if (!snapshot) return '';
  return renderDesignSystemBlock(snapshot, [section]).block;
}

/**
 * The prompt that generates a specimen for a section with no image exemplar.
 *
 * Rung 2. Deliberately asks for a reference PLATE — a flat, labelled specimen — rather
 * than a styled composition: the image exists to be looked at by another generator, and
 * a moody hero shot "in the brand palette" teaches that generator far less than a row
 * of swatches with their hex values on them.
 */
export function designRefSpecimenPrompt(
  snapshot: DesignSystemSnapshot | null | undefined,
  section: DesignSection,
): string {
  const summary = designSectionTokenSummary(snapshot, section);
  const subject = SPECIMEN_SUBJECTS[section];
  const plate = `A flat design-system reference plate on a plain neutral background: ${subject}. No people, no scenery, no product photography — this is a specification sheet, not a composition.`;
  return summary ? `${plate}\n\n${summary}` : plate;
}

const SPECIMEN_SUBJECTS: Record<DesignSection, string> = {
  palette: 'a row of colour swatches, each labelled with its hex value',
  typography: 'a type specimen showing each family and size in the scale, labelled',
  spacing: 'a spacing scale shown as labelled stacked bars',
  radii: 'a row of squares showing each corner radius in the scale, labelled',
  shadows: 'a row of cards, each showing one elevation level, labelled',
  layout: 'a grid diagram showing the column structure and gutters',
  components: 'a component sheet — buttons, inputs and cards in their default states',
  iconography: 'an icon sheet showing the stroke weight and corner treatment',
  motion: 'an easing diagram — labelled curves and their durations as a filmstrip',
  voice: 'a card showing the brand voice as short labelled example phrases',
  imagery: 'a contact sheet of images in the brand art direction',
  logo: 'the brand mark shown alone, at rest, with its clear space marked',
};
