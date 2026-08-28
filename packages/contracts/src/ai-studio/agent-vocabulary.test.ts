import { describe, expect, it } from 'bun:test';
import { DESIGN_SECTIONS } from '../design-system/sections';
import { ACTION_DEFS, ACTION_IDS } from './action-registry';
import { describeNodeVocabulary } from './agent-vocabulary';
import { BATCH_COMBINE_MODES, BATCH_ITEM_KINDS } from './batch-node';
import { designRefModeSchema } from './design-grounding';
import { IMAGE_EXPORT_FORMATS, VIDEO_EXPORT_FORMATS } from './export-formats';
import { workflowEditOpSchema } from './workflow-builder';
import { STUDIO_NODE_TYPES, timelineItemSpecSchema } from './workflow-graph';

describe('describeNodeVocabulary', () => {
  const block = describeNodeVocabulary();

  it('names every node type the canvas accepts', () => {
    for (const type of STUDIO_NODE_TYPES) {
      expect(block).toContain(`- ${type} —`);
    }
  });

  it('advertises the handle a video generator actually renders', () => {
    expect(block).toContain('prompt-in');
  });

  it('states the reference-image limit rather than leaving the model to guess', () => {
    expect(block).toMatch(/ref-images \(max \d+\)/);
  });

  it('advertises both Veo 3.1 reference modes and the exclusivity between them', () => {
    expect(block).toContain('referenceMode "frames"');
    expect(block).toContain('referenceMode "images"');
    expect(block).toMatch(/veo-3\.1 .*referenceMode "frames".*first-frame, last-frame/);
    expect(block).toContain('REJECTS reference images and first/last frames in one request');
  });

  it('marks source nodes as taking no inputs', () => {
    const imageLine = block.split('\n').find((line) => line.startsWith('- image —'));
    expect(imageLine).toBeDefined();
    const inputsLine = block.split('\n')[block.split('\n').indexOf(imageLine as string) + 1];
    expect(inputsLine).toContain('(none — it is a source)');
  });

  it('marks publishing sinks as producing no output', () => {
    const lines = block.split('\n');
    for (const type of ['organicPublish', 'paidPublisher']) {
      const index = lines.findIndex((line) => line.startsWith(`- ${type} —`));
      expect(lines[index + 2]).toContain('(none — it is a sink)');
    }
  });
});

// The action catalog is the one part of the vocabulary a probe of an UNCONFIGURED node
// cannot produce: `createNodeData('action')` is born with `actionId: null`, which has no
// handles, so the plain node row used to advertise all 32 ops as "a source that is also a
// sink". These tests are written against the REGISTRY rather than against expected
// strings — an op added to `action-registry.ts` and not rendered fails here.
describe('action op catalog', () => {
  const block = describeNodeVocabulary();
  const lines = block.split('\n');
  const rowFor = (id: string): string | undefined =>
    lines.find((line) => line.startsWith(`  ${id} `) || line === `  ${id}`);

  it('renders a row for every action op the registry declares', () => {
    for (const id of ACTION_IDS) expect(rowFor(id)).toBeDefined();
  });

  it("renders each op's real input handles and connection limits", () => {
    for (const id of ACTION_IDS) {
      const row = rowFor(id) as string;
      for (const port of ACTION_DEFS[id].inputs) {
        expect(row).toContain(`${port.handle}(${port.max})`);
      }
    }
  });

  it("renders each op's real config field names", () => {
    for (const id of ACTION_IDS) {
      const row = rowFor(id) as string;
      const shape = (ACTION_DEFS[id].config as { shape?: Record<string, unknown> }).shape ?? {};
      for (const key of Object.keys(shape)) expect(row).toContain(key);
    }
  });

  it('carries the multi-input ops that a single-clip assumption would break', () => {
    expect(rowFor('video.stitch')).toContain('in(20)');
    expect(rowFor('text.concat')).toContain('in(10)');
    expect(rowFor('video.overlay')).toContain('overlay-in(4)');
    expect(rowFor('video.watermark')).toContain('overlay-in(1)');
    expect(rowFor('video.greenscreen')).toContain('background-in(1)');
  });

  it('marks an output whose modality is not its family, and a collection output', () => {
    expect(rowFor('video.longExposure')).toContain('out:image');
    expect(rowFor('video.extractFrames')).toContain('out:image*');
    expect(rowFor('image.duplicate')).toContain('out*');
    // A same-modality op says nothing extra — that is what keeps the block compact.
    expect(rowFor('image.grade')).not.toContain('out:');
    expect(rowFor('image.grade')).not.toContain('out*');
  });

  it('groups by family then by the registry group order', () => {
    const headings = lines.filter((line) => / · /.test(line) && !line.startsWith('  '));
    expect(headings.slice(0, 3)).toEqual(['image · Colour', 'image · Transform', 'image · Overlay']);
    for (const id of ACTION_IDS) {
      const family = ACTION_DEFS[id].family;
      const group = ACTION_DEFS[id].group;
      const heading = lines.lastIndexOf(`${family} · ${group}`);
      expect(heading).toBeGreaterThan(-1);
      expect(lines.indexOf(rowFor(id) as string)).toBeGreaterThan(heading);
    }
  });

  it('tells the agent an invented actionId is cleared and leaves an inert node', () => {
    expect(block).toContain('the only legal `data.actionId`');
    expect(block).toContain('cleared to null');
    expect(block).toContain('inert node with no handles');
  });

  it('no longer describes the action node itself as a source and a sink', () => {
    const index = lines.findIndex((line) => line.startsWith('- action —'));
    expect(lines[index + 1]).toContain('set by data.actionId');
    expect(lines[index + 1]).not.toContain('(none — it is a source)');
    expect(lines[index + 2]).not.toContain('(none — it is a sink)');
  });
});

