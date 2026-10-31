// The companion → model hop of a campaign copy: the chat hands the canvas the Backend's diff,
// and the canvas marks ITS graph from it — only when the graph is the scaffold it was drawn for.

import { afterEach, describe, expect, it } from 'bun:test';
import type { StructureDiff } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { SCAFFOLD_COPY_WITH_TESTS } from '@/lib/campaign-canvas/columnMap.fixtures';
import type { CanvasHydration } from '@/lib/campaign-canvas/hydrate';
import { useCampaignStore } from '../stores/useCampaignStore';
import { StoreLectura } from './StoreLectura';

afterEach(cleanup);

const DIFF: StructureDiff = {
  source: { kind: 'campaign', id: '120', name: 'ZAPOPAN live' },
  entries: [
    {
      path_key: 'c0',
      source_path_key: 'c0',
      level: 'campaign',
      name: 'ZAPOPAN copy',
      change: 'changed',
      fields: [{ key: 'name', label: 'Name', before: 'ZAPOPAN live', after: 'ZAPOPAN copy' }],
    },
    {
      path_key: 'c0/a0',
      source_path_key: 'c0/a0',
      level: 'adset',
      name: 'Mujeres',
      change: 'changed',
      fields: [{ key: 'status', label: 'Status', before: 'ACTIVE', after: 'PAUSED' }],
    },
    {
      path_key: 'c0/a4',
      source_path_key: null,
      level: 'adset',
      name: 'Test Reels only',
      change: 'added',
      fields: [{ key: 'placements', label: 'Placements', before: 'automatic', after: 'reels' }],
    },
  ],
};

const load = (scaffoldId: string) =>
  useCampaignStore.getState().loadHydratedGraph({
    nodes: SCAFFOLD_COPY_WITH_TESTS.nodes,
    edges: SCAFFOLD_COPY_WITH_TESTS.edges,
    hydration: { scaffoldId, versionId: 'v1' } as CanvasHydration,
  });

const changes = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-testid^="lectura-change-"]')]
    .filter((node) => !node.getAttribute('data-testid')?.endsWith('-expanded'))
    .map(
      (node) => `${node.getAttribute('data-testid')?.slice(15)}:${node.getAttribute('data-mark')}`,
    );

describe('StoreLectura with the chat’s diff', () => {
  it("marks exactly the Backend's nodes on its own scaffold", () => {
    load('parent-1');
    const { container } = render(
      <StoreLectura
        structureDiff={{ parentScaffoldId: 'parent-1', scaffoldVersionId: 'v1', diff: DIFF }}
      />,
    );
    // The renamed campaign and the one test ad set the diff names; s4, which the graph alone
    // would call new, is not in this diff — the diff wins.
    expect(changes(container)).toEqual(['c:changed', 's5:added']);
  });

  it("falls back to the graph's own reading on another scaffold", () => {
    load('parent-2');
    const { container } = render(
      <StoreLectura
        structureDiff={{ parentScaffoldId: 'parent-1', scaffoldVersionId: 'v1', diff: DIFF }}
      />,
    );
    expect(changes(container)).toEqual(['s4:added', 's5:added']);
  });
});
