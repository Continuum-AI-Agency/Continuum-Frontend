import { describe, expect, it } from 'bun:test';
import { mediaAssetSchema, mediaKindSchema } from './asset';
import {
  commentAnnotationSchema,
  createCommentRequestSchema,
  listCommentsResponseSchema,
  updateCommentRequestSchema,
} from './comments';
import { mergeMatches } from './metadataSearch';
import { reviewPingRequestSchema } from './notifications';
import { reviewTransitionRequestSchema } from './review';
import { createShareLinkRequestSchema } from './share';
import { registerVersionRequestSchema } from './versions';

const baseAsset = {
  id: 'a1',
  brandId: 'b1',
  kind: 'image',
  bucket: 'media-library',
  storagePath: 'b1/a1/file.png',
  fileName: 'file.png',
  mimeType: 'image/png',
  source: 'upload',
  status: 'stored',
  createdAt: '2026-07-10T00:00:00Z',
  updatedAt: '2026-07-10T00:00:00Z',
};

describe('asset schema (library v2)', () => {
  it("accepts kind 'file' for source files like .aep", () => {
    expect(mediaKindSchema.parse('file')).toBe('file');
    const parsed = mediaAssetSchema.parse({
      ...baseAsset,
      kind: 'file',
      fileName: 'project.aep',
      mimeType: 'application/octet-stream',
    });
    expect(parsed.kind).toBe('file');
  });

  it("defaults reviewStatus to 'none' for pre-v2 rows", () => {
    const parsed = mediaAssetSchema.parse(baseAsset);
    expect(parsed.reviewStatus).toBe('none');
  });
});

