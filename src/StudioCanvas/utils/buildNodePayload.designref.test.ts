// The contextual design-system selection has to survive the trip to the wire — and it
// has to arrive NARROWED.
//
// Before this, every generation node sent `designSystemSections: undefined`, which the
// Backend reads as "resolve from the rigor tier" — every section the brand left enabled.
// So a video generator was told the brand's type scale and its border radii, and an
// image generator was told its motion easing. `SECTION_AUTO_APPLY` replaces that blanket
// with a per-node-type ambient default, and a wired `designRef` removes its own section
// from that default on the node it feeds.
//
// The two states that must not move: `undefined` still means "the Backend decides", and
// `[]` still means "the user switched the design system off". Everything below exists to
// keep a `??` from ever converting the second into the first.

import { describe, expect, it } from 'bun:test';
import type { DesignSection } from '@continuum/contracts';
import type { Edge } from '@xyflow/react';
import type { StudioNode } from '../types';
import type { GenerationPayload, NodeOutput } from '../types/execution';
import {
  buildNanoGenPayload,
  buildVeoPayload,
  resolveInheritedGrounding,
  toBackendPayload,
} from './buildNodePayload';

const EMPTY = new Map<string, NodeOutput>();

const gen = (
  id: string,
  type: 'nanoGen' | 'videoGen',
  data: Record<string, unknown> = {},
): StudioNode =>
  ({
    id,
    type,
    position: { x: 0, y: 0 },
    data:
      type === 'nanoGen'
        ? { positivePrompt: 'a cat', model: 'nano-banana', ...data }
        : { prompt: 'a cat', model: 'veo-3.1', ...data },
  }) as unknown as StudioNode;

const designRef = (id: string, data: Record<string, unknown>): StudioNode =>
  ({ id, type: 'designRef', position: { x: 0, y: 0 }, data }) as unknown as StudioNode;

/** A designRef that has actually resolved both of its ports. */
const resolvedRef = (id: string, section: DesignSection, mode = 'both'): StudioNode =>
  designRef(id, {
    section,
    mode,
    specimenUrl: 'https://cdn.test/plate.png',
    specimenMimeType: 'image/png',
    specimenSource: 'generated',
    tokenSummary: `<design_system>${section}</design_system>`,
  });

const wire = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
): Edge => ({ id, source, target, sourceHandle, targetHandle }) as Edge;

const buildNano = (nodes: StudioNode[], edges: Edge[], id = 'nano1'): GenerationPayload => {
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`no node ${id}`);
  const payload = buildNanoGenPayload(node, EMPTY, nodes, edges, 'brand-1');
  if (!payload) throw new Error('expected a payload');
  return payload;
};

const buildVeo = (nodes: StudioNode[], edges: Edge[], id = 'vid1'): GenerationPayload => {
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`no node ${id}`);
  const payload = buildVeoPayload(node, EMPTY, nodes, edges, 'brand-1');
  if (!payload) throw new Error('expected a payload');
  return payload;
};

/* -------------------------------------------------------------------------- */
/*  The ambient default                                                        */
/* -------------------------------------------------------------------------- */

