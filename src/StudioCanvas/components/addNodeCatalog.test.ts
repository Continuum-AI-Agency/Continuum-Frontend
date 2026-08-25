import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ACTION_DEFS,
  ACTION_IDS,
  getVideoGeneratorProvider,
  STUDIO_NODE_CATEGORY_ORDER,
  STUDIO_NODE_REGISTRY,
  STUDIO_NODE_TYPES,
  studioNodeDefinition,
  VIDEO_GENERATOR_MODELS,
} from '@continuum/contracts';
import { isImplementedAction } from '../utils/actions/runAction';

import {
  ACTION_FAMILY_LABELS,
  ADD_NODE_GROUP_ORDER,
  ADD_NODE_GROUPS,
  type AddNodeRow,
  addNodeRowKey,
  addNodeSearchValue,
  LEGACY_VIDEO_ALIAS_NODE_TYPES,
  PENDING_PALETTE_NODE_TYPES,
  STUDIO_CANVAS_NODE_TYPES,
} from './addNodeCatalog';

/**
 * The keys of `nodeTypes` in canvasNodeTypes.ts, read out of the SOURCE rather than
 * imported. Importing it would drag every block component — and with it @xyflow, the
 * splice worker and the whole node tree — into a test about a list of strings, which
 * turns a red catalog test into "some node file does not compile today".
 */
const mountedNodeTypes = (): string[] => {
  const source = readFileSync(
    fileURLToPath(new URL('./canvasNodeTypes.ts', import.meta.url)),
    'utf8',
  );
  const block = /export const nodeTypes = \{([\s\S]*?)\n\};/.exec(source)?.[1];
  if (!block) throw new Error('could not find `export const nodeTypes` in canvasNodeTypes.ts');
  return [...block.matchAll(/^\s{2}([A-Za-z0-9_]+):/gm)].map((match) => match[1]);
};

const allRows: readonly AddNodeRow[] = ADD_NODE_GROUPS.flatMap((section) => section.rows);
const rowsWithModel = (): readonly AddNodeRow[] => allRows.filter((row) => row.model !== undefined);
const rowsWithAction = (): readonly AddNodeRow[] =>
  allRows.filter((row) => row.actionId !== undefined);
/** The rows that stand for a node type itself, rather than one of its models or ops. */
const plainRows = (): readonly AddNodeRow[] =>
  allRows.filter((row) => row.model === undefined && row.actionId === undefined);
const groupRows = (group: string): readonly AddNodeRow[] =>
  ADD_NODE_GROUPS.find((section) => section.group === group)?.rows ?? [];
const typesIn = (group: string): string[] => groupRows(group).map((row) => row.type);

describe('the mountable-type list', () => {
  // The catalog's whole filter. Register a block component without listing the type here
  // and the node is silently unreachable from the palette; list one with no component and
  // adding it throws in React Flow. Either way this is the test that says so.
  it('is exactly the node types canvasNodeTypes mounts', () => {
    expect([...STUDIO_CANVAS_NODE_TYPES].sort()).toEqual(mountedNodeTypes().sort());
  });

  it('only names types the contracts registry describes', () => {
    for (const type of STUDIO_CANVAS_NODE_TYPES) {
      expect(STUDIO_NODE_TYPES, type).toContain(type);
    }
  });
});

