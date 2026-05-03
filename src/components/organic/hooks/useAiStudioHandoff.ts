"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { useToast } from "@/components/ui/ToastProvider"
import {
  brandStorageKeyAiStudioLastDraft,
  buildAiStudioHandoffStorageCandidates,
  buildAiStudioStorageKey,
  buildPendingApplyStorageKey,
  buildSessionHistoryStorageKey,
  normalizeDraftPostType,
  plannerAiStudioApplyResponseSchema,
  plannerAiStudioHandoffSchema,
  resolveWorkflowConcept,
  type PlannerAiStudioHandoff,
  type PlannerAiStudioRevision,
} from "@/lib/organic/ai-studio-bridge"
import { getLocalStorageJSON, setLocalStorageJSON, removeLocalStorage } from "@/lib/storage"
import {
  brandStorageKeyAiStudioKeyIndex,
  migrateLegacyAiStudioKeyIndex,
} from "@/lib/storage-keys"
import type { OrganicCalendarDraft } from "../primitives/types"

function readDraftKeyIndex(brandId: string): string[] {
  if (!brandId) return []
  migrateLegacyAiStudioKeyIndex(brandId)
  return getLocalStorageJSON<string[]>(brandStorageKeyAiStudioKeyIndex(brandId), [])
}

function registerDraftKey(brandId: string, storageKey: string): void {
  if (!brandId) return
  const index = readDraftKeyIndex(brandId)
  if (!index.includes(storageKey)) {
    setLocalStorageJSON(brandStorageKeyAiStudioKeyIndex(brandId), [...index, storageKey])
  }
}

function pruneStaleAiStudioContextEntries(brandId: string, activeDraftId: string): void {
  if (!brandId) return
  const activeKey = buildAiStudioStorageKey(activeDraftId)
  const staleKeys = readDraftKeyIndex(brandId).filter((k) => k !== activeKey)
  staleKeys.forEach((k) => removeLocalStorage(k))
  setLocalStorageJSON(brandStorageKeyAiStudioKeyIndex(brandId), [activeKey])
}

type UseAiStudioHandoffOptions = {
  brandProfileId: string | undefined
  weekStartId: string
  selectedDraft: OrganicCalendarDraft | null | undefined
  updateDraftById: (
    draftId: string,
    updater: (draft: OrganicCalendarDraft) => OrganicCalendarDraft
  ) => void
  setSelectedDraftId: (id: string | null) => void
}

