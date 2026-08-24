import { describe, expect, it } from 'bun:test';
import {
  getVideoGeneratorProvider,
  STUDIO_NODE_TYPES,
  VIDEO_GENERATOR_MODELS,
} from '@continuum/contracts';

import {
  ADD_NODE_GROUP_ORDER,
  ADD_NODE_GROUPS,
  type AddNodeRow,
  type StudioCanvasNodeType,
} from './addNodeCatalog';

// Transcribed from the LIBRARY_SECTIONS array this catalog replaced. A node type that
// silently stops being offered is the failure mode this guards.
const TYPES_OFFERED_BEFORE_THE_REGROUPING: readonly StudioCanvasNodeType[] = [
  'nanoGen',
  'image',
  'videoGen',
  'hyperframesAgent',
  'omniGen',
  'extendVideo',
  'timelineEditor',
  'video',
  'videoDecode',
  'frameExtract',
  'audio',
  'document',
  'string',
  'note',
  'apiRender',
  'plannerDraft',
  'organicPublish',
  'paidPublisher',
];

// Every type this catalog offers is now a contracts type. `note` used to be the one
// exception — canvas-only, so a graph carrying one failed validateWorkflowGraph — and
// Canvas V3 moved it into STUDIO_NODE_TYPES. Kept as a list rather than deleted: if a
// canvas-only node type is ever added again, this is where it gets declared.
const NODE_TYPES_OUTSIDE_CONTRACTS: readonly StudioCanvasNodeType[] = [];

const allRows: readonly AddNodeRow[] = ADD_NODE_GROUPS.flatMap((section) => section.rows);

const rowsWithModel = (): readonly AddNodeRow[] => allRows.filter((row) => row.model !== undefined);

describe('addNodeCatalog', () => {
  it('renders the approved groups in the approved order', () => {
    expect(ADD_NODE_GROUP_ORDER).toEqual(['google', 'fal', 'continuum', 'publishing', 'inputs']);
    expect(ADD_NODE_GROUPS.map((section) => section.group)).toEqual([...ADD_NODE_GROUP_ORDER]);
    expect(ADD_NODE_GROUPS.map((section) => section.label)).toEqual([
      'Google',
      'Fal',
      'Continuum',
      'Publishing',
      'Inputs & Utility',
    ]);
  });

  it('only offers node types the canvas knows how to create', () => {
    const contractTypes = new Set<string>(STUDIO_NODE_TYPES);
    const offContract = allRows
      .map((row) => row.type)
      .filter((type) => !contractTypes.has(type))
      .filter((type, index, types) => types.indexOf(type) === index);

    expect(offContract).toEqual([...NODE_TYPES_OUTSIDE_CONTRACTS]);
  });

  it('offers every node type the previous flat catalog offered, exactly once', () => {
    const nonModelTypes = allRows.filter((row) => row.model === undefined).map((row) => row.type);

    expect([...nonModelTypes].sort()).toEqual(
      [...TYPES_OFFERED_BEFORE_THE_REGROUPING.filter((type) => type !== 'videoGen')].sort(),
    );
    expect(new Set(nonModelTypes).size).toBe(nonModelTypes.length);
    expect(rowsWithModel().every((row) => row.type === 'videoGen')).toBe(true);
    expect(rowsWithModel().length).toBeGreaterThan(0);
  });

  it('flattens its model rows to exactly the contract model list, with no duplicates', () => {
    const models = rowsWithModel().map((row) => row.model);

    expect(new Set(models).size).toBe(models.length);
    expect([...models].sort()).toEqual([...VIDEO_GENERATOR_MODELS].sort());
  });

  it('files every model row under its own provider', () => {
    for (const section of ADD_NODE_GROUPS) {
      for (const row of section.rows) {
        if (row.model === undefined) continue;
        expect(getVideoGeneratorProvider(row.model)).toBe(section.group);
      }
    }
  });

  it('leads each provider run with the default model', () => {
    const google = ADD_NODE_GROUPS.find((section) => section.group === 'google');
    const googleModels = (google?.rows ?? [])
      .filter((row) => row.model !== undefined)
      .map((row) => row.model);

    expect(googleModels[0]).toBe('veo-3.1-fast');
  });

  it('carries a label and tag on every row, and a desc on every non-model row', () => {
    for (const row of allRows) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(row.tag.length).toBeGreaterThan(0);
      if (row.model === undefined) expect(row.desc?.length ?? 0).toBeGreaterThan(0);
      else expect(row.desc).toBeUndefined();
    }
  });
});
