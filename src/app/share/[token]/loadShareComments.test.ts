import { describe, expect, it } from 'bun:test';
import type { MediaCommentRow } from '@/lib/library/comments';
import {
  MAX_THREADS_PER_ASSET,
  projectShareComments,
  type ShareCommentSource,
} from './loadShareComments';

// The library-share edge function performs the reads (scoped to the brand, the
// shown assets and versions, shared/external visibility, non-deleted rows); this
// module threads and projects them. The fixture builds what the edge returns.

const BRAND_ID = 'brand-1';
const ASSET_ID = 'asset-1';

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

function source(
  rows: MediaCommentRow[],
  authors: PermissionRow[] = [{ user_id: 'user-1', email: 'jane.doe@acme.com' }],
  externalAuthors: Array<{ id: string; display_name: string | null }> = [],
): ShareCommentSource {
  return { rows, authors, externalAuthors, attachmentPreviews: [] };
}

describe('projectShareComments', () => {
  it('returns nothing for a share with no assets', () => {
    expect(projectShareComments([], source([commentRow({ id: 'c1' })]))).toEqual([]);
  });

  it('excludes a thread whose root is resolved, including its replies', () => {
    const input = source([
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

    const comments = projectShareComments([ASSET_ID], input);

    expect(comments.map((c) => c.id)).toEqual(['open-root']);
  });

  it('includes one level of replies under an open root', () => {
    const input = source([
      commentRow({ id: 'root', body: 'Tighten the intro' }),
      commentRow({
        id: 'reply',
        parent_comment_id: 'root',
        body: 'Agreed',
        created_at: '2026-07-01T10:05:00.000Z',
      }),
    ]);

    const comments = projectShareComments([ASSET_ID], input);

    expect(comments.map((c) => c.id)).toEqual(['root', 'reply']);
    expect(comments[1]?.parentCommentId).toBe('root');
  });

  it('degrades a malformed annotation to null instead of throwing', () => {
    const input = source([
      commentRow({ id: 'bad', annotation: { kind: 'time', timeMs: 'four seconds' } }),
      commentRow({
        id: 'range',
        created_at: '2026-07-01T10:01:00.000Z',
        annotation: { kind: 'time', timeMs: 4000, endMs: 9000 },
      }),
    ]);

    const comments = projectShareComments([ASSET_ID], input);

    expect(comments.find((c) => c.id === 'bad')?.annotation).toBeNull();
    expect(comments.find((c) => c.id === 'range')?.annotation).toEqual({
      kind: 'time',
      timeMs: 4000,
      endMs: 9000,
    });
  });

  it('exposes an author name but never an email, created_by or resolved_by', () => {
    const input = source([commentRow({ id: 'c1', created_by: 'user-1' })]);

    const comments = projectShareComments([ASSET_ID], input);
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

  it('uses an external reviewer display name without exposing their email', () => {
    const input = source(
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

    const comments = projectShareComments([ASSET_ID], input);
    expect(comments[0]?.authorName).toBe('Alex Reviewer');
    expect(JSON.stringify(comments)).not.toContain('external_reviewer_session_id');
  });

  it('caps the open threads it returns per asset, keeping the newest', () => {
    const total = MAX_THREADS_PER_ASSET + 10;
    const rows = Array.from({ length: total }, (_, index) =>
      commentRow({
        id: `root-${index}`,
        created_at: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
      }),
    );

    const input = source(rows);
    const comments = projectShareComments([ASSET_ID], input);

    expect(comments).toHaveLength(MAX_THREADS_PER_ASSET);
    expect(comments[0]?.id).toBe('root-10');
    expect(comments.at(-1)?.id).toBe(`root-${total - 1}`);
  });

  it('groups comments per asset in the order the assets were shared', () => {
    const input = source([
      commentRow({ id: 'b1', asset_id: 'asset-b' }),
      commentRow({ id: 'a1', asset_id: 'asset-a' }),
    ]);

    const comments = projectShareComments(['asset-a', 'asset-b'], input);

    expect(comments.map((c) => c.assetId)).toEqual(['asset-a', 'asset-b']);
  });

  it('degrades to an empty feed when the comment read failed (no source)', () => {
    expect(projectShareComments([ASSET_ID], null)).toEqual([]);
  });
});
