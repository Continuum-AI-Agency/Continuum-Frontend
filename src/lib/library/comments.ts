// Client seam for Library asset comments: fetch helpers against
// /api/library/comments plus the pure row-mapping / threading / display logic
// shared by the API route, the realtime merge, and the sidebar.

import {
  type CreateCommentRequest,
  commentAnnotationSchema,
  type DeleteCommentRequest,
  listCommentsResponseSchema,
  type MediaComment,
  type UpdateCommentRequest,
} from '@continuum/contracts';
import {
  createAssetCommentOperation,
  deleteAssetCommentOperation,
  updateAssetCommentOperation,
} from '@/lib/library/creativeOperations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Snake_case shape of a media.comments row as delivered by PostgREST selects
// and realtime postgres_changes payloads (replica identity full).
export type MediaCommentRow = {
  id: string;
  brand_id: string;
  asset_id: string;
  version_id: string | null;
  parent_comment_id: string | null;
  body: string;
  annotation: unknown;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string | null;
  external_reviewer_session_id?: string | null;
  visibility?: 'internal' | 'shared' | 'external';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CommentAuthor = { name: string | null; email: string | null };

// "jane.doe+work" -> "Jane Doe". Display-only; the email stays the identity.
export function displayNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0] ?? '';
  const words = local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length > 0 ? words.join(' ') : null;
}

export function initialsFor(name: string | null | undefined): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.charAt(0) ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? '') : '';
  const initials = `${first}${last}`.toUpperCase();
  return initials || '?';
}

// A malformed annotation payload must never take the whole comment down with
// it — the comment degrades to un-annotated instead.
export function commentRowToMediaComment(
  row: MediaCommentRow,
  authors?: Map<string, CommentAuthor>,
): MediaComment {
  const parsedAnnotation = commentAnnotationSchema.safeParse(row.annotation);
  const author = row.created_by ? authors?.get(row.created_by) : undefined;
  return {
    id: row.id,
    brandId: row.brand_id,
    assetId: row.asset_id,
    versionId: row.version_id,
    parentCommentId: row.parent_comment_id,
    body: row.body,
    annotation: parsedAnnotation.success ? parsedAnnotation.data : null,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdBy: row.created_by,
    authorName: author?.name ?? displayNameFromEmail(author?.email) ?? null,
    authorEmail: author?.email ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CommentThread = { root: MediaComment; replies: MediaComment[] };

export type CommentThreadGroups = { open: CommentThread[]; resolved: CommentThread[] };

// Top-level comments become thread roots (createdAt ascending, newest last);
// replies nest one level under their parent. A reply whose parent is missing
// (deleted upstream) is promoted to a root so it never silently disappears.
export function buildCommentThreads(comments: MediaComment[]): CommentThreadGroups {
  const byCreated = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rootIds = new Set(byCreated.filter((c) => !c.parentCommentId).map((c) => c.id));
  const threads = new Map<string, CommentThread>();

  for (const comment of byCreated) {
    const parentId = comment.parentCommentId;
    if (!parentId || !rootIds.has(parentId)) {
      threads.set(comment.id, { root: comment, replies: [] });
    }
  }
  for (const comment of byCreated) {
    const parentId = comment.parentCommentId;
    if (parentId && rootIds.has(parentId)) {
      threads.get(parentId)?.replies.push(comment);
    }
  }

  const all = Array.from(threads.values());
  return {
    open: all.filter((t) => !t.root.resolvedAt),
    resolved: all.filter((t) => Boolean(t.root.resolvedAt)),
  };
}

// Insert-or-replace by id, keeping createdAt order stable for equal ids.
export function upsertComment(list: MediaComment[], incoming: MediaComment): MediaComment[] {
  const index = list.findIndex((c) => c.id === incoming.id);
  if (index === -1) return [...list, incoming];
  const next = [...list];
  next[index] = incoming;
  return next;
}

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: string };
      detail = body.error ? `: ${body.error}` : '';
    } catch {
      // non-JSON error body; status alone is the message
    }
    throw new Error(`Comment request failed (${response.status})${detail}`);
  }
  return response.json();
}

export type AssetCommentsSnapshot = {
  comments: MediaComment[];
  // The version the asset's file currently comes from, so a caller can tell a
  // comment written on what it is showing from one written on a superseded cut.
  // Null only while the asset's v1 row has not been materialized yet.
  headVersionId: string | null;
};

export async function listCommentsWithVersion(
  brandId: string,
  assetId: string,
): Promise<AssetCommentsSnapshot> {
  const params = new URLSearchParams({ brandId, assetId });
  const response = await fetch(`/api/library/comments?${params.toString()}`);
  const parsed = listCommentsResponseSchema.parse(await parseJsonOrThrow(response));
  return { comments: parsed.comments, headVersionId: parsed.headVersionId ?? null };
}

export async function listComments(brandId: string, assetId: string): Promise<MediaComment[]> {
  const snapshot = await listCommentsWithVersion(brandId, assetId);
  return snapshot.comments;
}

export async function createComment(input: CreateCommentRequest): Promise<MediaComment> {
  return createAssetCommentOperation(createSupabaseBrowserClient(), {
    ...input,
    idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
  });
}

export async function updateComment(input: UpdateCommentRequest): Promise<MediaComment> {
  return updateAssetCommentOperation(createSupabaseBrowserClient(), input);
}

export async function deleteComment(input: DeleteCommentRequest): Promise<void> {
  await deleteAssetCommentOperation(createSupabaseBrowserClient(), input);
}
