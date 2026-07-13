import { describe, expect, test } from 'bun:test';
import type { MediaComment } from '@continuum/contracts';
import type { AssetCommentsSnapshot } from './comments';
import { currentVersionComments, headVersionsFrom } from './useMultiAssetComments';

function comment(id: string, assetId: string, versionId: string | null): MediaComment {
  return {
    id,
    brandId: 'brand-1',
    assetId,
    versionId,
    parentCommentId: null,
    body: 'note',
    annotation: { kind: 'time', timeMs: 1000 },
    resolvedAt: null,
    resolvedBy: null,
    createdBy: 'user-1',
    authorName: null,
    authorEmail: null,
    createdAt: '2026-07-11T10:00:00Z',
    updatedAt: '2026-07-11T10:00:00Z',
  };
}

const snapshot = (
  comments: MediaComment[],
  headVersionId: string | null,
): AssetCommentsSnapshot => ({ comments, headVersionId });

describe('headVersionsFrom', () => {
  test('pairs each asset with the head version the server reported', () => {
    const heads = headVersionsFrom(
      ['asset-a', 'asset-b'],
      [snapshot([], 'v2-of-a'), snapshot([], null)],
    );
    expect(heads.get('asset-a')).toBe('v2-of-a');
    expect(heads.get('asset-b')).toBeNull();
  });
});

describe('currentVersionComments', () => {
  test('drops a comment pinned to a SUPERSEDED version — it would mark the wrong frame', () => {
    const snapshots = [
      snapshot(
        [comment('on-v1', 'asset-a', 'v1-of-a'), comment('on-v2', 'asset-a', 'v2-of-a')],
        'v2-of-a',
      ),
    ];
    const kept = currentVersionComments(snapshots, headVersionsFrom(['asset-a'], snapshots));
    expect(kept.map((c) => c.id)).toEqual(['on-v2']);
  });

  test('keeps every comment when the asset has no materialized history', () => {
    const snapshots = [snapshot([comment('c1', 'asset-a', null)], null)];
    const kept = currentVersionComments(snapshots, headVersionsFrom(['asset-a'], snapshots));
    expect(kept.map((c) => c.id)).toEqual(['c1']);
  });

  test('filters per asset — one source can be re-versioned while another is not', () => {
    const snapshots = [
      snapshot([comment('a-old', 'asset-a', 'v1-of-a')], 'v2-of-a'),
      snapshot([comment('b-current', 'asset-b', 'v1-of-b')], 'v1-of-b'),
    ];
    const kept = currentVersionComments(
      snapshots,
      headVersionsFrom(['asset-a', 'asset-b'], snapshots),
    );
    expect(kept.map((c) => c.id)).toEqual(['b-current']);
  });

  test('a comment carrying no version is kept — it cannot be stale against a head it predates', () => {
    const snapshots = [snapshot([comment('legacy', 'asset-a', null)], 'v2-of-a')];
    const kept = currentVersionComments(snapshots, headVersionsFrom(['asset-a'], snapshots));
    expect(kept.map((c) => c.id)).toEqual(['legacy']);
  });
});