describe('addNodeCatalog', () => {
  it('groups by the registry categories, in the order contracts publishes them', () => {
    expect(ADD_NODE_GROUP_ORDER).toEqual([...STUDIO_NODE_CATEGORY_ORDER]);
    expect(ADD_NODE_GROUPS.map((section) => section.group)).toEqual([...ADD_NODE_GROUP_ORDER]);
    expect(ADD_NODE_GROUPS.map((section) => section.label)).toEqual([
      'Text',
      'Image',
      'Video',
      'Audio',
      'Document',
      'Action',
    ]);
  });

  it('offers every mountable type exactly once, minus the ones it declares held back', () => {
    const heldBack: readonly string[] = [
      ...LEGACY_VIDEO_ALIAS_NODE_TYPES,
      ...PENDING_PALETTE_NODE_TYPES,
    ];
    const offered = plainRows().map((row) => row.type);
    // videoGen and action are EXPANDED (one row per model / per op), so neither has a
    // plain row; the two tests below are what prove those expansions are complete.
    const expected = STUDIO_CANVAS_NODE_TYPES.filter(
      (type) => type !== 'videoGen' && type !== 'action' && !heldBack.includes(type),
    );

    expect([...offered].sort()).toEqual([...expected].sort());
    expect(new Set(offered).size).toBe(offered.length);
  });

  // veoDirector / veoFast mount but are never offered: addNodeAtPointer rewrites them to
  // videoGen and the per-model expansion already offers both of their models by name, so
  // two identically-named rows would sit next to each other creating the identical node.
  // PENDING_PALETTE_NODE_TYPES is empty since `action` graduated to per-op rows, so this
  // covers the legacy aliases today and any future entry for free. Held-back types still
  // MOUNT — a type offered nowhere and mounted nowhere is dead vocabulary, and this is
  // where that would show up.
  it('holds back only types that do mount', () => {
    const mounted = mountedNodeTypes();
    for (const type of [...LEGACY_VIDEO_ALIAS_NODE_TYPES, ...PENDING_PALETTE_NODE_TYPES]) {
      expect(mounted, `${type} no longer mounts`).toContain(type);
      expect(
        allRows.map((row) => row.type),
        type,
      ).not.toContain(type);
    }
  });

  // The Wave-4 graduation. An op-less action node has no handles and accepts nothing, so
  // the catalog offers the OP, not the node — and the set has to be the runner's, not a
  // copy of it: a row for an op with no runner is a node born with a greyed-out Run button.
  it('expands action to exactly the implemented ops, with no duplicates', () => {
    const offered = rowsWithAction().map((row) => row.actionId);
    const implemented = ACTION_IDS.filter(isImplementedAction);

    expect(rowsWithAction().every((row) => row.type === 'action')).toBe(true);
    expect(new Set(offered).size).toBe(offered.length);
    expect([...offered].sort()).toEqual([...implemented].sort());

    for (const id of ACTION_IDS.filter((id) => !isImplementedAction(id))) {
      expect(offered, id).not.toContain(id);
    }
  });

  it('takes every action row label and blurb from the op registry, ordered by group', () => {
    const groupOrder = [...new Set(ACTION_IDS.map((id) => ACTION_DEFS[id].group))];
    const rows = rowsWithAction();

    for (const row of rows) {
      const def = ACTION_DEFS[row.actionId as (typeof ACTION_IDS)[number]];
      expect(row.label, row.actionId).toBe(def.label);
      expect(row.desc, row.actionId).toBe(def.description);
    }

    const keys = rows.map((row) => {
      const def = ACTION_DEFS[row.actionId as (typeof ACTION_IDS)[number]];
      return [groupOrder.indexOf(def.group), def.label] as const;
    });
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])));
  });

  // D-08: contracts gives five ops the same label once for stills and once for clips
  // (Blur, Colour Grade, Filter, Crop to Ratio, Pad to Ratio), and two rows reading `Blur`
  // with nothing to tell them apart made Enter a coin flip between two different ops.
  it('makes every row visually unique on label plus family', () => {
    const identity = allRows.map((row) => `${row.label}\u0000${row.family ?? ''}`);
    const duplicated = identity.filter((key, index) => identity.indexOf(key) !== index);

    expect(duplicated).toEqual([]);
    expect(new Set(identity).size).toBe(allRows.length);
  });

  it('takes each action row family from the op registry, and only action rows have one', () => {
    for (const row of rowsWithAction()) {
      const def = ACTION_DEFS[row.actionId as (typeof ACTION_IDS)[number]];
      expect(row.family, row.actionId).toBe(def.family);
      expect(ACTION_FAMILY_LABELS[def.family].length).toBeGreaterThan(0);
    }
    for (const row of [...plainRows(), ...rowsWithModel()]) {
      expect(row.family, row.label).toBeUndefined();
    }
  });

  it('carries the family into the search value, so "video blur" reaches the clip op', () => {
    const section = ADD_NODE_GROUPS.find((candidate) => candidate.group === 'action');
    if (!section) throw new Error('no Action section');
    const videoBlur = rowsWithAction().find((row) => row.actionId === 'video.blur');
    if (!videoBlur) throw new Error('no video.blur row');

    expect(addNodeSearchValue(section, videoBlur)).toContain('Video');
  });

  it('files every action row under the Action group', () => {
    const actionGroup = groupRows('action');
    for (const row of rowsWithAction()) expect(actionGroup, row.actionId).toContain(row);
  });

  it('expands videoGen to exactly the contract model list, with no duplicates', () => {
    const models = rowsWithModel().map((row) => row.model);

    expect(rowsWithModel().every((row) => row.type === 'videoGen')).toBe(true);
    expect(new Set(models).size).toBe(models.length);
    expect([...models].sort()).toEqual([...VIDEO_GENERATOR_MODELS].sort());
  });

  it('takes every label and blurb from the registry rather than a copy', () => {
    for (const row of plainRows()) {
      const definition = studioNodeDefinition(row.type);
      expect(row.label, row.type).toBe(definition.label);
      expect(row.desc, row.type).toBe(definition.description);
    }
  });

  it('files each row under the category its registry entry declares', () => {
    for (const section of ADD_NODE_GROUPS) {
      for (const row of section.rows) {
        expect(STUDIO_NODE_REGISTRY[row.type].category, row.type).toBe(section.group);
      }
    }
  });

  it('puts hyperframesAgent under Video and the handoffs under Action', () => {
    expect(typesIn('video')).toContain('hyperframesAgent');
    for (const type of [
      'frameExtract',
      'plannerDraft',
      'organicPublish',
      'paidPublisher',
      'apiRender',
    ]) {
      expect(typesIn('action'), type).toContain(type);
    }
  });

  it('runs provider by provider inside a group, model hosts first', () => {
    const providerOf = (row: AddNodeRow): string =>
      row.model ? getVideoGeneratorProvider(row.model) : STUDIO_NODE_REGISTRY[row.type].provider;
    const rank = (provider: string): number => ['google', 'fal', 'continuum'].indexOf(provider);

    for (const section of ADD_NODE_GROUPS) {
      const ranks = section.rows.map((row) => rank(providerOf(row)));
      expect(
        [...ranks].sort((a, b) => a - b),
        section.group,
      ).toEqual(ranks);
    }
  });

  it('leads the google video run with the default model', () => {
    const googleModels = groupRows('video')
      .filter((row) => row.model !== undefined && getVideoGeneratorProvider(row.model) === 'google')
      .map((row) => row.model);

    expect(googleModels[0]).toBe('veo-3.1-fast');
  });

  it('names the provider on every row, and blurbs every non-model row', () => {
    for (const row of allRows) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(['Google', 'Fal', 'Continuum']).toContain(row.tag);
      if (row.model === undefined) expect(row.desc?.length ?? 0).toBeGreaterThan(0);
      else expect(row.desc).toBeUndefined();
      expect(row.model !== undefined && row.actionId !== undefined).toBe(false);
    }
  });

  it('gives every row a unique key and a search value that carries its group', () => {
    const keys = allRows.map(addNodeRowKey);
    expect(new Set(keys).size).toBe(keys.length);

    for (const section of ADD_NODE_GROUPS) {
      for (const row of section.rows) {
        const value = addNodeSearchValue(section, row);
        expect(value, row.label).toContain(row.label);
        expect(value, row.label).toContain(section.label);
        expect(value, row.label).toContain(row.tag);
      }
    }

    const values = ADD_NODE_GROUPS.flatMap((section) =>
      section.rows.map((row) => addNodeSearchValue(section, row).toLowerCase()),
    );
    expect(new Set(values).size, 'cmdk keys items by value — duplicates collapse').toBe(
      values.length,
    );
  });
});
