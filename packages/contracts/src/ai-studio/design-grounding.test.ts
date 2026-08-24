// The contextual grounding rules, pinned.
//
// Two things are worth stating about WHY these particular assertions exist.
//
// First, `undefined` and `[]` mean opposite things on `designSystemSections` —
// "the Backend resolves it from the rigor tier" versus "the user switched the design
// system off" — and this file is the last place that distinction is cheap to defend.
// The same mistake on `velocityCapped` blanked fourteen of fourteen optimizer
// decisions, and on `brandDirectionPieces` it made a whole control decorative.
//
// Second, suppression has to be EARNED. A `designRef` that emits nothing must not
// remove the ambient grounding it was supposed to replace, or the feature makes output
// worse the moment somebody reaches for it.

import { describe, expect, it } from 'bun:test';
import type { DesignSystemSnapshot } from '../design-system/manifest';
import { type DesignSection, designSectionSchema } from '../design-system/sections';
import {
  DESIGN_REF_PRESETS,
  designRefEmission,
  designRefSpecimenPrompt,
  designSectionTokenSummary,
  pickSectionExemplar,
  resolveAmbientDesignSections,
  SECTION_AUTO_APPLY,
  suppressedDesignSections,
} from './design-grounding';
import { isStudioNodeType } from './workflow-graph';

/* -------------------------------------------------------------------------- */
/*  The map is valid on both axes                                              */
/* -------------------------------------------------------------------------- */

