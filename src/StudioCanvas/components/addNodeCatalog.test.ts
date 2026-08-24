import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getVideoGeneratorProvider,
  STUDIO_NODE_CATEGORY_ORDER,
  STUDIO_NODE_REGISTRY,
  STUDIO_NODE_TYPES,
  studioNodeDefinition,
  VIDEO_GENERATOR_MODELS,
} from '@continuum/contracts';

import {
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
    const offered = allRows.filter((row) => row.model === undefined).map((row) => row.type);
    const expected = STUDIO_CANVAS_NODE_TYPES.filter(
      (type) => type !== 'videoGen' && !heldBack.includes(type),
    );

    expect([...offered].sort()).toEqual([...expected].sort());
    expect(new Set(offered).size).toBe(offered.length);
  });

  // veoDirector / veoFast mount but are never offered: addNodeAtPointer rewrites them to
  // videoGen and the per-model expansion already offers both of their models by name, so
  // two identically-named rows would sit next to each other creating the identical node.
  // `action` is held back for its own reason (see PENDING_PALETTE_NODE_TYPES). Both still
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

  it('expands videoGen to exactly the contract model list, with no duplicates', () => {
    const models = rowsWithModel().map((row) => row.model);

    expect(rowsWithModel().every((row) => row.type === 'videoGen')).toBe(true);
    expect(new Set(models).size).toBe(models.length);
    expect([...models].sort()).toEqual([...VIDEO_GENERATOR_MODELS].sort());
  });

  it('takes every label and blurb from the registry rather than a copy', () => {
    for (const row of allRows) {
      if (row.model !== undefined) continue;
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
