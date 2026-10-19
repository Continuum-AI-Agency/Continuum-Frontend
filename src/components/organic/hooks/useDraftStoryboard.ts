'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ChatMedia,
  mediaFromPreviewUrls,
  type PreviewMediaStage,
  resolveMediaKind,
} from '@/components/chat/media/media';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
} from '@/components/organic/primitives/types';
import { request } from '@/lib/api/http';
import {
  mapPersistedRowToCalendarEntry,
  type PersistedOrganicDraftRow,
  resolvePersistedRowDayId,
} from '@/lib/organic/calendar-draft-persistence';
import { signMediaAsset, signOrganicMediaAsset } from '@/lib/organic/hyperframeSign';
import { useCalendarStore } from '@/lib/organic/store';

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// A fan-out post is N rows collapsed into one calendar card, so a chat card holding a
// sibling's row id must still find it through groupMembers.
function matchesDraft(draft: OrganicCalendarDraft, draftId: string): boolean {
  return (
    draft.id === draftId ||
    draft.backendDraftId === draftId ||
    (draft.groupMembers ?? []).some((member) => member.backendDraftId === draftId)
  );
}

// Signed http(s) URLs only: base64 is never surfaced in the chat, and a bare storage path
// (what `assetUrl` falls back to) is a durable reference, not something to render.
function isRenderableUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

const isStoragePath = (value: string | null | undefined): value is string =>
  hasText(value) && !/^(https?:|data:)/i.test(value);

export function selectDraftById(
  days: { slots: OrganicCalendarDraft[] }[],
  backlog: OrganicCalendarDraft[],
  draftId: string | null | undefined,
): OrganicCalendarDraft | undefined {
  if (!draftId) return undefined;
  return (
    days.flatMap((day) => day.slots).find((slot) => matchesDraft(slot, draftId)) ??
    backlog.find((slot) => matchesDraft(slot, draftId))
  );
}

/** storagePath → a URL minted this session. Wins over whatever the draft carried. */
export type FreshUrls = Readonly<Record<string, string>>;

const NO_FRESH_URLS: FreshUrls = {};

/** The 512px blueprint storyboard, as renderable URLs. */
export function draftStoryboardUrls(
  draft: OrganicCalendarDraft | null | undefined,
  fresh: FreshUrls = NO_FRESH_URLS,
): string[] {
  return (draft?.mediaSuggestion?.storyboard ?? [])
    .map(
      (frame) => (frame?.storagePath ? fresh[frame.storagePath] : undefined) ?? frame?.storageUrl,
    )
    .filter(isRenderableUrl);
}

const FINAL_MEDIA_STATUSES = new Set(['ready', 'user_supplied']);

/**
 * The draft's final media, videos included. Empty until the media is final, so the card
 * keeps the blueprint storyboard until something better exists. Precedence mirrors
 * `resolveDraftMedia`: durable publishingAssets, then the generated reel, then the
 * suggestion's own primary URL. The old image-only filter dropped every finished reel.
 */
export function draftRealizedMedia(
  draft: OrganicCalendarDraft | null | undefined,
  idPrefix: string,
  fresh: FreshUrls = NO_FRESH_URLS,
): ChatMedia[] {
  const suggestion = draft?.mediaSuggestion;
  if (!draft || !FINAL_MEDIA_STATUSES.has(suggestion?.mediaStatus ?? '')) return [];
  const name = hasText(draft.title) ? draft.title : undefined;
  const poster = hasText(suggestion?.reel?.thumbnailUrl) ? suggestion.reel.thumbnailUrl : undefined;

  const assets = [...(draft.publishingAssets ?? [])]
    .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999))
    .map((asset) => ({ asset, url: fresh[asset.storagePath] ?? asset.storageUrl }))
    .filter((entry): entry is { asset: typeof entry.asset; url: string } =>
      isRenderableUrl(entry.url),
    );
  if (assets.length > 0) {
    return assets.map(({ asset, url }, index) => ({
      id: `${idPrefix}:${index}`,
      url,
      kind: asset.kind === 'video' ? 'video' : 'image',
      ...(asset.kind === 'video' && poster ? { thumbnailUrl: poster } : {}),
      ...(name ? { name } : {}),
    }));
  }

  const reel = suggestion?.reel;
  const reelUrl = reel?.generated
    ? ((reel.url ? fresh[reel.url] : undefined) ?? reel.signedUrl)
    : null;
  if (isRenderableUrl(reelUrl)) {
    return [
      {
        id: `${idPrefix}:0`,
        url: reelUrl,
        kind: 'video',
        ...(poster ? { thumbnailUrl: poster } : {}),
        ...(name ? { name } : {}),
      },
    ];
  }

  const primaryPath = isStoragePath(suggestion?.url) ? suggestion.url : null;
  const primary =
    (primaryPath ? fresh[primaryPath] : undefined) ??
    [suggestion?.signedUrl, suggestion?.assetUrl].find(isRenderableUrl);
  if (!isRenderableUrl(primary)) return [];
  return [
    {
      id: `${idPrefix}:0`,
      url: primary,
      kind: resolveMediaKind({
        mimeType: suggestion?.mimeType,
        format: draft.format,
        url: primary,
      }),
      ...(name ? { name } : {}),
    },
  ];
}

