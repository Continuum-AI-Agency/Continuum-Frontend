'use client';

// Brand members addressable by @mention in Library comments. Backed by the
// same GET /api/library/ping member list the review-request picker uses; the
// module-level promise cache dedupes the fetch across the several composers a
// detail modal renders (sidebar, annotation popovers, reply boxes).

import { useEffect, useState } from 'react';
import { displayNameFromEmail } from '@/lib/library/comments';

export type MentionTarget = {
  userId: string;
  /** Display label inserted into the body token. */
  label: string;
  email: string | null;
};

const CACHE_TTL_MS = 60_000;

type CacheEntry = { at: number; targets: MentionTarget[] };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<MentionTarget[]>>();

async function fetchMentionTargets(brandId: string): Promise<MentionTarget[]> {
  const response = await fetch(`/api/library/ping?brandId=${encodeURIComponent(brandId)}`);
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as {
    members?: Array<{ id: string; email: string | null }>;
  } | null;
  const members = body?.members ?? [];
  return members.map((member) => ({
    userId: member.id,
    email: member.email,
    label: displayNameFromEmail(member.email) ?? member.email ?? 'Member',
  }));
}

export async function loadMentionTargets(brandId: string): Promise<MentionTarget[]> {
  const cached = cache.get(brandId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.targets;
  const pending = inflight.get(brandId);
  if (pending) return pending;
  const promise = fetchMentionTargets(brandId)
    .then((targets) => {
      cache.set(brandId, { at: Date.now(), targets });
      return targets;
    })
    .finally(() => inflight.delete(brandId));
  inflight.set(brandId, promise);
  return promise;
}

/** Null while loading (callers render no picker yet), empty when no members. */
export function useMentionTargets(brandId: string | null | undefined): MentionTarget[] | null {
  const [targets, setTargets] = useState<MentionTarget[] | null>(null);

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void loadMentionTargets(brandId).then((result) => {
      if (!cancelled) setTargets(result);
    });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  return targets;
}
