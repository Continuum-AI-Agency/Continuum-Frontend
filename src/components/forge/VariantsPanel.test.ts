import { describe, expect, test } from 'bun:test';
import { variantLabel, variantsOf } from '@/components/forge/VariantsPanel';

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

describe('variantsOf', () => {
  test('lists every named head in the forest, nested ones included', () => {
    const view = {
      roots: [
        node({
          sha: 'm'.repeat(64),
          refs: [],
          children: [
            node({ sha: 'b'.repeat(64), refs: ['inyogo/9:16/base'] }),
            node({
              sha: 'c'.repeat(64),
              refs: ['inyogo/1:1/base'],
              children: [node({ sha: 'd'.repeat(64), refs: ['inyogo/1:1/tall'] })],
            }),
          ],
        }),
      ],
    } as never;
    expect(variantsOf(view).map((v) => v.name)).toEqual(['9:16/base', '1:1/base', '1:1/tall']);
  });

  test('a node with no ref is not a variant — an unnamed fork is a step, not a sibling', () => {
    const view = { roots: [node({ refs: [] })] } as never;
    expect(variantsOf(view)).toEqual([]);
  });

  test('carries the outside-world facts the store hung on those bytes', () => {
    const view = {
      roots: [
        node({
          refs: ['inyogo/9:16/base'],
          tags: {
            state: 'needs_render',
            'ae-accepted': true,
            shipped: { attachmentId: 27612 },
            pointer: [
              { direction: 'flip', at: '2026-09-16T00:00:00Z', attachment: 27612 },
              { direction: 'restore', at: '2026-09-16T00:05:00Z', attachment: 27612 },
            ],
          },
        }),
      ],
    } as never;
    const [variant] = variantsOf(view);
    expect(variant.state).toBe('needs_render');
    expect(variant.accepted).toBe(true);
    expect(variant.shippedAs).toBe(27612);
    // The LAST move, not the first: a pointer history that shows its opening move is a lie about
    // where the template is now.
    expect(variant.lastPointer?.direction).toBe('restore');
  });

  test('tolerates a node whose tags carry none of that', () => {
    const view = { roots: [node({ refs: ['inyogo/9:16/base'], tags: {} })] } as never;
    const [variant] = variantsOf(view);
    expect(variant.state).toBeNull();
    expect(variant.accepted).toBe(false);
    expect(variant.shippedAs).toBeNull();
    expect(variant.lastPointer).toBeNull();
  });
});
