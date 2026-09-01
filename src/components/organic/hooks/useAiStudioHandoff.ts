'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { useToast } from '@/components/ui/ToastProvider';
import {
  AI_STUDIO_CONTEXT_STORAGE_PREFIX,
  brandStorageKeyAiStudioLastDraft,
  buildAiStudioHandoffStorageCandidates,
  buildAiStudioStorageKey,
  buildPendingApplyStorageKey,
  buildSessionHistoryStorageKey,
  deriveCarouselSlideSeeds,
  normalizeDraftPostType,
  type PlannerAiStudioHandoff,
  type PlannerAiStudioRevision,
  plannerAiStudioApplyResponseSchema,
  plannerAiStudioHandoffSchema,
  resolveWorkflowConcept,
} from '@/lib/organic/ai-studio-bridge';
import { resolveCarouselSlideCount } from '@/lib/organic/carousel';
import { getLocalStorageJSON, removeLocalStorage, setLocalStorageJSON } from '@/lib/storage';
import * as storeRegistry from '@/lib/storage/storeRegistry';
import { brandStorageKeyAiStudioKeyIndex, migrateLegacyAiStudioKeyIndex } from '@/lib/storage-keys';
import type { OrganicCalendarDraft } from '../primitives/types';

function readDraftKeyIndex(brandId: string): string[] {
  if (!brandId) return [];
  migrateLegacyAiStudioKeyIndex(brandId);
  return getLocalStorageJSON<string[]>(brandStorageKeyAiStudioKeyIndex(brandId), []);
}

function registerDraftKey(brandId: string, storageKey: string): void {
  if (!brandId) return;
  const index = readDraftKeyIndex(brandId);
  if (!index.includes(storageKey)) {
    setLocalStorageJSON(brandStorageKeyAiStudioKeyIndex(brandId), [...index, storageKey]);
  }
}

function pruneStaleAiStudioContextEntries(brandId: string, activeDraftId: string): void {
  if (!brandId) return;
  const activeKey = buildAiStudioStorageKey(activeDraftId);
  const staleKeys = readDraftKeyIndex(brandId).filter((k) => k !== activeKey);
  staleKeys.forEach((k) => removeLocalStorage(k));
  setLocalStorageJSON(brandStorageKeyAiStudioKeyIndex(brandId), [activeKey]);
}

function purgeAllAiStudioHandoffEntries(brandId: string): void {
  if (!brandId) return;
  const contextKeyPrefix = `${AI_STUDIO_CONTEXT_STORAGE_PREFIX}:`;
  for (const key of readDraftKeyIndex(brandId)) {
    removeLocalStorage(key);
    if (key.startsWith(contextKeyPrefix)) {
      const draftId = key.slice(contextKeyPrefix.length);
      if (draftId) {
        removeLocalStorage(buildPendingApplyStorageKey(draftId));
        removeLocalStorage(buildSessionHistoryStorageKey(draftId));
      }
    }
  }
  removeLocalStorage(brandStorageKeyAiStudioLastDraft(brandId));
}

if (typeof window !== 'undefined') {
  storeRegistry.register({
    name: 'ai-studio-handoff',
    teardown: (prevBrandId) => {
      try {
        purgeAllAiStudioHandoffEntries(prevBrandId);
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[ai-studio-handoff] teardown failed', error);
        }
      }
    },
  });
}

type UseAiStudioHandoffOptions = {
  brandProfileId: string | undefined;
  weekStartId: string;
  selectedDraft: OrganicCalendarDraft | null | undefined;
  updateDraftById: (
    draftId: string,
    updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft,
  ) => void;
  setSelectedDraftId: (id: string | null) => void;
  // True once the calendar's initial fetch-all has completed. The apply-on-return
  // patch must wait for this, or the hydration refetch clobbers it (and the
  // pending-apply blob is already consumed, so it can't recover).
  isCalendarHydrated: boolean;
};