export function useAiStudioHandoff({
  brandProfileId,
  weekStartId,
  selectedDraft,
  updateDraftById,
  setSelectedDraftId,
}: UseAiStudioHandoffOptions) {
  const router = useRouter()
  const { show } = useToast()

  const deriveAiStudioPrompts = React.useCallback(
    (draft: OrganicCalendarDraft) => {
      const creativeDirectionPrompt =
        draft.creativeDirectionPrompt?.trim() ||
        draft.creativeIdea?.trim() ||
        draft.summary?.trim() ||
        draft.title.trim()

      const thumbnailPrompt =
        draft.thumbnailPrompt?.trim() ||
        draft.mediaSuggestion?.prompt?.trim() ||
        draft.assetHints?.[0]?.suggestion?.trim() ||
        ""

      return { creativeDirectionPrompt, thumbnailPrompt }
    },
    []
  )

  const buildAiStudioContext = React.useCallback(
    (draft: OrganicCalendarDraft): PlannerAiStudioHandoff => {
      const prompts = deriveAiStudioPrompts(draft)
      const postType = normalizeDraftPostType(draft.format)
      const platform =
        draft.platforms[0] === "linkedin" ? "linkedin" : "instagram"
      const workflowConcept = resolveWorkflowConcept({ platform, postType })

      return {
        schemaVersion: "planner_ai_handoff_v1",
        draftId: draft.id,
        brandProfileId: brandProfileId ?? "",
        weekStartId,
        platform,
        postType,
        workflowConcept,
        format: draft.format,
        authoritativeCount:
          postType === "carousel"
            ? Math.max(1, draft.slideCount ?? draft.mediaCount ?? 1)
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
                typeof draft.mediaSuggestion.assetUrl === "string"
                  ? draft.mediaSuggestion.assetUrl
                  : undefined,
              assetBase64:
                typeof draft.mediaSuggestion.assetBase64 === "string"
                  ? draft.mediaSuggestion.assetBase64
                  : undefined,
              generationContext: draft.mediaSuggestion.generationContext,
            }
          : undefined,
        assetHints: draft.assetHints,
        updatedAt: new Date().toISOString(),
      }
    },
    [brandProfileId, deriveAiStudioPrompts, weekStartId]
  )

  const persistAiStudioContext = React.useCallback(
    (payload: PlannerAiStudioHandoff): boolean => {
      if (typeof window === "undefined") return false
      if (!brandProfileId) return false
      const storageKey = buildAiStudioStorageKey(payload.draftId)
      const candidates = buildAiStudioHandoffStorageCandidates(payload)
      let didPruneStaleEntries = false

      for (const candidate of candidates) {
        setLocalStorageJSON(storageKey, candidate)
        const written = getLocalStorageJSON<unknown>(storageKey, null)
        if (written !== null) {
          registerDraftKey(brandProfileId, storageKey)
          setLocalStorageJSON(brandStorageKeyAiStudioLastDraft(brandProfileId), payload.draftId)
          return true
        }
        if (!didPruneStaleEntries) {
          pruneStaleAiStudioContextEntries(brandProfileId, payload.draftId)
          didPruneStaleEntries = true
        }
      }

      return false
    },
    [brandProfileId]
  )

  // Debounced persist of handoff context when selected draft changes
  React.useEffect(() => {
    if (typeof window === "undefined" || !selectedDraft) return
    const timer = setTimeout(() => {
      const parsed = plannerAiStudioHandoffSchema.safeParse(
        buildAiStudioContext(selectedDraft)
      )
      if (!parsed.success) return
      persistAiStudioContext(parsed.data)
    }, 300)
    return () => clearTimeout(timer)
  }, [buildAiStudioContext, persistAiStudioContext, selectedDraft])

  // Sync pending apply response from AI Studio on return
  React.useEffect(() => {
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    const draftId = params.get("draftId")
    if (!draftId) return

    const key = buildPendingApplyStorageKey(draftId)
    const raw = getLocalStorageJSON<unknown>(key, null)
    if (raw === null) return

    const parsed = plannerAiStudioApplyResponseSchema.safeParse(raw)
    if (!parsed.success) {
      show({
        title: "Could not apply AI Studio edits",
        description: "The response format was unexpected. Try editing again.",
        variant: "error",
      })
      removeLocalStorage(key)
      return
    }
    const applyPayload = parsed.data

    updateDraftById(applyPayload.draftId, (draft) => ({
      ...draft,
      title: applyPayload.contentPatch.title ?? draft.title,
      summary: applyPayload.contentPatch.summary ?? draft.summary,
      captionPreview:
        applyPayload.contentPatch.captionPreview ?? draft.captionPreview,
      creativeDirectionPrompt:
        applyPayload.contentPatch.creativeDirectionPrompt ??
        draft.creativeDirectionPrompt,
      thumbnailPrompt:
        applyPayload.contentPatch.thumbnailPrompt ?? draft.thumbnailPrompt,
      creativeIdea:
        applyPayload.contentPatch.creativeIdea ?? draft.creativeIdea,
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
        applyPayload.assets[0]?.kind === "image"
          ? {
              ...(draft.mediaSuggestion ?? {}),
              assetUrl: applyPayload.assets[0].storageUrl,
              assetBase64: null,
              generationContext: applyPayload.assets[0].generationContext as
                | NonNullable<
                    NonNullable<
                      OrganicCalendarDraft["mediaSuggestion"]
                    >["generationContext"]
                  >
                | null
                | undefined,
            }
          : draft.mediaSuggestion,
      mediaCount: Math.max(
        1,
        applyPayload.assets.filter((asset) => asset.kind === "image").length ||
          draft.mediaCount
      ),
      status: "draft",
      generationError: undefined,
    }))

    setSelectedDraftId(applyPayload.draftId)
    show({
      title: "AI Studio edits applied",
      description: `Updates applied to "${applyPayload.contentPatch.title ?? "draft"}"`,
      variant: "success",
    })
    removeLocalStorage(key)

    // Track revision history in sessionStorage
    const historyKey = buildSessionHistoryStorageKey(applyPayload.draftId)
    const historyRaw = window.sessionStorage.getItem(historyKey)
    let history: PlannerAiStudioRevision[] = []
    if (historyRaw) {
      try {
        history = JSON.parse(historyRaw) as PlannerAiStudioRevision[]
      } catch {
        history = []
      }
    }

    const seedRaw = getLocalStorageJSON<unknown>(
      buildAiStudioStorageKey(applyPayload.draftId),
      null
    )
    let before: PlannerAiStudioHandoff | null = null
    if (seedRaw !== null) {
      const parsedSeed = plannerAiStudioHandoffSchema.safeParse(seedRaw)
      if (parsedSeed.success) {
        before = parsedSeed.data
      }
    }

    if (before) {
      const revision: PlannerAiStudioRevision = {
        revisionId:
          typeof crypto !== "undefined" &&
          typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `revision-${Date.now()}`,
        draftId: applyPayload.draftId,
        createdAt: new Date().toISOString(),
        before,
        applied: applyPayload,
      }
      history.push(revision)
      window.sessionStorage.setItem(
        historyKey,
        JSON.stringify(history.slice(-10))
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openDraft = React.useCallback(
    (draft: OrganicCalendarDraft) => {
      const parsed = plannerAiStudioHandoffSchema.safeParse(
        buildAiStudioContext(draft)
      )
      if (!parsed.success) return
      const persisted = persistAiStudioContext(parsed.data)
      if (!persisted) {
        show({
          title: "Handoff preparation failed",
          description: "Unable to prepare handoff data. Try closing other tabs to free storage.",
          variant: "error",
        })
        return
      }
      router.push(
        `/ai-studio?mode=canvas&source=organic-planner&draftId=${encodeURIComponent(draft.id)}`
      )
    },
    [buildAiStudioContext, persistAiStudioContext, router, show]
  )

  const handleOpenInAiStudio = React.useCallback(() => {
    if (!selectedDraft || !brandProfileId) return
    openDraft(selectedDraft)
  }, [brandProfileId, openDraft, selectedDraft])

  const handleOpenDraftInAiStudio = React.useCallback(
    (draft: OrganicCalendarDraft) => {
      if (!brandProfileId) return
      openDraft(draft)
    },
    [brandProfileId, openDraft]
  )

  return { handleOpenInAiStudio, handleOpenDraftInAiStudio }
}
