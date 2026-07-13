// Which comments belong to the version on the stage. A comment is pinned to the
// version it was written on, and its annotation only means anything against that
// version's bytes: a box drawn on v1 addresses v1's crop, and a timeMs addresses
// v1's cut. Painting either over v2 points at the wrong pixels and the wrong
// frame, so the stage may only draw the comments the reviewer is actually
// looking at — everything else degrades to a thread with no pin.
//
// Pure on purpose: this rule is the whole feature, so it is tested without a DOM.

import type { MediaComment } from '@continuum/contracts';
import type { CommentThread, CommentThreadGroups } from '@/lib/library/comments';

// Rows written before comments carried a version pin have `versionId === null`.
// They are anchored to the head: that is where they are drawn today, and it is
// the only version their annotation could plausibly have addressed. Anchoring
// them anywhere else would either hide every legacy comment behind the expander
// or move its pin onto a version nobody chose.
export function anchorVersionId(
  comment: MediaComment,
  headVersionId: string | null,
): string | null {
  return comment.versionId ?? headVersionId;
}

export type VersionPartitionedThreads = {
  /** Threads written on the version currently on the stage. Only these may draw pins. */
  current: CommentThreadGroups;
  /** Threads written on any other version, oldest first. Rendered thread-only, never pinned. */
  otherVersions: CommentThread[];
  /** Comments (roots plus replies) inside `otherVersions`, for the expander's count. */
  otherVersionCommentCount: number;
};

// A thread belongs to the version its ROOT was written on; replies travel with
// their root. A reply typed while v2 is on screen is still part of a
// conversation about v1, and splitting it off would orphan it from the comment
// it answers.
export function partitionThreadsByVersion(params: {
  threads: CommentThreadGroups;
  viewedVersionId: string | null;
  headVersionId: string | null;
}): VersionPartitionedThreads {
  const { threads, viewedVersionId, headVersionId } = params;

  // No version identity exists yet — the asset was never re-uploaded, or the
  // version list has not landed. There is nothing to partition against, and
  // hiding comments on a guess is worse than showing them all where they are.
  if (headVersionId === null && viewedVersionId === null) {
    return { current: threads, otherVersions: [], otherVersionCommentCount: 0 };
  }

  const onViewedVersion = (thread: CommentThread): boolean =>
    anchorVersionId(thread.root, headVersionId) === viewedVersionId;

  const otherVersions = [...threads.open, ...threads.resolved]
    .filter((thread) => !onViewedVersion(thread))
    .sort((a, b) => a.root.createdAt.localeCompare(b.root.createdAt));

  return {
    current: {
      open: threads.open.filter(onViewedVersion),
      resolved: threads.resolved.filter(onViewedVersion),
    },
    otherVersions,
    otherVersionCommentCount: otherVersions.reduce(
      (total, thread) => total + 1 + thread.replies.length,
      0,
    ),
  };
}

// Comment counts per version for the rail badges — the point of the feature is
// that an older conversation stays discoverable, and a "3" on v1 is what makes
// someone click it. Counted by the same rule the partition uses, so the badge
// and the expander can never disagree.
export function countThreadCommentsByVersion(params: {
  threads: CommentThreadGroups;
  headVersionId: string | null;
}): Map<string, number> {
  const counts = new Map<string, number>();
  for (const thread of [...params.threads.open, ...params.threads.resolved]) {
    const versionId = anchorVersionId(thread.root, params.headVersionId);
    // An asset with no version rows has no id to key a badge on; its single
    // implicit card sits beside the sidebar that already lists every comment.
    if (versionId === null) continue;
    counts.set(versionId, (counts.get(versionId) ?? 0) + 1 + thread.replies.length);
  }
  return counts;
}
