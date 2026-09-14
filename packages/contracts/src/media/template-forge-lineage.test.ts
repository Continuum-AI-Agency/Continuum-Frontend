import { describe, expect, it } from 'bun:test';
import {
  FORGE_REASONS,
  forgeLineageHasReason,
  forgeLineageNodeSchema,
  forgeLineageViewSchema,
  forgeReasonSchema,
  forgeWorktreeSchema,
} from './template-forge-lineage';

const ROOT = {
  sha: 'a'.repeat(64),
  tool: 'intake',
  reason: 'intake',
  gitOp: 'commit',
  base: 'a'.repeat(64),
  refs: ['ngrbigguypantsok/master'],
  tags: {},
  children: [
    {
      sha: 'b'.repeat(64),
      tool: 'forge ratio',
      reason: 'geometry',
      gitOp: 'commit',
      ops: 40,
      refs: ['ngrbigguypantsok/story/base'],
      tags: { class: 'base' },
      children: [],
    },
  ],
};

describe('forgeReasonSchema', () => {
  it('is a closed list the Forge tab can chip on', () => {
    expect(FORGE_REASONS).toContain('geometry');
    expect(forgeReasonSchema.parse('authored')).toBe('authored');
    expect(() => forgeReasonSchema.parse('recolour')).toThrow();
  });
});

describe('forgeLineageNodeSchema', () => {
  it('reads a gospel root with a sibling-ready child', () => {
    const parsed = forgeLineageNodeSchema.parse(ROOT);
    expect(parsed.reason).toBe('intake');
    expect(parsed.children[0]?.reason).toBe('geometry');
    expect(forgeLineageHasReason(parsed, 'geometry')).toBe(true);
    expect(forgeLineageHasReason(parsed, 'product')).toBe(false);
  });

  it('keeps extra tag keys the forge may hang later', () => {
    const parsed = forgeLineageNodeSchema.parse({
      ...ROOT,
      children: [],
      tags: { shipped: { attachmentId: 1 }, 'ae-accepted': true },
    });
    expect(parsed.tags.shipped).toEqual({ attachmentId: 1 });
  });
});

describe('forgeLineageViewSchema', () => {
  it('distinguishes unset forge from an unknown sha', () => {
    expect(
      forgeLineageViewSchema.parse({
        connected: false,
        known: false,
        master: null,
        currentMaster: null,
        pinnedToOlderMaster: false,
        roots: [],
        log: [],
        worktrees: [],
        refs: {},
      }).connected,
    ).toBe(false);
    expect(
      forgeLineageViewSchema.parse({
        connected: true,
        known: false,
        master: 'a'.repeat(64),
        currentMaster: 'a'.repeat(64),
        pinnedToOlderMaster: false,
        roots: [],
        log: [],
        worktrees: [],
        refs: {},
      }).known,
    ).toBe(false);
  });
});

describe('forgeWorktreeSchema', () => {
  it('reads a locked checkout', () => {
    const parsed = forgeWorktreeSchema.parse({
      id: 'wt_1',
      commit: 'a'.repeat(64),
      locked: true,
      gitOp: 'worktree',
      reason: 'authored',
    });
    expect(parsed.locked).toBe(true);
  });
});
