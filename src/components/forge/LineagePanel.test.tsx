/**
 * Lineage panel against a mocked store view.
 *
 * Guards the three honest empty states and that a gospel root with a geometry child renders
 * as a tree, not as a fake master.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ForgeLineageView } from '@continuum/contracts';

const fetchMock = mock(async (): Promise<ForgeLineageView> => disconnected);

const disconnected: ForgeLineageView = {
  connected: false,
  known: false,
  master: null,
  currentMaster: null,
  pinnedToOlderMaster: false,
  roots: [],
  log: [],
  worktrees: [],
  refs: {},
};

mock.module('@/lib/library/templateSources', () => ({
  fetchTemplateLineage: fetchMock,
}));

const { LineagePanel } = await import('@/components/forge/LineagePanel');

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

describe('LineagePanel', () => {
  test('unset forge is connected=false, not an invented tree', async () => {
    fetchMock.mockImplementation(async () => disconnected);
    render(<LineagePanel brandId="00000000-0000-0000-0000-000000000001" assetId="00000000-0000-0000-0000-000000000002" />);
    expect(await screen.findByText(/Lineage is not connected/)).toBeTruthy();
    expect(screen.queryByText('master')).toBeNull();
  });

  test('unknown sha says the upload is not in the tree yet', async () => {
    fetchMock.mockImplementation(async () => ({
      ...disconnected,
      connected: true,
      known: false,
      master: 'a'.repeat(64),
    }));
    render(<LineagePanel brandId="00000000-0000-0000-0000-000000000001" assetId="00000000-0000-0000-0000-000000000002" />);
    expect(await screen.findByText(/not in the version tree yet/)).toBeTruthy();
  });

  test('a gospel root with a geometry child draws both, and the pin banner when asked', async () => {
    fetchMock.mockImplementation(async () => ({
      connected: true,
      known: true,
      master: 'a'.repeat(64),
      currentMaster: 'c'.repeat(64),
      pinnedToOlderMaster: true,
      roots: [
        {
          sha: 'a'.repeat(64),
          tool: 'intake',
          reason: 'intake',
          gitOp: 'commit',
          refs: ['demo/master'],
          tags: {},
          children: [
            {
              sha: 'b'.repeat(64),
              tool: 'forge ratio',
              reason: 'geometry',
              gitOp: 'commit',
              ops: 40,
              why: '9:16 story',
              refs: ['demo/story/base'],
              tags: {},
              children: [],
            },
          ],
        },
      ],
      log: [],
      worktrees: [{ id: 'wt_1', commit: 'b'.repeat(64), locked: true, reason: 'authored' }],
      refs: { 'demo/master': 'c'.repeat(64) },
    }));
    render(<LineagePanel brandId="00000000-0000-0000-0000-000000000001" assetId="00000000-0000-0000-0000-000000000002" />);
    expect(await screen.findByText(/pinned to an older master/)).toBeTruthy();
    expect(screen.getAllByText('geometry').length).toBeGreaterThan(0);
    expect(screen.getByText(/checkout/)).toBeTruthy();
  });
});
