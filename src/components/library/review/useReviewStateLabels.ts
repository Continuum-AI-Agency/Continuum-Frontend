'use client';

// A brand's labels and colours for the review states, for every surface that
// shows a status (detail control, board columns, filters). One fetch per brand
// per page load, shared by every caller; saving through setBrandReviewLabels
// updates every mounted surface at once. Until the fetch lands (or if it fails)
// the defaults show, so a status is never unlabeled.

import {
  DEFAULT_REVIEW_STATE_LABELS,
  type MediaReviewStatus,
  type ReviewStateLabel,
  resolveReviewStateLabels,
} from '@continuum/contracts';
import { useEffect, useSyncExternalStore } from 'react';
import { fetchReviewStateLabels } from '@/lib/library/review';

type Labels = Record<MediaReviewStatus, ReviewStateLabel>;

const DEFAULTS: Labels = resolveReviewStateLabels(DEFAULT_REVIEW_STATE_LABELS);
const cache = new Map<string, Labels>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setBrandReviewLabels(brandId: string, labels: ReviewStateLabel[]) {
  cache.set(brandId, resolveReviewStateLabels(labels));
  notify();
}

function load(brandId: string) {
  if (cache.has(brandId) || inflight.has(brandId)) return;
  inflight.set(
    brandId,
    fetchReviewStateLabels(brandId)
      .then((labels) => setBrandReviewLabels(brandId, labels))
      .catch((error: unknown) => console.warn('[review labels] load failed', error))
      .finally(() => inflight.delete(brandId)),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReviewStateLabels(brandId: string | null | undefined): Labels {
  useEffect(() => {
    if (brandId) load(brandId);
  }, [brandId]);
  return useSyncExternalStore(
    subscribe,
    () => (brandId ? (cache.get(brandId) ?? DEFAULTS) : DEFAULTS),
    () => DEFAULTS,
  );
}
