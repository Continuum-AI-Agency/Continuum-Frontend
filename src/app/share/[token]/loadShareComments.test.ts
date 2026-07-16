import { describe, expect, it } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaCommentRow } from '@/lib/library/comments';
import { loadShareComments, MAX_THREADS_PER_ASSET } from './loadShareComments';

// The share page runs on the service-role client, so the fake stands in for the
// two reads it performs: media.comments and brand_profiles.permissions. Filter
// calls are recorded so the DB-side guards (brand scope, soft deletes) can be
// asserted, not just the JS-side ones.

const BRAND_ID = 'brand-1';
const ASSET_ID = 'asset-1';

type FilterCall = { method: string; args: unknown[] };

type PermissionRow = { user_id: string; email: string | null };

function commentRow(overrides: Partial<MediaCommentRow> & { id: string }): MediaCommentRow {
  return {
    brand_id: BRAND_ID,
    asset_id: ASSET_ID,
    version_id: null,
    parent_comment_id: null,
    body: 'Looks good',
    annotation: null,
    resolved_at: null,
    resolved_by: null,
    created_by: 'user-1',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-01T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function fakeAdmin(
  rows: MediaCommentRow[],
  permissions: PermissionRow[] = [{ user_id: 'user-1', email: 'jane.doe@acme.com' }],
  externalSessions: Array<{ id: string; display_name: string | null }> = [],
): { client: SupabaseClient; commentCalls: FilterCall[] } {
  const commentCalls: FilterCall[] = [];

  const builder = (result: { data: unknown; error: unknown }, calls?: FilterCall[]) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
      chain[method] = (...args: unknown[]) => {
        calls?.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
      resolve(result);
    return chain;
  };

  const client = {
    schema: (name: string) => ({
      from: (table: string) => {
        if (name === 'media' && table === 'comments') {
          return builder({ data: rows, error: null }, commentCalls);
        }
        if (name === 'brand_profiles' && table === 'permissions') {
          return builder({ data: permissions, error: null });
        }
        if (name === 'media' && table === 'external_reviewer_sessions') {
          return builder({ data: externalSessions, error: null });
        }
        throw new Error(`unexpected read: ${name}.${table}`);
      },
    }),
  } as unknown as SupabaseClient;

  return { client, commentCalls };
}

describe('loadShareComments', () => {
  it('skips the read entirely when the share carries no assets', async () => {
    const { client, commentCalls } = fakeAdmin([commentRow({ id: 'c1' })]);
    const comments = await loadShareComments(client, { brandId: BRAND_ID, assetIds: [] });

    expect(comments).toEqual([]);
    expect(commentCalls).toHaveLength(0);
  });

  it('scopes the read to the brand, the shared assets and non-deleted rows', async () => {
    const { client, commentCalls } = fakeAdmin([commentRow({ id: 'c1' })]);
    await loadShareComments(client, { brandId: BRAND_ID, assetIds: [ASSET_ID] });

    expect(commentCalls).toContainEqual({ method: 'eq', args: ['brand_id', BRAND_ID] });
    expect(commentCalls).toContainEqual({ method: 'in', args: ['asset_id', [ASSET_ID]] });
    expect(commentCalls).toContainEqual({
      method: 'in',
      args: ['visibility', ['shared', 'external']],
    });
    expect(commentCalls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
  });

  it('excludes a thread whose root is resolved, including its replies', async () => {
    const { client } = fakeAdmin([
      commentRow({ id: 'open-root', created_at: '2026-07-01T10:00:00.000Z' }),
      commentRow({
        id: 'resolved-root',
        created_at: '2026-07-01T11:00:00.000Z',
        resolved_at: '2026-07-02T09:00:00.000Z',
        resolved_by: 'user-1',
      }),
      commentRow({
        id: 'reply-to-resolved',
        parent_comment_id: 'resolved-root',
        created_at: '2026-07-01T11:30:00.000Z',
      }),
    ]);

    const comments = await loadShareComments(client, { brandId: BRAND_ID, assetIds: [ASSET_ID] });

    expect(comments.map((c) => c.id)).toEqual(['open-root']);
  });

  it('includes one level of replies under an open root', async () => {
    const { client } = fakeAdmin([
      commentRow({ id: 'root', body: 'Tighten the intro' }),
      commentRow({
        id: 'reply',
        parent_comment_id: 'root',
        body: 'Agreed',
        created_at: '2026-07-01T10:05:00.000Z',
      }),
    ]);

    const comments = await loadShareComments(client, { brandId: BRAND_ID, assetIds: [ASSET_ID] });

    expect(comments.map((c) => c.id)).toEqual(['root', 'reply']);
    expect(comments[1]?.parentCommentId).toBe('root');
  });

  it('degrades a malformed annotation to null instead of throwing', async () => {
    const { client } = fakeAdmin([
      commentRow({ id: 'bad', annotation: { kind: 'time', timeMs: 'four seconds' } }),
      commentRow({
        id: 'range',
        created_at: '2026-07-01T10:01:00.000Z',
        annotation: { kind: 'time', timeMs: 4000, endMs: 9000 },
      }),
    ]);

    const comments = await loadShareComments(client, { brandId: BRAND_ID, assetIds: [ASSET_ID] });

    expect(comments.find((c) => c.id === 'bad')?.annotation).toBeNull();
    expect(comments.find((c) => c.id === 'range')?.annotation).toEqual({
      kind: 'time',
      timeMs: 4000,
      endMs: 9000,
    });
  });

  it('exposes an author name but never an email, created_by or resolved_by', async () => {
    const { client } = fakeAdmin([commentRow({ id: 'c1', created_by: 'user-1' })]);

    const comments = await loadShareComments(client, { brandId: BRAND_ID, assetIds: [ASSET_ID] });
    const comment = comments[0];

    expect(comment?.authorName).toBe('Jane Doe');
    expect(Object.keys(comment ?? {}).sort()).toEqual([
      'annotation',
      'assetId',
      'authorName',
      'body',
      'createdAt',
      'id',
      'parentCommentId',
      'versionId',
    ]);
    expect(JSON.stringify(comments)).not.toContain('jane.doe@acme.com');
    expect(JSON.stringify(comments)).not.toContain('user-1');
  });

  it('uses an external reviewer display name without exposing their email', async () => {
    const { client } = fakeAdmin(
      [
        commentRow({
          id: 'external-comment',
          created_by: null,
          external_reviewer_session_id: 'reviewer-session-1',
          visibility: 'external',
        }),
      ],
      [],
      [{ id: 'reviewer-session-1', display_name: 'Alex Reviewer' }],
    );

    const comments = await loadShareComments(client, { brandId: BRAND_ID, assetIds: [ASSET_ID] });
    expect(comments[0]?.authorName).toBe('Alex Reviewer');
    expect(JSON.stringify(comments)).not.toContain('external_reviewer_session_id');
  });

  it('caps the open threads it returns per asset, keeping the newest', async () => {
    const total = MAX_THREADS_PER_ASSET + 10;
    const rows = Array.from({ length: total }, (_, index) =>
      commentRow({
        id: `root-${index}`,
        created_at: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
      }),
    );

    const { client } = fakeAdmin(rows);
    const comments = await loadShareComments(client, { brandId: BRAND_ID, assetIds: [ASSET_ID] });

    expect(comments).toHaveLength(MAX_THREADS_PER_ASSET);
    expect(comments[0]?.id).toBe('root-10');
    expect(comments.at(-1)?.id).toBe(`root-${total - 1}`);
  });

  it('groups comments per asset in the order the assets were shared', async () => {
    const { client } = fakeAdmin([
      commentRow({ id: 'b1', asset_id: 'asset-b' }),
      commentRow({ id: 'a1', asset_id: 'asset-a' }),
    ]);

    const comments = await loadShareComments(client, {
      brandId: BRAND_ID,
      assetIds: ['asset-a', 'asset-b'],
    });

    expect(comments.map((c) => c.assetId)).toEqual(['asset-a', 'asset-b']);
  });

  it('degrades to an empty feed when the comment read fails', async () => {
    const failedQuery: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'is', 'order']) {
      failedQuery[method] = () => failedQuery;
    }
    failedQuery.limit = () => Promise.resolve({ data: null, error: { message: 'boom' } });
    const client = {
      schema: () => ({
        from: () => failedQuery,
      }),
    } as unknown as SupabaseClient;

    const comments = await loadShareComments(client, { brandId: BRAND_ID, assetIds: [ASSET_ID] });

    expect(comments).toEqual([]);
  });
});
