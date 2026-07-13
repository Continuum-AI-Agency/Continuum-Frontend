import { afterEach, describe, expect, test } from 'bun:test';
import type { MediaComment } from '@continuum/contracts';
import {
  buildCommentThreads,
  commentRowToMediaComment,
  displayNameFromEmail,
  initialsFor,
  listComments,
  listCommentsWithVersion,
  type MediaCommentRow,
  upsertComment,
} from './comments';

function makeRow(overrides: Partial<MediaCommentRow> = {}): MediaCommentRow {
  return {
    id: 'c1',
    brand_id: 'brand-1',
    asset_id: 'asset-1',
    version_id: null,
    parent_comment_id: null,
    body: 'Looks great',
    annotation: null,
    resolved_at: null,
    resolved_by: null,
    created_by: 'user-1',
    created_at: '2026-07-10T10:00:00Z',
    updated_at: '2026-07-10T10:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function makeComment(overrides: Partial<MediaComment> = {}): MediaComment {
  return {
    id: 'c1',
    brandId: 'brand-1',
    assetId: 'asset-1',
    versionId: null,
    parentCommentId: null,
    body: 'Looks great',
    annotation: null,
    resolvedAt: null,
    resolvedBy: null,
    createdBy: 'user-1',
    authorName: null,
    authorEmail: null,
    createdAt: '2026-07-10T10:00:00Z',
    updatedAt: '2026-07-10T10:00:00Z',
    ...overrides,
  };
}

describe('displayNameFromEmail', () => {
  test('prettifies the local part', () => {
    expect(displayNameFromEmail('jane.doe@acme.com')).toBe('Jane Doe');
    expect(displayNameFromEmail('duane+work@continuumai.agency')).toBe('Duane Work');
    expect(displayNameFromEmail('bob@x.io')).toBe('Bob');
  });

  test('returns null for missing or empty email', () => {
    expect(displayNameFromEmail(null)).toBeNull();
    expect(displayNameFromEmail(undefined)).toBeNull();
    expect(displayNameFromEmail('@acme.com')).toBeNull();
  });
});

describe('initialsFor', () => {
  test('first and last word initials', () => {
    expect(initialsFor('Jane Doe')).toBe('JD');
    expect(initialsFor('Jane Ann Doe')).toBe('JD');
    expect(initialsFor('Jane')).toBe('J');
  });

  test('falls back to ? without a name', () => {
    expect(initialsFor(null)).toBe('?');
    expect(initialsFor('   ')).toBe('?');
  });
});

describe('commentRowToMediaComment', () => {
  test('maps snake_case row to the contract shape', () => {
    const comment = commentRowToMediaComment(
      makeRow({
        annotation: { kind: 'box', x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        parent_comment_id: 'c0',
      }),
    );
    expect(comment.id).toBe('c1');
    expect(comment.brandId).toBe('brand-1');
    expect(comment.assetId).toBe('asset-1');
    expect(comment.parentCommentId).toBe('c0');
    expect(comment.annotation).toEqual({ kind: 'box', x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  test('resolves author name/email from the authors map', () => {
    const authors = new Map([['user-1', { name: null, email: 'jane.doe@acme.com' }]]);
    const comment = commentRowToMediaComment(makeRow(), authors);
    expect(comment.authorEmail).toBe('jane.doe@acme.com');
    expect(comment.authorName).toBe('Jane Doe');
  });

  test('a malformed annotation degrades to null instead of throwing', () => {
    const comment = commentRowToMediaComment(makeRow({ annotation: { kind: 'blob', x: 99 } }));
    expect(comment.annotation).toBeNull();
  });

  test('a time range survives the round trip', () => {
    const comment = commentRowToMediaComment(
      makeRow({ annotation: { kind: 'time', timeMs: 1000, endMs: 4000 } }),
    );
    expect(comment.annotation).toEqual({ kind: 'time', timeMs: 1000, endMs: 4000 });
  });

  // jsonb is unvalidated at the DB level, so a row written by an older client,
  // a bad MCP call, or a hand-edited record can carry any shape at all.
  test('a malformed endMs degrades the annotation to null instead of throwing', () => {
    const inverted = commentRowToMediaComment(
      makeRow({ annotation: { kind: 'time', timeMs: 5000, endMs: 1000 } }),
    );
    expect(inverted.annotation).toBeNull();
    expect(inverted.body).toBe('Looks great');

    const stringly = commentRowToMediaComment(
      makeRow({ annotation: { kind: 'time', timeMs: 5000, endMs: '9000' } }),
    );
    expect(stringly.annotation).toBeNull();

    const equal = commentRowToMediaComment(
      makeRow({ annotation: { kind: 'time', timeMs: 5000, endMs: 5000 } }),
    );
    expect(equal.annotation).toBeNull();
  });

  test('time annotations with a box survive the round trip', () => {
    const comment = commentRowToMediaComment(
      makeRow({
        annotation: { kind: 'time', timeMs: 4200, box: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      }),
    );
    expect(comment.annotation).toEqual({
      kind: 'time',
      timeMs: 4200,
      box: { x: 0, y: 0, width: 0.5, height: 0.5 },
    });
  });
});

describe('buildCommentThreads', () => {
  test('groups replies under their root, ordered by createdAt', () => {
    const comments = [
      makeComment({ id: 'r2', createdAt: '2026-07-10T12:00:00Z' }),
      makeComment({ id: 'r1', createdAt: '2026-07-10T10:00:00Z' }),
      makeComment({
        id: 'r1-b',
        parentCommentId: 'r1',
        createdAt: '2026-07-10T11:30:00Z',
      }),
      makeComment({
        id: 'r1-a',
        parentCommentId: 'r1',
        createdAt: '2026-07-10T10:30:00Z',
      }),
    ];
    const { open, resolved } = buildCommentThreads(comments);
    expect(resolved).toHaveLength(0);
    expect(open.map((t) => t.root.id)).toEqual(['r1', 'r2']);
    expect(open[0]?.replies.map((r) => r.id)).toEqual(['r1-a', 'r1-b']);
  });

  test('resolved roots partition into the resolved group with their replies', () => {
    const comments = [
      makeComment({ id: 'r1', resolvedAt: '2026-07-10T12:00:00Z' }),
      makeComment({ id: 'r1-a', parentCommentId: 'r1', createdAt: '2026-07-10T11:00:00Z' }),
      makeComment({ id: 'r2', createdAt: '2026-07-10T13:00:00Z' }),
    ];
    const { open, resolved } = buildCommentThreads(comments);
    expect(open.map((t) => t.root.id)).toEqual(['r2']);
    expect(resolved.map((t) => t.root.id)).toEqual(['r1']);
    expect(resolved[0]?.replies.map((r) => r.id)).toEqual(['r1-a']);
  });

  test('orphan replies are promoted to roots instead of vanishing', () => {
    const comments = [makeComment({ id: 'orphan', parentCommentId: 'gone' })];
    const { open } = buildCommentThreads(comments);
    expect(open.map((t) => t.root.id)).toEqual(['orphan']);
  });
});

describe('upsertComment', () => {
  test('appends unknown ids and replaces known ids in place', () => {
    const a = makeComment({ id: 'a' });
    const b = makeComment({ id: 'b' });
    const appended = upsertComment([a], b);
    expect(appended.map((c) => c.id)).toEqual(['a', 'b']);

    const edited = upsertComment(appended, makeComment({ id: 'a', body: 'edited' }));
    expect(edited.map((c) => c.id)).toEqual(['a', 'b']);
    expect(edited[0]?.body).toBe('edited');
  });
});

describe('listCommentsWithVersion', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubFetch(payload: unknown) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
  }

  test('surfaces the head version id alongside the comments', async () => {
    stubFetch({ comments: [makeComment({ id: 'c1', versionId: 'v1' })], headVersionId: 'v2' });

    const snapshot = await listCommentsWithVersion('brand-1', 'asset-1');
    expect(snapshot.headVersionId).toBe('v2');
    expect(snapshot.comments.map((c) => c.id)).toEqual(['c1']);
  });

  test('normalizes a missing head version to null', async () => {
    stubFetch({ comments: [] });

    const snapshot = await listCommentsWithVersion('brand-1', 'asset-1');
    expect(snapshot.headVersionId).toBeNull();
  });

  test('listComments keeps its array shape for existing callers', async () => {
    stubFetch({ comments: [makeComment({ id: 'c1' })], headVersionId: 'v1' });

    const comments = await listComments('brand-1', 'asset-1');
    expect(comments.map((c) => c.id)).toEqual(['c1']);
  });
});