describe('comment annotations', () => {
  it('parses a normalized box annotation', () => {
    const parsed = commentAnnotationSchema.parse({
      kind: 'box',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
    });
    expect(parsed.kind).toBe('box');
  });

  it('parses a time annotation with an optional box', () => {
    const parsed = commentAnnotationSchema.parse({
      kind: 'time',
      timeMs: 14_000,
      box: { x: 0, y: 0, width: 0.5, height: 0.5 },
    });
    expect(parsed.kind).toBe('time');
  });

  it('rejects out-of-range box coordinates', () => {
    const result = commentAnnotationSchema.safeParse({
      kind: 'box',
      x: 1.4,
      y: 0,
      width: 0.2,
      height: 0.2,
    });
    expect(result.success).toBe(false);
  });

  it('parses a time RANGE annotation', () => {
    const parsed = commentAnnotationSchema.parse({
      kind: 'time',
      timeMs: 1_000,
      endMs: 2_500,
    });
    expect(parsed).toEqual({ kind: 'time', timeMs: 1_000, endMs: 2_500 });
  });

  it('still parses a point annotation once ranges exist', () => {
    const parsed = commentAnnotationSchema.parse({ kind: 'time', timeMs: 1_000 });
    expect('endMs' in parsed).toBe(false);
  });

  it('rejects a range that ends before it starts', () => {
    const result = commentAnnotationSchema.safeParse({
      kind: 'time',
      timeMs: 2_500,
      endMs: 1_000,
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.path).toEqual(['endMs']);
  });

  it('rejects a zero-length range (a point has no endMs)', () => {
    const result = commentAnnotationSchema.safeParse({
      kind: 'time',
      timeMs: 1_000,
      endMs: 1_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects endMs on a box annotation', () => {
    const result = commentAnnotationSchema.safeParse({
      kind: 'box',
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.2,
      endMs: 2_000,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a range annotation through the create request', () => {
    const parsed = createCommentRequestSchema.parse({
      brandId: 'b1',
      assetId: 'a1',
      body: 'tighten this stretch',
      annotation: { kind: 'time', timeMs: 1_000, endMs: 2_500 },
    });
    expect(parsed.annotation).toEqual({ kind: 'time', timeMs: 1_000, endMs: 2_500 });
  });

  it('requires a non-empty body on create', () => {
    const result = createCommentRequestSchema.safeParse({
      brandId: 'b1',
      assetId: 'a1',
      body: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an update that changes nothing', () => {
    const result = updateCommentRequestSchema.safeParse({
      brandId: 'b1',
      commentId: 'c1',
    });
    expect(result.success).toBe(false);
  });
});

describe('comment list response', () => {
  it('carries the head version id so a consumer can spot a comment on a stale cut', () => {
    const parsed = listCommentsResponseSchema.parse({ comments: [], headVersionId: 'v2' });
    expect(parsed.headVersionId).toBe('v2');
  });

  it('allows a null head version — an asset whose v1 row is not materialized yet', () => {
    const parsed = listCommentsResponseSchema.parse({ comments: [], headVersionId: null });
    expect(parsed.headVersionId).toBeNull();
  });
});

describe('review transitions', () => {
  it('accepts a valid transition request', () => {
    const parsed = reviewTransitionRequestSchema.parse({
      brandId: 'b1',
      assetId: 'a1',
      toStatus: 'approved',
      note: 'ship it',
    });
    expect(parsed.toStatus).toBe('approved');
  });

  it('rejects unknown statuses', () => {
    const result = reviewTransitionRequestSchema.safeParse({
      brandId: 'b1',
      assetId: 'a1',
      toStatus: 'signed_off',
    });
    expect(result.success).toBe(false);
  });
});

describe('share links', () => {
  it('requires assetId for asset scope', () => {
    const result = createShareLinkRequestSchema.safeParse({
      brandId: 'b1',
      scope: 'asset',
    });
    expect(result.success).toBe(false);
  });

  it('requires collectionId for collection scope', () => {
    const ok = createShareLinkRequestSchema.safeParse({
      brandId: 'b1',
      scope: 'collection',
      collectionId: 'col1',
    });
    expect(ok.success).toBe(true);
  });
});

describe('review pings + versions', () => {
  it('requires at least one recipient', () => {
    const result = reviewPingRequestSchema.safeParse({
      brandId: 'b1',
      assetId: 'a1',
      recipientUserIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a version registration', () => {
    const parsed = registerVersionRequestSchema.parse({
      brandId: 'b1',
      assetId: 'a1',
      bucket: 'media-library',
      storagePath: 'b1/a1/v2/file.png',
      fileName: 'file.png',
      mimeType: 'image/png',
      sizeBytes: 1234,
      note: 'brighter background',
    });
    expect(parsed.storagePath).toContain('/v2/');
  });
});

describe('hybrid search merge', () => {
  it('keeps keyword-only hits when other assets match semantically', () => {
    // The bug: a just-uploaded asset has no embedding yet (analysis is async), so
    // the vector search cannot see it. Running lexical only on ZERO vector hits
    // made it invisible the moment one other asset matched — you could not find
    // your own upload by its name.
    const semantic = [{ id: 'analyzed-1', similarity: 0.7 }];
    const lexical = [{ id: 'fresh-upload', similarity: 1 }];
    const merged = mergeMatches(semantic, lexical, 10);
    expect(merged.map((m) => m.id)).toEqual(['analyzed-1', 'fresh-upload']);
  });

  it('dedupes an asset found both ways, keeping its semantic score', () => {
    const merged = mergeMatches(
      [{ id: 'a', similarity: 0.8 }],
      [
        { id: 'a', similarity: 1 },
        { id: 'b', similarity: 1 },
      ],
      10,
    );
    expect(merged).toEqual([
      { id: 'a', similarity: 0.8 },
      { id: 'b', similarity: 1 },
    ]);
  });

  it('respects the limit, semantic first', () => {
    const merged = mergeMatches(
      [
        { id: 'a', similarity: 0.9 },
        { id: 'b', similarity: 0.8 },
      ],
      [{ id: 'c', similarity: 1 }],
      2,
    );
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });
});