export function useAiStudioHandoff({
  brandProfileId,
  weekStartId,
  selectedDraft,
  updateDraftById,
  setSelectedDraftId,
  isCalendarHydrated,
}: UseAiStudioHandoffOptions) {
  const router = useRouter();
  const { show } = useToast();
  // Guards the one-shot apply-on-return so it consumes the pending-apply blob
  // exactly once, after hydration, rather than on every render.
  const appliedRef = React.useRef(false);

  const deriveAiStudioPrompts = React.useCallback((draft: OrganicCalendarDraft) => {
    const creativeDirectionPrompt =
      draft.creativeDirectionPrompt?.trim() ||
      draft.creativeIdea?.trim() ||
      draft.summary?.trim() ||
      draft.title.trim();

    const thumbnailPrompt =
      draft.thumbnailPrompt?.trim() ||
      draft.mediaSuggestion?.prompt?.trim() ||
      draft.assetHints?.[0]?.suggestion?.trim() ||
      '';

    return { creativeDirectionPrompt, thumbnailPrompt };
  }, []);

  const buildAiStudioContext = React.useCallback(
    (draft: OrganicCalendarDraft): PlannerAiStudioHandoff => {
      const prompts = deriveAiStudioPrompts(draft);
      const postType = normalizeDraftPostType(draft.format);
      const platform = draft.platforms[0] === 'linkedin' ? 'linkedin' : 'instagram';
      const workflowConcept = resolveWorkflowConcept({ platform, postType });
      const slides =
        postType === 'carousel'
          ? deriveCarouselSlideSeeds({
              assets: draft.mediaSuggestion?.assets,
              assetHints: draft.assetHints,
              // The headless realize writes every slide into publishingAssets and
              // mirrors only the PRIMARY onto mediaSuggestion.assetUrl, so reading
              // that alone carried slide 1 across and left slides 2..N blank (#307).
              realized: draft.publishingAssets,
            })
          : [];

      return {
        schemaVersion: 'planner_ai_handoff_v1',
        draftId: draft.id,
        brandProfileId: brandProfileId ?? '',
        weekStartId,
        platform,
        postType,
        workflowConcept,
        format: draft.format,
        // A carousel's slide count is evidenced, not declared: `slideCount` is only
        // ever restored from a persisted snapshot, so an agent-generated draft has
        // none and `mediaCount` defaults to 1. Reading those alone collapsed every
        // agent carousel to a single slide in AI Studio.
        authoritativeCount:
          postType === 'carousel'
            ? Math.max(
                1,
                resolveCarouselSlideCount({
                  slideCount: draft.slideCount,
                  realizedMediaCount: Math.max(
                    draft.publishingAssets?.length ?? 0,
                    draft.mediaSuggestion?.assets?.length ?? 0,
                    draft.mediaCount ?? 0,
                  ),
                }),
                slides.length,
              )
            : 1,
        title: draft.title,
        summary: draft.summary,
        captionPreview: draft.captionPreview,
        seedTrendId: draft.seedTrendId,
        creativeDirectionPrompt: prompts.creativeDirectionPrompt,
        thumbnailPrompt: prompts.thumbnailPrompt,
        mediaSuggestion: draft.mediaSuggestion
          ? {
              assetUrl:
                typeof draft.mediaSuggestion.assetUrl === 'string'
                  ? draft.mediaSuggestion.assetUrl
                  : undefined,
              assetBase64:
                typeof draft.mediaSuggestion.assetBase64 === 'string'
                  ? draft.mediaSuggestion.assetBase64
                  : undefined,
              generationContext: draft.mediaSuggestion.generationContext,
            }
          : undefined,
        assetHints: draft.assetHints,
        slides: slides.length > 0 ? slides : undefined,
        updatedAt: new Date().toISOString(),
      };
    },
    [brandProfileId, deriveAiStudioPrompts, weekStartId],
  );

  const persistAiStudioContext = React.useCallback(
    (payload: PlannerAiStudioHandoff): boolean => {
      if (typeof window === 'undefined') return false;
      if (!brandProfileId) return false;
      const storageKey = buildAiStudioStorageKey(payload.draftId);
      const candidates = buildAiStudioHandoffStorageCandidates(payload);
      let didPruneStaleEntries = false;

      for (const candidate of candidates) {
        setLocalStorageJSON(storageKey, candidate);
        const written = getLocalStorageJSON<unknown>(storageKey, null);
        if (written !== null) {
          registerDraftKey(brandProfileId, storageKey);
          setLocalStorageJSON(brandStorageKeyAiStudioLastDraft(brandProfileId), payload.draftId);
          return true;
        }
        if (!didPruneStaleEntries) {
          pruneStaleAiStudioContextEntries(brandProfileId, payload.draftId);
          didPruneStaleEntries = true;
        }
      }

      return false;
    },
    [brandProfileId],
  );

  // Debounced persist of handoff context when selected draft changes
  React.useEffect(() => {
    if (typeof window === 'undefined' || !selectedDraft) return;
    const timer = setTimeout(() => {
      const parsed = plannerAiStudioHandoffSchema.safeParse(buildAiStudioContext(selectedDraft));
      if (!parsed.success) return;
      persistAiStudioContext(parsed.data);
    }, 300);
    return () => clearTimeout(timer);
  }, [buildAiStudioContext, persistAiStudioContext, selectedDraft]);

  // Sync pending apply response from AI Studio on return. Gated on hydration so it
  // runs AFTER the calendar's fetch-all populates the store — applying onto the
  // hydrated draft (which then autosaves) instead of racing the refetch that would
  // otherwise clobber the patch.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isCalendarHydrated) return;
    if (appliedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const draftId = params.get('draftId');
    if (!draftId) return;

    const key = buildPendingApplyStorageKey(draftId);
    const raw = getLocalStorageJSON<unknown>(key, null);
    if (raw === null) return;

    // We have a payload to consume — claim it now so a later hydration re-render
    // can't reprocess it.
    appliedRef.current = true;

    const parsed = plannerAiStudioApplyResponseSchema.safeParse(raw);
    if (!parsed.success) {
      show({
        title: 'Could not apply AI Studio edits',
        description: 'The response format was unexpected. Try editing again.',
        variant: 'error',
      });
      removeLocalStorage(key);
      return;
    }
    const applyPayload = parsed.data;

    updateDraftById(applyPayload.draftId, (draft) => ({
      ...draft,
      title: applyPayload.contentPatch.title ?? draft.title,
      summary: applyPayload.contentPatch.summary ?? draft.summary,
      captionPreview: applyPayload.contentPatch.captionPreview ?? draft.captionPreview,
      creativeDirectionPrompt:
        applyPayload.contentPatch.creativeDirectionPrompt ?? draft.creativeDirectionPrompt,
      thumbnailPrompt: applyPayload.contentPatch.thumbnailPrompt ?? draft.thumbnailPrompt,
      creativeIdea: applyPayload.contentPatch.creativeIdea ?? draft.creativeIdea,
      publishingAssets: applyPayload.assets.map((asset) => ({
        role: asset.role,
        kind: asset.kind,
        slideIndex: asset.slideIndex,
        storagePath: asset.storagePath,
        storageUrl: asset.storageUrl,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        generationContext: asset.generationContext,
      })),
      mediaSuggestion:
        applyPayload.assets[0]?.kind === 'image'
          ? {
              ...(draft.mediaSuggestion ?? {}),
              assetUrl: applyPayload.assets[0].storageUrl,
              assetBase64: null,
              generationContext: applyPayload.assets[0].generationContext as
                | NonNullable<
                    NonNullable<OrganicCalendarDraft['mediaSuggestion']>['generationContext']
                  >
                | null
                | undefined,
            }
          : draft.mediaSuggestion,
      mediaCount: Math.max(
        1,
        applyPayload.assets.filter((asset) => asset.kind === 'image').length || draft.mediaCount,
      ),
      status: 'draft',
      generationError: undefined,
    }));

    setSelectedDraftId(applyPayload.draftId);
    show({
      title: 'AI Studio edits applied',
      description: `Updates applied to "${applyPayload.contentPatch.title ?? 'draft'}"`,
      variant: 'success',
    });
    removeLocalStorage(key);

    // Track revision history in sessionStorage
    const historyKey = buildSessionHistoryStorageKey(applyPayload.draftId);
    const historyRaw = window.sessionStorage.getItem(historyKey);
    let history: PlannerAiStudioRevision[] = [];
    if (historyRaw) {
      try {
        history = JSON.parse(historyRaw) as PlannerAiStudioRevision[];
      } catch {
        history = [];
      }
    }

    const seedRaw = getLocalStorageJSON<unknown>(
      buildAiStudioStorageKey(applyPayload.draftId),
      null,
    );
    let before: PlannerAiStudioHandoff | null = null;
    if (seedRaw !== null) {
      const parsedSeed = plannerAiStudioHandoffSchema.safeParse(seedRaw);
      if (parsedSeed.success) {
        before = parsedSeed.data;
      }
    }

    if (before) {
      const revision: PlannerAiStudioRevision = {
        revisionId:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `revision-${Date.now()}`,
        draftId: applyPayload.draftId,
        createdAt: new Date().toISOString(),
        before,
        applied: applyPayload,
      };
      history.push(revision);
      window.sessionStorage.setItem(historyKey, JSON.stringify(history.slice(-10)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCalendarHydrated]);

  const openDraft = React.useCallback(
    (draft: OrganicCalendarDraft) => {
      const parsed = plannerAiStudioHandoffSchema.safeParse(buildAiStudioContext(draft));
      if (!parsed.success) return;
      const persisted = persistAiStudioContext(parsed.data);
      if (!persisted) {
        show({
          title: 'Handoff preparation failed',
          description: 'Unable to prepare handoff data. Try closing other tabs to free storage.',
          variant: 'error',
        });
        return;
      }
      const compositionHref = draft.mediaSuggestion?.reel?.composition?.openHref;
      if (compositionHref) {
        router.push(compositionHref);
        return;
      }
      router.push(
        `/ai-studio?mode=canvas&source=organic-planner&draftId=${encodeURIComponent(draft.id)}`,
      );
    },
    [buildAiStudioContext, persistAiStudioContext, router, show],
  );

  const handleOpenInAiStudio = React.useCallback(() => {
    if (!selectedDraft || !brandProfileId) return;
    openDraft(selectedDraft);
  }, [brandProfileId, openDraft, selectedDraft]);

  const handleOpenDraftInAiStudio = React.useCallback(
    (draft: OrganicCalendarDraft) => {
      if (!brandProfileId) return;
      openDraft(draft);
    },
    [brandProfileId, openDraft],
  );

  return { handleOpenInAiStudio, handleOpenDraftInAiStudio };
}