describe('config-derived handles and enum hints', () => {
  const block = describeNodeVocabulary();
  const lines = block.split('\n');
  const configLineFor = (type: string): string => {
    const index = lines.findIndex((line) => line.startsWith(`- ${type} —`));
    return lines.slice(index + 1, index + 5).find((line) => line.startsWith('    config:')) ?? '';
  };

  it('says where an apiRender gets its handles instead of calling it a source', () => {
    const index = lines.findIndex((line) => line.startsWith('- apiRender —'));
    expect(lines[index + 1]).toContain('data.variableDefinitions');
    expect(lines[index + 1]).not.toContain('(none — it is a source)');
    // It really is a terminal sink, so that half of the line stays as it was.
    expect(lines[index + 2]).toContain('(none — it is a sink)');
  });

  it('spells out the legal values of every enum-shaped config field', () => {
    for (const section of DESIGN_SECTIONS) expect(configLineFor('designRef')).toContain(section);
    for (const mode of designRefModeSchema.options) {
      expect(configLineFor('designRef')).toContain(mode);
    }
    for (const mode of BATCH_COMBINE_MODES) expect(configLineFor('batch')).toContain(mode);
    for (const format of [...IMAGE_EXPORT_FORMATS, ...VIDEO_EXPORT_FORMATS]) {
      expect(configLineFor('export')).toContain(format);
    }
  });

  it('advertises the batch lock as the thing that makes a batch wirable', () => {
    for (const kind of BATCH_ITEM_KINDS) expect(configLineFor('batch')).toContain(kind);
    expect(configLineFor('batch')).toContain('itemType');
    // The rule itself, not just the vocabulary: an unlocked batch cannot be wired at all.
    expect(block).toContain('has no output modality and every edge from it is refused');
  });

  it('spells export format ids exactly as the constants, and says they are case-exact', () => {
    const line = configLineFor('export');
    for (const format of [...IMAGE_EXPORT_FORMATS, ...VIDEO_EXPORT_FORMATS]) {
      expect(line).toContain(format);
      expect(format).toBe(format.toLowerCase());
      // Nothing in the line may carry a prettified spelling of an id next to the real one.
      expect(line).not.toContain(format.toUpperCase());
    }
    expect(line).toContain('case-exact');
  });

  it('scopes a hint to its own node type', () => {
    // `format` and `mode` are fields on several node types with disjoint vocabularies.
    expect(configLineFor('plannerDraft')).not.toContain('png|jpg|webp');
    expect(configLineFor('paidPublisher')).not.toContain('png|jpg|webp');
    expect(configLineFor('plannerDraft')).not.toContain('tokens|image|both');
  });

  it('exposes elementId and says where an element id comes from', () => {
    expect(configLineFor('element')).toContain('elementId');
    expect(configLineFor('element')).toContain('list_elements');
  });
});

describe('timeline placement drift guard', () => {
  it('documents every field timelineItemSpecSchema accepts, and nothing else', () => {
    const block = describeNodeVocabulary();
    const schemaFields = Object.keys(timelineItemSpecSchema.shape);
    for (const field of schemaFields) {
      expect(block).toContain(`${field}:`);
    }
    // The wrong names the model used to guess must never appear as documented fields.
    for (const invented of ['mediaId', 'durationMs', 'clipIndex', 'offsetMs']) {
      expect(block).not.toContain(invented);
    }
  });

  it('lists the real transition vocabulary', () => {
    expect(describeNodeVocabulary()).toContain('crossDissolve');
  });
});

// The toolloop `edit` scenario failed 2/3 before this block existed: the model spent nine
// consecutive edit_canvas calls cycling ref/value/config against id/label/data. The block
// is derived from the schema, and this is the guard that it stays derived.
describe('edit op wire shape', () => {
  const block = describeNodeVocabulary();
  const options = (
    workflowEditOpSchema as unknown as {
      options: Array<{
        shape: Record<string, { safeParse: (i: unknown) => { success: boolean } }>;
      }>;
    }
  ).options;

  it('renders every op in the union with its exact field names', () => {
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      const op = (option.shape.op as unknown as { def: { values?: string[]; value?: string } }).def;
      const name = op.values?.[0] ?? op.value;
      const fields = Object.keys(option.shape).filter((key) => key !== 'op');
      const required = fields.filter((key) => !option.shape[key]?.safeParse(undefined).success);
      const optional = fields.filter((key) => option.shape[key]?.safeParse(undefined).success);
      const line = `  ${name}: ${['op', ...required, ...optional.map((k) => `[${k}]`)].join(', ')}`;
      expect(block).toContain(line);
    }
  });

  // The failure was INTERFERENCE, not ignorance: build_canvas's spellings are already in
  // the turn's context when the edit is written, so the divergence must be called out.
  it('warns that build and edit spell their fields differently', () => {
    expect(block).toContain('EDIT OPS');
    expect(block).toContain('an edit names an EXISTING node `id` and wires `from`/`to`');
    expect(block).toContain('not `config`, not `value`');
    expect(block).toContain('not `from_ref`');
  });
});