describe('SECTION_AUTO_APPLY becomes the ambient default on the payload', () => {
  it('narrows an unselected image generator to palette / imagery / logo', () => {
    const nodes = [gen('nano1', 'nanoGen')];
    const payload = buildNano(nodes, []);

    expect(payload.designSystemSections).toEqual(['palette', 'imagery', 'logo']);
    expect(toBackendPayload(payload).design_system_sections).toEqual([
      'palette',
      'imagery',
      'logo',
    ]);
  });

  it('narrows an unselected video generator to palette / motion / imagery', () => {
    const payload = buildVeo([gen('vid1', 'videoGen')], []);

    expect(payload.designSystemSections).toEqual(['palette', 'motion', 'imagery']);
    // The whole point of the feature, as an assertion: a diffusion model cannot set
    // type, so the brand's type scale is not spent on a video prompt.
    expect(payload.designSystemSections).not.toContain('typography');
  });

  it('leaves an explicit selection exactly as the user picked it', () => {
    const payload = buildNano([gen('nano1', 'nanoGen', { designSystemSections: ['shadows'] })], []);

    expect(payload.designSystemSections).toEqual(['shadows']);
    expect(toBackendPayload(payload).design_system_sections).toEqual(['shadows']);
  });

  it('keeps an empty selection EMPTY — off must not become all', () => {
    const payload = buildNano([gen('nano1', 'nanoGen', { designSystemSections: [] })], []);

    // `toBeUndefined()` here would mean the user switched the design system off and the
    // Backend applied every section the brand has.
    expect(payload.designSystemSections).toEqual([]);
    expect(toBackendPayload(payload).design_system_sections).toEqual([]);
  });

  it('still maps an absent selection to an absent wire field', () => {
    // `undefined` is the one semantic this change must not move: it is what the Backend
    // reads as "resolve from the rigor tier", and it is what every node type with no
    // SECTION_AUTO_APPLY row still sends.
    const backend = toBackendPayload({
      brandId: 'brand-1',
      model: 'gemini-2.5-flash-image',
      medium: 'image',
      prompt: 'a cat',
      designSystemSections: undefined,
    } as GenerationPayload);

    expect(backend.design_system_sections).toBeUndefined();
    expect('design_system_sections' in backend).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  The override — explicit beats blanket                                      */
/* -------------------------------------------------------------------------- */

describe('a connected designRef suppresses the ambient entry for its section', () => {
  it('removes the wired section from the ambient default', () => {
    const nodes = [gen('nano1', 'nanoGen'), resolvedRef('d1', 'palette')];
    const edges = [wire('e1', 'd1', 'nano1', 'image', 'ref-images')];

    expect(buildNano(nodes, edges).designSystemSections).toEqual(['imagery', 'logo']);
  });

  it('removes the wired section from an explicit selection too', () => {
    const nodes = [
      gen('nano1', 'nanoGen', { designSystemSections: ['palette', 'shadows'] }),
      resolvedRef('d1', 'palette'),
    ];
    const edges = [wire('e1', 'd1', 'nano1', 'image', 'ref-images')];

    expect(buildNano(nodes, edges).designSystemSections).toEqual(['shadows']);
  });

  it('suppresses through the TEXT port as well as the image port', () => {
    const nodes = [gen('nano1', 'nanoGen'), resolvedRef('d1', 'palette', 'tokens')];
    const edges = [wire('e1', 'd1', 'nano1', 'text', 'prompt')];

    expect(buildNano(nodes, edges).designSystemSections).toEqual(['imagery', 'logo']);
  });

  it('leaves [] when every ambient section is wired — never undefined', () => {
    const nodes = [
      gen('nano1', 'nanoGen'),
      resolvedRef('d1', 'palette'),
      resolvedRef('d2', 'imagery'),
      resolvedRef('d3', 'logo'),
    ];
    const edges = [
      wire('e1', 'd1', 'nano1', 'image', 'ref-images'),
      wire('e2', 'd2', 'nano1', 'image', 'ref-images'),
      wire('e3', 'd3', 'nano1', 'image', 'ref-images'),
    ];
    const payload = buildNano(nodes, edges);

    expect(payload.designSystemSections).toEqual([]);
    expect(payload.designSystemSections).not.toBeUndefined();
    expect(toBackendPayload(payload).design_system_sections).toEqual([]);
  });

  it('suppresses on the TARGET node only', () => {
    const nodes = [gen('nano1', 'nanoGen'), gen('nano2', 'nanoGen'), resolvedRef('d1', 'palette')];
    const edges = [wire('e1', 'd1', 'nano1', 'image', 'ref-images')];

    expect(buildNano(nodes, edges, 'nano1').designSystemSections).toEqual(['imagery', 'logo']);
    // The sibling never touched by the designRef keeps its whole ambient row.
    expect(buildNano(nodes, edges, 'nano2').designSystemSections).toEqual([
      'palette',
      'imagery',
      'logo',
    ]);
  });

  it('does NOT suppress for a designRef whose specimen has not resolved', () => {
    // The failure this guards: choosing a section and forgetting to generate would
    // DELETE that section's grounding, making the output worse the moment somebody
    // reaches for the control.
    const nodes = [gen('nano1', 'nanoGen'), designRef('d1', { section: 'palette', mode: 'image' })];
    const edges = [wire('e1', 'd1', 'nano1', 'image', 'ref-images')];

    expect(buildNano(nodes, edges).designSystemSections).toEqual(['palette', 'imagery', 'logo']);
  });

  it('does not suppress for an unconfigured designRef', () => {
    const nodes = [gen('nano1', 'nanoGen'), designRef('d1', { section: null, mode: 'both' })];
    const edges = [wire('e1', 'd1', 'nano1', 'image', 'ref-images')];

    expect(buildNano(nodes, edges).designSystemSections).toEqual(['palette', 'imagery', 'logo']);
  });

  it('suppresses on a video generator with the video row', () => {
    const nodes = [gen('vid1', 'videoGen'), resolvedRef('d1', 'motion')];
    const edges = [wire('e1', 'd1', 'vid1', 'text', 'prompt')];

    expect(buildVeo(nodes, edges).designSystemSections).toEqual(['palette', 'imagery']);
  });
});

/* -------------------------------------------------------------------------- */
/*  What each port actually carries                                            */
/* -------------------------------------------------------------------------- */

describe('the designRef ports carry different things, and only what they are', () => {
  it('folds the token summary into the prompt through the text port', () => {
    const nodes = [gen('nano1', 'nanoGen'), resolvedRef('d1', 'palette', 'tokens')];
    const edges = [wire('e1', 'd1', 'nano1', 'text', 'prompt')];

    expect(buildNano(nodes, edges).prompt).toContain('<design_system>palette</design_system>');
  });

  it('refuses to hand a token summary to a reference-image port', () => {
    // The port side is already refused by the Wave-1 connection matrix; this is the
    // payload side, so a graph that somehow carries the edge still cannot send a
    // text/plain "image" to an image model.
    const nodes = [gen('nano1', 'nanoGen'), resolvedRef('d1', 'palette')];
    const edges = [wire('e1', 'd1', 'nano1', 'text', 'ref-images')];

    expect(buildNano(nodes, edges).referenceImages).toBeUndefined();
  });

  it('emits the specimen as a reference image through the image port', () => {
    const nodes = [gen('nano1', 'nanoGen'), resolvedRef('d1', 'palette')];
    const edges = [wire('e1', 'd1', 'nano1', 'image', 'ref-images')];
    const payload = buildNano(nodes, edges);

    expect(payload.referenceImages).toHaveLength(1);
    expect(payload.referenceImages?.[0]?.imageUrl).toBe('https://cdn.test/plate.png');
    expect(payload.referenceImages?.[0]?.mimeType).toBe('image/png');
  });

  it('emits nothing on the image port until a specimen exists', () => {
    const nodes = [gen('nano1', 'nanoGen'), designRef('d1', { section: 'palette', mode: 'image' })];
    const edges = [wire('e1', 'd1', 'nano1', 'image', 'ref-images')];

    expect(buildNano(nodes, edges).referenceImages).toBeUndefined();
  });

  it('does not count a specimen as a performance-bearing library creative', () => {
    // `referenceAssetIds` drives <asset_performance>. A design specimen has no
    // performance history, so it must not arrive as though it did.
    const nodes = [
      gen('nano1', 'nanoGen'),
      designRef('d1', {
        section: 'palette',
        mode: 'image',
        specimenUrl: 'https://cdn.test/plate.png',
        specimenAssetId: 'asset-1',
      }),
    ];
    const edges = [wire('e1', 'd1', 'nano1', 'image', 'ref-images')];

    expect(buildNano(nodes, edges).referenceAssetIds).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  Enrichment inherits the RESOLVED set                                       */
/* -------------------------------------------------------------------------- */

describe('resolveInheritedGrounding', () => {
  const stringNode = (id: string): StudioNode =>
    ({
      id,
      type: 'string',
      position: { x: 0, y: 0 },
      data: { value: 'hi' },
    }) as unknown as StudioNode;

  it('inherits the generator narrowed, not the generator raw', () => {
    const nodes = [stringNode('s1'), gen('nano1', 'nanoGen')];
    const edges = [wire('e1', 's1', 'nano1', 'text', 'prompt')];

    expect(resolveInheritedGrounding('s1', nodes, edges).designSystemSections).toEqual([
      'palette',
      'imagery',
      'logo',
    ]);
  });

  it('inherits the suppression the generator is under', () => {
    // Tele-fill must reflect the grounding the generation actually uses, or the chip and
    // the wire drift apart.
    const nodes = [stringNode('s1'), gen('nano1', 'nanoGen'), resolvedRef('d1', 'palette')];
    const edges = [
      wire('e1', 's1', 'nano1', 'text', 'prompt'),
      wire('e2', 'd1', 'nano1', 'image', 'ref-images'),
    ];

    expect(resolveInheritedGrounding('s1', nodes, edges).designSystemSections).toEqual([
      'imagery',
      'logo',
    ]);
  });

  it('grounds an unwired text box on voice alone', () => {
    expect(resolveInheritedGrounding('s1', [stringNode('s1')], []).designSystemSections).toEqual([
      'voice',
    ]);
  });

  it('keeps a generator switched OFF switched off', () => {
    const nodes = [stringNode('s1'), gen('nano1', 'nanoGen', { designSystemSections: [] })];
    const edges = [wire('e1', 's1', 'nano1', 'text', 'prompt')];

    expect(resolveInheritedGrounding('s1', nodes, edges).designSystemSections).toEqual([]);
  });
});