type DurableRef = { path: string; bucket?: string | null; assetId?: string | null };

// Every bucket+path pair the chat card can show. Persisted drafts hold only these; the
// URL beside each is a 1h signature that was already stale when it was written.
function durableRefs(draft: OrganicCalendarDraft): DurableRef[] {
  const refs: DurableRef[] = [];
  for (const frame of draft.mediaSuggestion?.storyboard ?? []) {
    if (hasText(frame?.storagePath) && hasText(frame.bucket)) {
      refs.push({ path: frame.storagePath, bucket: frame.bucket });
    }
  }
  for (const asset of draft.publishingAssets ?? []) {
    if (hasText(asset.storagePath) && (hasText(asset.assetId) || hasText(asset.bucket))) {
      refs.push({ path: asset.storagePath, bucket: asset.bucket, assetId: asset.assetId });
    }
  }
  const suggestion = draft.mediaSuggestion;
  const reel = suggestion?.reel;
  if (reel?.generated && isStoragePath(reel.url) && hasText(reel.bucket)) {
    refs.push({ path: reel.url, bucket: reel.bucket });
  }
  // A single-image draft keeps its durable pair on the suggestion itself.
  if (isStoragePath(suggestion?.url) && hasText(suggestion?.bucket)) {
    refs.push({ path: suggestion.url, bucket: suggestion.bucket });
  }
  return refs;
}

async function signRefs(brandId: string, refs: DurableRef[]): Promise<Record<string, string>> {
  const pairs = await Promise.all(
    refs.map(async (ref) => {
      const url = hasText(ref.assetId)
        ? await signMediaAsset({ brandId, assetId: ref.assetId })
        : await signOrganicMediaAsset({ brandId, bucket: ref.bucket ?? '', path: ref.path });
      return url ? ([ref.path, url] as const) : null;
    }),
  );
  return Object.fromEntries(pairs.filter((pair) => pair !== null));
}

/**
 * One draft by id over the Backend, for a chat card whose draft is not in the calendar
 * store. The single-draft route returns the raw row (not re-signed), so the caller signs
 * its durable pairs before showing anything.
 */
type FetchedDraft = { draft: OrganicCalendarDraft; brandId: string | null };

// Every card showing a draft shares one GET: a ConceptCard and its PipelineCard ask for
// the same id, and a restored thread mounts them together. A miss is not kept, so a later
// recovery can ask again.
const draftFetches = new Map<string, Promise<FetchedDraft | null>>();

/** Drop every shared draft fetch. For tests and for teardown on a brand switch. */
export function resetDraftFetches(): void {
  draftFetches.clear();
}

export function fetchDraftById(draftId: string): Promise<FetchedDraft | null> {
  const pending = draftFetches.get(draftId);
  if (pending) return pending;
  const fetching = loadDraftById(draftId).then((result) => {
    if (!result) draftFetches.delete(draftId);
    return result;
  });
  draftFetches.set(draftId, fetching);
  return fetching;
}

async function loadDraftById(draftId: string): Promise<FetchedDraft | null> {
  try {
    // The route returns the whole row; brand_id is what signing its media needs.
    const row = await request<PersistedOrganicDraftRow & { brand_id?: string | null }>({
      path: `/api/organic/calendar/drafts/${encodeURIComponent(draftId)}`,
    });
    const day: OrganicCalendarDay = {
      id: resolvePersistedRowDayId(row),
      label: '',
      dateLabel: '',
      suggestedTimes: [],
      slots: [],
    };
    const draft = mapPersistedRowToCalendarEntry(row, [day])?.draft;
    return draft ? { draft, brandId: row.brand_id ?? null } : null;
  } catch {
    return null;
  }
}

// ponytail: fixed grace for the calendar's first hydration (the store has no hydrated
// flag). A tile error skips it. Replace with a store flag if the chat ever mounts alone.
export const STORE_GRACE_MS = 1_500;

export type DraftChatMedia = {
  storyboard: string[];
  realized: ChatMedia[];
  /** A tile failed: fetch the draft now if it is missing, and re-sign its pairs. */
  recover: () => void;
  /** The preview on screen failed: rank it below the draft until a new preview arrives. */
  previewSuspect: boolean;
  /** The draft is still being looked up or signed: its media may yet arrive. */
  pending: boolean;
};

/**
 * A chat card's draft media, looked up by id — never through what the calendar is
 * showing. The calendar store answers first (it holds every draft, re-signed on load);
 * a draft it lacks is fetched by id. A tile that fails re-signs every durable pair.
 */
