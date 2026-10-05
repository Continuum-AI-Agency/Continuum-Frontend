import { describe, expect, test } from 'bun:test';
import { checkpointGraph, refLabel } from '@/components/forge/templateCheckpoints';
import { variantLabel } from '@/components/forge/templateVersion';

// A variant is a sibling VERSION that differs deliberately — a ratio, a language, a legal wrap, a
// motion preset. Same lineage, its own named head. The Render tab's "forks" are forks of DATA and
// are a different thing entirely; conflating the two is most of why this was hard to talk about.

const node = (over: Record<string, unknown> = {}) => ({
  sha: 'a'.repeat(64),
  id: 'a'.repeat(64),
  path: null,
  tool: 'ratio',
  input: null,
  ops: 40,
  reason: 'geometry',
  facet: 'layout',
  why: null,
  gitOp: 'commit',
  base: null,
  checkout: null,
  fromLedger: false,
  refs: [] as string[],
  tags: {} as Record<string, unknown>,
  children: [] as unknown[],
  ...over,
});

describe('variantLabel', () => {
  test('drops the tenant-scoped repo key and keeps the state', () => {
    expect(variantLabel('inyogo/9:16/base')).toBe('9:16/base');
    expect(variantLabel('232/story/tall@accepted')).toBe('story/tall@accepted');
    expect(variantLabel('bare')).toBe('bare');
  });
});

const UPLOAD = '881c3036'.padEnd(64, '0');

// The production shape (2026-09-30): the tree empty, the upload only in the log, tagged published.
const prodView = {
  roots: [],
  log: [
    {
      id: UPLOAD,
      parent: null,
      base: UPLOAD,
      tool: 'intake',
      reason: 'intake',
      at: '2026-09-30T02:54:21.182Z',
      input: { filename: 'speaker.zip' },
      checkout: { blob: UPLOAD },
    },
  ],
  refs: { 'Continuum_app/277@published': UPLOAD },
  master: UPLOAD,
} as never;

describe('checkpointGraph', () => {
  test('a template whose tree is empty still has its upload, live, and the tag it is pinned by', () => {
    const graph = checkpointGraph(prodView);
    expect(graph.rows.map((row) => [row.kind, row.file, row.live, row.depth])).toEqual([
      ['Upload', 'speaker.zip', true, 0],
    ]);
    expect(graph.liveRef).toBe('Continuum_app/277@published');
  });

  test('forks nest under the checkpoint they branch from, like git log --graph', () => {
    const view = {
      roots: [
        node({
          sha: 'm'.repeat(64),
          id: 'm'.repeat(64),
          reason: 'intake',
          tool: 'intake',
          refs: [],
          children: [
            node({ sha: 'b'.repeat(64), id: 'b'.repeat(64), refs: ['inyogo/9:16/base'] }),
            node({
              sha: 'c'.repeat(64),
              id: 'c'.repeat(64),
              tool: 'preset_family',
              reason: 'authored',
              refs: ['inyogo/look/warm'],
              children: [
                node({ sha: 'd'.repeat(64), id: 'd'.repeat(64), reason: 'autofix', refs: [] }),
              ],
            }),
          ],
        }),
      ],
      log: [],
      refs: {},
      master: 'm'.repeat(64),
    } as never;
    expect(
      checkpointGraph(view).rows.map((row) => [row.kind, row.branch, row.depth, row.live]),
    ).toEqual([
      ['Upload', null, 0, true],
      ['Size', '9:16/base', 1, false],
      ['Look', 'look/warm', 1, false],
      ['Autofix round', null, 2, false],
    ]);
  });

  test('live is found by the bytes renders send, then by the published tag', () => {
    const byTag = { ...(prodView as object), master: 'f'.repeat(64) } as never;
    expect(checkpointGraph(byTag).live?.id).toBe(UPLOAD);
    const none = { ...(prodView as object), master: 'f'.repeat(64), refs: {} } as never;
    expect(checkpointGraph(none).live).toBeNull();
    expect(checkpointGraph(none).liveRef).toBeNull();
  });
});

describe('refLabel', () => {
  test('a fork reads as its branch, a tag as its state', () => {
    expect(refLabel('inyogo/9:16/base')).toBe('9:16/base');
    expect(refLabel('Continuum_app/277@published')).toBe('published');
  });
});
