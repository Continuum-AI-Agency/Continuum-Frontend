'use client';

// A brand's labels and colours for the review states, and its custom states, for
// every surface that shows a status (detail control, board columns, filters). One
// fetch per brand per page load, shared by every caller; saving through
// setBrandReviewStates updates every mounted surface at once. Until the fetch
// lands (or if it fails) the defaults show, so a status is never unlabeled.

import {
  DEFAULT_REVIEW_STATE_LABELS,
  type MediaReviewStatus,
  type ReviewCustomState,
  type ReviewStateLabel,
  resolveReviewStateLabels,
} from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { type BrandReviewStates, fetchReviewStateLabels } from '@/lib/library/review';

type Labels = Record<MediaReviewStatus, ReviewStateLabel>;

const DEFAULTS: Labels = resolveReviewStateLabels(DEFAULT_REVIEW_STATE_LABELS);
const NO_CUSTOM_STATES: ReviewCustomState[] = [];
const cache = new Map<string, Labels>();
const customCache = new Map<string, ReviewCustomState[]>();
const customizedCache = new Map<string, ReadonlySet<MediaReviewStatus> | null>();
const NO_CUSTOMIZED_STATES: ReadonlySet<MediaReviewStatus> = new Set();
const STATUS_COPY = {
  none: 'reviewStatusNone',
  draft: 'reviewStatusDraft',
  in_review: 'reviewStatusInReview',
  needs_changes: 'reviewStatusNeedsChanges',
  approved: 'reviewStatusApproved',
} as const;
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setBrandReviewStates(brandId: string, states: BrandReviewStates) {
  cache.set(brandId, resolveReviewStateLabels(states.labels));
  // An older server cannot identify authored labels; preserve all of its copy.
  customizedCache.set(
    brandId,
    states.customizedStates === undefined ? null : new Set(states.customizedStates),
  );
  customCache.set(
    brandId,
    [...states.customStates].sort((a, b) => a.position - b.position),
  );
  notify();
}

function load(brandId: string) {
  if (cache.has(brandId) || inflight.has(brandId)) return;
  inflight.set(
    brandId,
    fetchReviewStateLabels(brandId)
      .then((states) => setBrandReviewStates(brandId, states))
      .catch((error: unknown) => console.warn('[review labels] load failed', error))
      .finally(() => inflight.delete(brandId)),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useReviewStateLabels(brandId: string | null | undefined): Labels {
  const t = useTranslations('library');
  useEffect(() => {
    if (brandId) load(brandId);
  }, [brandId]);
  const labels = useSyncExternalStore(
    subscribe,
    () => (brandId ? (cache.get(brandId) ?? DEFAULTS) : DEFAULTS),
    () => DEFAULTS,
  );
  const customized =
    brandId && cache.has(brandId) ? customizedCache.get(brandId) : NO_CUSTOMIZED_STATES;
  return useMemo(() => {
    if (customized == null) return labels;
    const localized = { ...labels };
    for (const state of Object.keys(STATUS_COPY) as MediaReviewStatus[]) {
      if (!customized.has(state)) {
        localized[state] = { ...labels[state], label: t(STATUS_COPY[state]) };
      }
    }
    return localized;
  }, [labels, customized, t]);
}

/** The brand's custom states, ordered by position; [] until loaded. */
export function useReviewCustomStates(brandId: string | null | undefined): ReviewCustomState[] {
  useEffect(() => {
    if (brandId) load(brandId);
  }, [brandId]);
  return useSyncExternalStore(
    subscribe,
    () => (brandId ? (customCache.get(brandId) ?? NO_CUSTOM_STATES) : NO_CUSTOM_STATES),
    () => NO_CUSTOM_STATES,
  );
}
