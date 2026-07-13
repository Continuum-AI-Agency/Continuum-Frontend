import { describe, expect, it } from 'bun:test';
import type { MediaComment } from '@continuum/contracts';
import { buildCommentThreads } from '@/lib/library/comments';
import {
  anchorVersionId,
  countThreadCommentsByVersion,
  partitionThreadsByVersion,
} from './commentVersions';

const V1 = 'version-1';
const V2 = 'version-2';

function comment(overrides: Partial<MediaComment> & { id: string }): MediaComment {
  return {
    brandId: 'brand-1',
    assetId: 'asset-1',
    versionId: null,
    parentCommentId: null,
    body: 'body',
    annotation: null,
    resolvedAt: null,
    resolvedBy: null,
    createdBy: 'user-1',
    authorName: 'Jane Doe',
    authorEmail: 'jane@example.com',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

// A conversation spanning a re-upload: a box note on v1, a reply typed later, a
// resolved v1 note, and a fresh note on v2 (the head).
const ON_V1 = comment({
  id: 'c-v1',
  versionId: V1,
  body: 'Crop is too tight on the logo',
  annotation: { kind: 'box', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  createdAt: '2026-07-01T00:00:00.000Z',
});
const REPLY_TO_V1 = comment({
  id: 'c-v1-reply',
  parentCommentId: 'c-v1',
  versionId: V2,
  body: 'Fixed in the new cut',
  createdAt: '2026-07-03T00:00:00.000Z',
});
const RESOLVED_ON_V1 = comment({
  id: 'c-v1-resolved',
  versionId: V1,
  resolvedAt: '2026-07-02T00:00:00.000Z',
  createdAt: '2026-07-01T06:00:00.000Z',
});
const ON_V2 = comment({
  id: 'c-v2',
  versionId: V2,
  annotation: { kind: 'time', timeMs: 4000 },
  createdAt: '2026-07-04T00:00:00.000Z',
});
const LEGACY = comment({ id: 'c-legacy', versionId: null, createdAt: '2026-06-01T00:00:00.000Z' });

describe('anchorVersionId', () => {
  it('anchors an unpinned legacy comment to the head, where it is drawn today', () => {
    expect(anchorVersionId(LEGACY, V2)).toBe(V2);
  });

  it('keeps a pinned comment on its own version, never on the head', () => {
    expect(anchorVersionId(ON_V1, V2)).toBe(V1);
  });

  it('yields null when no head is known', () => {
    expect(anchorVersionId(LEGACY, null)).toBeNull();
  });
});

describe('partitionThreadsByVersion', () => {
  const threads = buildCommentThreads([ON_V1, REPLY_TO_V1, RESOLVED_ON_V1, ON_V2, LEGACY]);

  it('shows only the viewed version’s threads as current, holding the rest back', () => {
    const partition = partitionThreadsByVersion({
      threads,
      viewedVersionId: V2,
      headVersionId: V2,
    });

    expect(partition.current.open.map((t) => t.root.id)).toEqual(['c-legacy', 'c-v2']);
    expect(partition.current.resolved).toHaveLength(0);
    expect(partition.otherVersions.map((t) => t.root.id)).toEqual(['c-v1', 'c-v1-resolved']);
  });

  it('keeps a reply with its root even when the reply was typed on a later version', () => {
    const partition = partitionThreadsByVersion({
      threads,
      viewedVersionId: V2,
      headVersionId: V2,
    });

    // The reply carries versionId v2, but it answers a v1 note: splitting it out
    // would orphan it from the comment it replies to.
    const v1Thread = partition.otherVersions.find((t) => t.root.id === 'c-v1');
    expect(v1Thread?.replies.map((r) => r.id)).toEqual(['c-v1-reply']);
    expect(partition.current.open.some((t) => t.root.id === 'c-v1-reply')).toBe(false);
  });

  it('counts every comment behind the expander, replies included', () => {
    const partition = partitionThreadsByVersion({
      threads,
      viewedVersionId: V2,
      headVersionId: V2,
    });

    // c-v1 + its reply + c-v1-resolved.
    expect(partition.otherVersionCommentCount).toBe(3);
  });

  it('swaps which threads are current when an older version is put on the stage', () => {
    const partition = partitionThreadsByVersion({
      threads,
      viewedVersionId: V1,
      headVersionId: V2,
    });

    expect(partition.current.open.map((t) => t.root.id)).toEqual(['c-v1']);
    expect(partition.current.resolved.map((t) => t.root.id)).toEqual(['c-v1-resolved']);
    // The legacy comment anchors to the head, so from v1 it reads as another
    // version's conversation — as does the note written on v2.
    expect(partition.otherVersions.map((t) => t.root.id)).toEqual(['c-legacy', 'c-v2']);
  });

  it('shows everything as current when no version identity exists yet', () => {
    // An asset never re-uploaded, or a version list still in flight: hiding
    // comments on a guess would be worse than showing them where they are.
    const unversioned = buildCommentThreads([LEGACY, comment({ id: 'c-other' })]);
    const partition = partitionThreadsByVersion({
      threads: unversioned,
      viewedVersionId: null,
      headVersionId: null,
    });

    expect(partition.current.open).toHaveLength(2);
    expect(partition.otherVersions).toHaveLength(0);
    expect(partition.otherVersionCommentCount).toBe(0);
  });
});

describe('countThreadCommentsByVersion', () => {
  it('counts a thread against its root’s version so the rail badge matches the expander', () => {
    const threads = buildCommentThreads([ON_V1, REPLY_TO_V1, RESOLVED_ON_V1, ON_V2, LEGACY]);
    const counts = countThreadCommentsByVersion({ threads, headVersionId: V2 });

    // v1: the box note + its reply + the resolved note.
    expect(counts.get(V1)).toBe(3);
    // v2: its own note + the legacy comment anchored to the head.
    expect(counts.get(V2)).toBe(2);
  });

  it('keys nothing when there is no head to key on', () => {
    const counts = countThreadCommentsByVersion({
      threads: buildCommentThreads([LEGACY]),
      headVersionId: null,
    });
    expect(counts.size).toBe(0);
  });
});