export function useDraftChatMedia(
  draftId: string | null | undefined,
  preview?: unknown,
): DraftChatMedia {
  const storeDraft = useCalendarStore((state) =>
    selectDraftById(state.days, state.backlogDrafts, draftId),
  );
  const storeBrandId = useCalendarStore((state) => state.accountContext?.brandId ?? null);
  const [fetched, setFetched] = useState<{
    id: string;
    draft: OrganicCalendarDraft;
    brandId: string | null;
  } | null>(null);
  const [fresh, setFresh] = useState<{ id: string; urls: FreshUrls } | null>(null);
  const [recoverRound, setRecoverRound] = useState(0);
  // Suspicion is tied to the preview object that was showing, so the next live frame
  // (a new object from the reducer) is trusted again.
  const [suspectPreview, setSuspectPreview] = useState<unknown>(undefined);
  // The id whose fetch came back empty (404, a teammate's draft): nothing more is coming.
  const [missingId, setMissingId] = useState<string | null>(null);

  const fetchedDraft = fetched && fetched.id === draftId ? fetched.draft : null;
  const draft = storeDraft ?? fetchedDraft;
  const brandId = (fetchedDraft && !storeDraft ? fetched?.brandId : null) ?? storeBrandId;

  useEffect(() => {
    if (!draftId || storeDraft || fetchedDraft) return;
    let cancelled = false;
    const load = () => {
      void fetchDraftById(draftId).then((result) => {
        if (cancelled) return;
        if (result) setFetched({ id: draftId, ...result });
        else setMissingId(draftId);
      });
    };
    const timer = recoverRound > 0 ? null : setTimeout(load, STORE_GRACE_MS);
    if (!timer) load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [draftId, storeDraft, fetchedDraft, recoverRound]);

  // A fetched row was never re-signed; a store draft was, at calendar load. Either way a
  // failed tile means the signature lapsed, so recovery re-signs.
  const needsSign = (!storeDraft && Boolean(fetchedDraft)) || recoverRound > 0;
  useEffect(() => {
    if (!draft || !draftId || !brandId || !needsSign) return;
    const refs = durableRefs(draft);
    if (refs.length === 0) return;
    let cancelled = false;
    void signRefs(brandId, refs).then((urls) => {
      // Recorded even when empty: it is also the "signing finished" signal.
      if (!cancelled) setFresh({ id: draftId, urls });
    });
    return () => {
      cancelled = true;
    };
    // recoverRound re-runs it: signing is cached + de-duplicated per pair, so a burst of
    // failing tiles still costs one POST per pair.
  }, [draft, draftId, brandId, needsSign, recoverRound]);

  const recover = useCallback(() => {
    setRecoverRound((round) => round + 1);
    setSuspectPreview(preview);
  }, [preview]);
  const signed = fresh && fresh.id === draftId ? fresh : null;
  const urls = signed?.urls ?? NO_FRESH_URLS;
  // A fetched row's URLs were dead when the row was read: show none of them until its
  // pairs come back signed, rather than mount tiles on signatures that already lapsed.
  const signable = useMemo(
    () => Boolean(draft && brandId && durableRefs(draft).length > 0),
    [draft, brandId],
  );
  const awaitingSign = !storeDraft && Boolean(fetchedDraft) && signable && !signed;
  const shown = awaitingSign ? null : draft;
  const storyboard = useMemo(() => draftStoryboardUrls(shown, urls), [shown, urls]);
  const realized = useMemo(
    () => draftRealizedMedia(shown, `draft:${draftId ?? ''}`, urls),
    [shown, draftId, urls],
  );
  const pending = Boolean(draftId) && ((!draft && missingId !== draftId) || awaitingSign);
  const previewSuspect = preview != null && suspectPreview === preview;
  return { storyboard, realized, recover, previewSuspect, pending };
}

export type CardMediaSource = 'realized' | 'live' | 'storyboard' | 'stale';

/**
 * Which media a chat card shows, best first: the draft's final media, the live preview
 * frame, the draft's durable storyboard, and only then a preview persisted into the
 * transcript. A persisted preview is a 1h signature replayed from history — stale on
 * arrival — so it must never outrank media the draft can re-sign.
 */
export function rankCardMedia({
  idPrefix,
  realized,
  preview,
  previewStale,
  previewStage = 'storyboard',
  storyboard,
  format,
}: {
  idPrefix: string;
  realized: ChatMedia[];
  preview: readonly string[];
  previewStale: boolean;
  previewStage?: PreviewMediaStage;
  storyboard: readonly string[];
  format?: string | null;
}): { source: CardMediaSource; media: ChatMedia[] } {
  if (realized.length > 0) return { source: 'realized', media: realized };
  const previews = (urls: readonly string[], stage: PreviewMediaStage = 'storyboard') =>
    mediaFromPreviewUrls(idPrefix, urls, format, stage).map((media, index, all) => ({
      ...media,
      name: `${format ?? 'Post'} preview ${index + 1} of ${all.length}`,
    }));
  if (preview.length > 0 && !previewStale) {
    return { source: 'live', media: previews(preview, previewStage) };
  }
  if (storyboard.length > 0) return { source: 'storyboard', media: previews(storyboard) };
  return { source: 'stale', media: previews(preview, previewStage) };
}