describe('SECTION_AUTO_APPLY', () => {
  it('keys only real node types', () => {
    for (const key of Object.keys(SECTION_AUTO_APPLY)) {
      expect(isStudioNodeType(key)).toBe(true);
    }
  });

  it('names only real sections — every value parses through the closed enum', () => {
    for (const [key, sections] of Object.entries(SECTION_AUTO_APPLY)) {
      expect(sections).toBeDefined();
      for (const section of sections ?? []) {
        const parsed = designSectionSchema.safeParse(section);
        expect(`${key}:${section}:${parsed.success}`).toBe(`${key}:${section}:true`);
      }
    }
  });

  it('lists no section twice within one node type', () => {
    for (const [key, sections] of Object.entries(SECTION_AUTO_APPLY)) {
      const list = sections ?? [];
      expect(`${key}:${new Set(list).size}`).toBe(`${key}:${list.length}`);
    }
  });

  // The point of the whole feature, stated as an assertion rather than a comment: a
  // diffusion model cannot set type, so a type scale on a video prompt is spent budget.
  it('keeps typography off the generators that cannot set type', () => {
    expect(SECTION_AUTO_APPLY.nanoGen).not.toContain('typography');
    expect(SECTION_AUTO_APPLY.videoGen).not.toContain('typography');
    expect(SECTION_AUTO_APPLY.veoDirector).not.toContain('typography');
    // HyperFrames writes HTML, so it is the one surface that CAN.
    expect(SECTION_AUTO_APPLY.hyperframesAgent).toContain('typography');
  });

  it('keeps motion on clips and off stills', () => {
    expect(SECTION_AUTO_APPLY.videoGen).toContain('motion');
    expect(SECTION_AUTO_APPLY.extendVideo).toContain('motion');
    expect(SECTION_AUTO_APPLY.nanoGen).not.toContain('motion');
  });

  it('gives enrichment voice and nothing visual', () => {
    expect(SECTION_AUTO_APPLY.string).toEqual(['voice']);
  });

  it('leaves types with nothing to say out of the map entirely', () => {
    // Absence is the load-bearing state — see the `undefined` row of the truth table.
    expect(SECTION_AUTO_APPLY.layerEditor).toBeUndefined();
    expect(SECTION_AUTO_APPLY.export).toBeUndefined();
    expect(SECTION_AUTO_APPLY.image).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  The resolver truth table                                                   */
/* -------------------------------------------------------------------------- */

describe('resolveAmbientDesignSections', () => {
  it('leaves a type with no entry and no selection UNDEFINED — the tier still decides', () => {
    expect(resolveAmbientDesignSections('layerEditor', undefined)).toBeUndefined();
  });

  it('narrows an unselected node to its node type row', () => {
    expect(resolveAmbientDesignSections('nanoGen', undefined)).toEqual([
      'palette',
      'imagery',
      'logo',
    ]);
    expect(resolveAmbientDesignSections('videoGen', undefined)).toEqual([
      'palette',
      'motion',
      'imagery',
    ]);
  });

  it('never hands back the map itself — a caller mutating the result cannot poison it', () => {
    const resolved = resolveAmbientDesignSections('nanoGen', undefined);
    expect(resolved).not.toBe(SECTION_AUTO_APPLY.nanoGen);
    resolved?.push('shadows');
    expect(SECTION_AUTO_APPLY.nanoGen).toEqual(['palette', 'imagery', 'logo']);
  });

  it("keeps the user's explicit list, entry or no entry", () => {
    expect(resolveAmbientDesignSections('nanoGen', ['shadows', 'radii'])).toEqual([
      'shadows',
      'radii',
    ]);
    expect(resolveAmbientDesignSections('layerEditor', ['palette'])).toEqual(['palette']);
  });

  it('keeps an empty selection EMPTY — off must never become all', () => {
    // `toBeUndefined()` here would mean the user switched the design system off for this
    // node and the Backend applied every section the brand has.
    expect(resolveAmbientDesignSections('nanoGen', [])).toEqual([]);
    expect(resolveAmbientDesignSections('layerEditor', [])).toEqual([]);
  });

  it('subtracts a wired section from the ambient default', () => {
    expect(resolveAmbientDesignSections('nanoGen', undefined, ['palette'])).toEqual([
      'imagery',
      'logo',
    ]);
  });

  it('subtracts a wired section from an explicit selection too', () => {
    expect(resolveAmbientDesignSections('nanoGen', ['palette', 'shadows'], ['palette'])).toEqual([
      'shadows',
    ]);
  });

  it('leaves [] behind when suppression empties the list, NOT undefined', () => {
    // The inversion this whole tri-state exists to prevent: everything is supplied
    // explicitly by wired designRefs, so the ambient set is empty — not "apply it all".
    const resolved = resolveAmbientDesignSections('nanoGen', undefined, [
      'palette',
      'imagery',
      'logo',
    ]);
    expect(resolved).toEqual([]);
    expect(resolved).not.toBeUndefined();
  });

  it('ignores a suppressed section the node never had', () => {
    expect(resolveAmbientDesignSections('nanoGen', undefined, ['motion'])).toEqual([
      'palette',
      'imagery',
      'logo',
    ]);
  });

  // The documented gap, pinned so it stays a gap rather than becoming a surprise: an
  // unknown ambient set cannot be narrowed.
  it('cannot narrow what it cannot enumerate — no entry stays undefined even when wired', () => {
    expect(resolveAmbientDesignSections('layerEditor', undefined, ['palette'])).toBeUndefined();
  });

  it('treats an unknown node type as having no entry', () => {
    expect(resolveAmbientDesignSections('someFutureNode', undefined)).toBeUndefined();
    expect(resolveAmbientDesignSections(undefined, undefined)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  Emission                                                                   */
/* -------------------------------------------------------------------------- */

describe('designRefEmission', () => {
  it('is null until a section is chosen', () => {
    expect(designRefEmission({ section: null, mode: 'both' })).toBeNull();
    expect(designRefEmission({})).toBeNull();
    expect(designRefEmission(undefined)).toBeNull();
    expect(designRefEmission({ section: 'not-a-section' })).toBeNull();
  });

  it('emits both ports when both are resolved', () => {
    expect(
      designRefEmission({
        section: 'palette',
        mode: 'both',
        specimenUrl: 'https://example.test/swatch.png',
        tokenSummary: '<design_system>…</design_system>',
      }),
    ).toEqual({ section: 'palette', emitsImage: true, emitsText: true });
  });

  it('honours the mode — tokens-only emits no image even with a specimen resolved', () => {
    expect(
      designRefEmission({
        section: 'palette',
        mode: 'tokens',
        specimenUrl: 'https://example.test/swatch.png',
        tokenSummary: 'summary',
      }),
    ).toEqual({ section: 'palette', emitsImage: false, emitsText: true });
  });

  it('honours the mode — image-only emits no text even with a summary resolved', () => {
    expect(
      designRefEmission({
        section: 'logo',
        mode: 'image',
        specimenUrl: 'https://example.test/mark.png',
        tokenSummary: 'summary',
      }),
    ).toEqual({ section: 'logo', emitsImage: true, emitsText: false });
  });

  it('emits NOTHING from an image-mode node whose specimen has not resolved', () => {
    // The case suppression turns on. Blank and whitespace both count as absent.
    expect(designRefEmission({ section: 'palette', mode: 'image' })).toEqual({
      section: 'palette',
      emitsImage: false,
      emitsText: false,
    });
    expect(designRefEmission({ section: 'palette', mode: 'image', specimenUrl: '   ' })).toEqual({
      section: 'palette',
      emitsImage: false,
      emitsText: false,
    });
  });

  it('defaults an absent or malformed mode to both', () => {
    expect(designRefEmission({ section: 'palette', tokenSummary: 'summary' })?.emitsText).toBe(
      true,
    );
    expect(
      designRefEmission({ section: 'palette', mode: 'nonsense', tokenSummary: 'summary' })
        ?.emitsText,
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Suppression from the graph                                                 */
/* -------------------------------------------------------------------------- */

const designRefNode = (id: string, data: Record<string, unknown>) => ({
  id,
  type: 'designRef',
  data,
});
const plainNode = (id: string, type: string) => ({ id, type, data: {} });
const edge = (id: string, source: string, target: string, sourceHandle = 'image') => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle: 'ref-images',
});

const emittingRef = (id: string, section: DesignSection) =>
  designRefNode(id, {
    section,
    mode: 'both',
    specimenUrl: 'https://example.test/plate.png',
    tokenSummary: 'summary',
  });

describe('suppressedDesignSections', () => {
  it('finds nothing when nothing is wired', () => {
    expect(suppressedDesignSections('gen', [plainNode('gen', 'nanoGen')], [])).toEqual([]);
  });

  it('collects the section of an emitting designRef', () => {
    const nodes = [plainNode('gen', 'nanoGen'), emittingRef('d1', 'palette')];
    expect(suppressedDesignSections('gen', nodes, [edge('e1', 'd1', 'gen')])).toEqual(['palette']);
  });

  it('collects from every wired designRef, deduplicated', () => {
    const nodes = [
      plainNode('gen', 'nanoGen'),
      emittingRef('d1', 'palette'),
      emittingRef('d2', 'logo'),
      emittingRef('d3', 'palette'),
    ];
    const found = suppressedDesignSections('gen', nodes, [
      edge('e1', 'd1', 'gen'),
      edge('e2', 'd2', 'gen', 'text'),
      edge('e3', 'd3', 'gen'),
    ]);
    expect([...found].sort()).toEqual(['logo', 'palette']);
  });

  it('does NOT suppress for a designRef that emits nothing', () => {
    // Choosing a section and forgetting to generate must not delete that section's
    // grounding — that would make the control actively harmful.
    const nodes = [
      plainNode('gen', 'nanoGen'),
      designRefNode('d1', { section: 'palette', mode: 'image' }),
    ];
    expect(suppressedDesignSections('gen', nodes, [edge('e1', 'd1', 'gen')])).toEqual([]);
  });

  it('does not suppress for an unconfigured designRef', () => {
    const nodes = [plainNode('gen', 'nanoGen'), designRefNode('d1', { section: null })];
    expect(suppressedDesignSections('gen', nodes, [edge('e1', 'd1', 'gen')])).toEqual([]);
  });

  it('is scoped to the TARGET node — a sibling generator keeps its ambient grounding', () => {
    const nodes = [
      plainNode('genA', 'nanoGen'),
      plainNode('genB', 'nanoGen'),
      emittingRef('d1', 'palette'),
    ];
    const edges = [edge('e1', 'd1', 'genA')];
    expect(suppressedDesignSections('genA', nodes, edges)).toEqual(['palette']);
    expect(suppressedDesignSections('genB', nodes, edges)).toEqual([]);
  });

  it('does not follow the graph downstream', () => {
    // genB is downstream of genA, which has a designRef. genB's grounding is its own.
    const nodes = [
      plainNode('genA', 'nanoGen'),
      plainNode('genB', 'nanoGen'),
      emittingRef('d1', 'palette'),
    ];
    const edges = [edge('e1', 'd1', 'genA'), edge('e2', 'genA', 'genB')];
    expect(suppressedDesignSections('genB', nodes, edges)).toEqual([]);
  });

  it('ignores a non-designRef source', () => {
    const nodes = [plainNode('gen', 'nanoGen'), plainNode('img', 'image')];
    expect(suppressedDesignSections('gen', nodes, [edge('e1', 'img', 'gen')])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  The emission ladder                                                        */
/* -------------------------------------------------------------------------- */

const snapshot = (
  sections: DesignSystemSnapshot['sections'],
  extra: Partial<DesignSystemSnapshot> = {},
): DesignSystemSnapshot =>
  ({
    schemaVersion: 1,
    brandName: 'Test Brand',
    sourceKind: 'ds_export',
    rigor: { tier: 'strict', evidence: {}, override: null },
    tokens: [],
    fonts: [],
    adherence: { forbidRawPx: false, forbidRawHex: false, fontAllowlist: [], tokenAllowlist: [] },
    sections,
    conflicts: [],
    ...extra,
  }) as unknown as DesignSystemSnapshot;

const card = (
  section: DesignSection,
  exemplars: { name: string; path: string; mediaType: string; kind: string }[],
  rules: { statement: string; strength: 'hard' | 'preferred' }[] = [],
) =>
  ({
    section,
    title: section,
    summary: '',
    content: {},
    rules: rules.map((rule) => ({ ...rule, target: null, value: null, sourceRef: null })),
    exemplars: exemplars.map((exemplar) => ({
      ...exemplar,
      channel: null,
      viewport: null,
      subtitle: null,
      sha256: null,
    })),
    provenance: 'declared',
    confidence: 1,
    enabled: true,
    editedAt: null,
  }) as unknown as DesignSystemSnapshot['sections'][number];

describe('pickSectionExemplar — rung 1 of the ladder', () => {
  it('refuses an HTML preview card', () => {
    // Every exemplar in production today is text/html: the design-system export ships
    // preview CARDS, UI kits and slides, which are web pages. Emitting one as a
    // reference image would hand a diffusion model an HTML file.
    const snap = snapshot([
      card('palette', [
        {
          name: 'Accent',
          path: 'preview/colors-accent.html',
          mediaType: 'text/html',
          kind: 'preview_card',
        },
      ]),
    ]);
    expect(pickSectionExemplar(snap, 'palette')).toBeNull();
  });

  it('takes an image exemplar verbatim', () => {
    const snap = snapshot([
      card('palette', [
        {
          name: 'Swatches',
          path: 'preview/palette.png',
          mediaType: 'image/png',
          kind: 'preview_card',
        },
      ]),
    ]);
    expect(pickSectionExemplar(snap, 'palette')?.path).toBe('preview/palette.png');
  });

  it('prefers the preview card over a loose asset', () => {
    const snap = snapshot([
      card('logo', [
        { name: 'Mark file', path: 'assets/mark.png', mediaType: 'image/png', kind: 'asset' },
        {
          name: 'Logo card',
          path: 'preview/logo.png',
          mediaType: 'image/png',
          kind: 'preview_card',
        },
      ]),
    ]);
    expect(pickSectionExemplar(snap, 'logo')?.path).toBe('preview/logo.png');
  });

  it('falls back to an asset when there is no preview card', () => {
    const snap = snapshot([
      card('logo', [
        { name: 'Mark file', path: 'assets/mark.svg', mediaType: 'image/svg+xml', kind: 'asset' },
      ]),
    ]);
    expect(pickSectionExemplar(snap, 'logo')?.path).toBe('assets/mark.svg');
  });

  it('is null for a missing section, a missing snapshot, or an empty section', () => {
    expect(pickSectionExemplar(snapshot([]), 'palette')).toBeNull();
    expect(pickSectionExemplar(null, 'palette')).toBeNull();
    expect(pickSectionExemplar(snapshot([card('palette', [])]), 'palette')).toBeNull();
  });
});

describe('designSectionTokenSummary — the text port', () => {
  it('renders only the named section', () => {
    const snap = snapshot([
      card('palette', [], [{ statement: 'Two colours per piece.', strength: 'hard' }]),
      card('motion', [], [{ statement: 'Ease out, never linear.', strength: 'preferred' }]),
    ]);
    const summary = designSectionTokenSummary(snap, 'palette');
    expect(summary).toContain('Two colours per piece.');
    expect(summary).not.toContain('Ease out, never linear.');
  });

  it('is empty for a section with nothing to say, so it emits no text', () => {
    const snap = snapshot([card('palette', [])]);
    expect(designSectionTokenSummary(snap, 'palette')).toBe('');
    expect(designSectionTokenSummary(null, 'palette')).toBe('');
    // …and that empty string is exactly what designRefEmission reads as "no text".
    expect(
      designRefEmission({ section: 'palette', mode: 'tokens', tokenSummary: '' })?.emitsText,
    ).toBe(false);
  });
});

describe('designRefSpecimenPrompt — rung 2', () => {
  it('asks for a reference plate, not a composition', () => {
    const prompt = designRefSpecimenPrompt(null, 'palette');
    expect(prompt).toContain('colour swatches');
    expect(prompt).toContain('specification sheet, not a composition');
  });

  it('carries the section rules into the prompt when there are any', () => {
    const snap = snapshot([
      card('palette', [], [{ statement: 'Never gradients.', strength: 'hard' }]),
    ]);
    expect(designRefSpecimenPrompt(snap, 'palette')).toContain('Never gradients.');
  });

  it('has a subject for every section in the closed enum', () => {
    for (const section of designSectionSchema.options) {
      expect(designRefSpecimenPrompt(null, section).length).toBeGreaterThan(80);
    }
  });
});

describe('DESIGN_REF_PRESETS', () => {
  it('offers the three Design C presets, all naming real sections', () => {
    expect(DESIGN_REF_PRESETS.map((preset) => preset.section)).toEqual([
      'typography',
      'palette',
      'logo',
    ]);
    for (const preset of DESIGN_REF_PRESETS) {
      expect(designSectionSchema.safeParse(preset.section).success).toBe(true);
    }
  });

  it('keeps the logo preset image-only — a described mark is a wrong mark', () => {
    expect(DESIGN_REF_PRESETS.find((preset) => preset.section === 'logo')?.mode).toBe('image');
  });
});
