"use client"

import * as React from "react"
import { useCalendarStore } from "@/lib/organic/store"
import { buildPublishBody } from "@/lib/organic/publish-utils"
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken"
import { useToast } from "@/components/ui/ToastProvider"
import { classifyOrganicError, isRetryableError } from "@/lib/organic/error-handling"
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"

// ── SSE event shapes ────────────────────────────────────────────────────────

type StartedEvent = { type: "started"; postType: string }
type ProcessingEvent =
  | { type: "processing"; stage: "container_created"; containerId: string; itemIndex?: number }
  | { type: "processing"; stage: "polling"; attempt: number; statusCode: string; containerId: string }
  | { type: "processing"; stage: "carousel_retry"; attempt: number }
type PublishedEvent = { type: "published"; postId: string | null; postType: string; igUserId: string }
type FailedEvent = { type: "failed"; error: string; code: string }

type PublishSSEEvent = StartedEvent | ProcessingEvent | PublishedEvent | FailedEvent

// User-facing copy for the precise publish failure codes the backend now maps
// from Instagram's fbErrorCode + the staging gate. Falls back to the raw message.
const PUBLISH_ERROR_MESSAGES: Record<string, string> = {
  token_expired: "Your Instagram connection expired. Reconnect your account, then try again.",
  rate_limited: "Instagram is temporarily rate-limiting requests. Wait a few minutes and try again.",
  media_processing_error: "Instagram couldn't process this media. Check the file and try again.",
  media_staging_failed: "We couldn't prepare your media for Instagram. Re-attach the creative and try again.",
}

function describePublishError(code: string, fallback: string): string {
  return PUBLISH_ERROR_MESSAGES[code] ?? fallback
}

// ── Public types ────────────────────────────────────────────────────────────

export type PublishProgressStage =
  | "started"
  | "container_created"
  | "polling"

export type UsePublishDraftResult = {
  publish: (draft: OrganicCalendarDraft) => Promise<void>
  retryPublish: () => void
  isPublishing: boolean
  stage: PublishProgressStage | null
  pollingAttempt: number
  tokenExpired: boolean
  error: string | null
}

// ── SSE line parser ─────────────────────────────────────────────────────────

async function* parseSSE(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const blocks = buffer.split("\n\n")
    buffer = blocks.pop() ?? ""

    for (const block of blocks) {
      let eventName = "message"
      let data = ""
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) eventName = line.slice(7).trim()
        else if (line.startsWith("data: ")) data = line.slice(6).trim()
      }
      if (data) yield { event: eventName, data }
    }
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2

export function usePublishDraft(): UsePublishDraftResult {
  const updateDraft = useCalendarStore((state) => state.updateDraft)
  const accountContext = useCalendarStore((state) => state.accountContext)
  const { show } = useToast()

  const [isPublishing, setIsPublishing] = React.useState(false)
  const [stage, setStage] = React.useState<PublishProgressStage | null>(null)
  const [pollingAttempt, setPollingAttempt] = React.useState(0)
  const [tokenExpired, setTokenExpired] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const retryCountRef = React.useRef(0)
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDraftRef = React.useRef<OrganicCalendarDraft | null>(null)
  const mountedRef = React.useRef(true)

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  const publish = React.useCallback(
    async (draft: OrganicCalendarDraft) => {
      lastDraftRef.current = draft
      setIsPublishing(true)
      setStage(null)
      setPollingAttempt(0)
      setTokenExpired(false)
      setError(null)

      let retrying = false

      try {
        const token = await getBrowserAccessToken()
        const body = buildPublishBody(draft, accountContext.igAccountId, accountContext.brandId)

        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (token) headers["Authorization"] = `Bearer ${token}`

        let publishDraftId = draft.backendDraftId
        if (!publishDraftId) {
          if (!accountContext.brandId) throw new Error("Brand context required to register draft for publishing")
          const createResp = await fetch("/api/organic/calendar/drafts", {
            method: "POST",
            headers,
            body: JSON.stringify({
              brand_id: accountContext.brandId,
              platform_account_id: accountContext.igAccountId ?? "",
              slot_data: { placementId: draft.id, caption: draft.captionPreview },
              status: "draft",
            }),
          })
          if (!createResp.ok) throw new Error("Failed to register draft before publishing")
          const created = (await createResp.json()) as { id: string }
          publishDraftId = created.id
          updateDraft(draft.id, (d) => ({ ...d, backendDraftId: created.id }))
          lastDraftRef.current = { ...lastDraftRef.current!, backendDraftId: created.id }
        }

        const response = await fetch(`/api/organic/calendar/drafts/${publishDraftId}/publish`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })

        if (response.status === 401) {
          const classified = classifyOrganicError({ status: 401 }, "Publishing")
          setError(classified.userMessage)
          show({ title: "Publishing failed", description: classified.userMessage, variant: "error" })
          return
        }

        if (!response.body) {
          setError("Empty response from server.")
          show({ title: "Publishing failed", description: "Empty response.", variant: "error" })
          return
        }

        for await (const { event, data } of parseSSE(response.body)) {
          let parsed: PublishSSEEvent
          try {
            parsed = JSON.parse(data) as PublishSSEEvent
          } catch {
            continue
          }

          if (event === "started") {
            setStage("started")
          } else if (event === "processing") {
            const ev = parsed as ProcessingEvent
            setStage(ev.stage === "polling" ? "polling" : "container_created")
            if (ev.stage === "polling") setPollingAttempt(ev.attempt)
          } else if (event === "published") {
            const ev = parsed as PublishedEvent
            updateDraft(draft.id, (d) => ({
              ...d,
              status: "published" as const,
              instagram_post_id: ev.postId ?? null,
            }))
            show({
              title: "Published",
              description: "Your post is now live on Instagram.",
              variant: "success",
            })
          } else if (event === "failed") {
            const ev = parsed as FailedEvent
            if (ev.code === "already_published") {
              updateDraft(draft.id, (d) => ({ ...d, status: "published" as const }))
            } else {
              const classified = classifyOrganicError(
                { status: 0, message: ev.error, code: ev.code },
                "Publishing"
              )
              if (classified.retryable) {
                setTokenExpired(false)
              } else if (
                ev.code === "token_expired" ||
                ev.error.toLowerCase().includes("token")
              ) {
                setTokenExpired(true)
              }
              const description = describePublishError(ev.code, ev.error)
              setError(description)
              show({ title: "Publishing failed", description, variant: "error" })
            }
          }
        }
      } catch (err) {
        if (isRetryableError(err) && retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1
          const delay = Math.pow(2, retryCountRef.current) * 1000
          retrying = true
          show({ title: "Publishing failed", description: `Retrying in ${delay / 1000}s...`, variant: "error" })
          retryTimerRef.current = setTimeout(() => {
            if (mountedRef.current && lastDraftRef.current) {
              publish(lastDraftRef.current)
            }
          }, delay)
          return
        }
        const msg = retryCountRef.current > 0
          ? `Publishing failed after ${retryCountRef.current + 1} attempts.`
          : "Network error. Please try again."
        setError(msg)
        show({ title: "Publishing failed", description: msg, variant: "error" })
      } finally {
        if (!retrying) {
          setIsPublishing(false)
          setStage(null)
        }
      }
    },
    [updateDraft, accountContext, show]
  )

  const retryPublish = React.useCallback(() => {
    if (lastDraftRef.current) {
      retryCountRef.current = 0
      publish(lastDraftRef.current)
    }
  }, [publish])

  return { publish, retryPublish, isPublishing, stage, pollingAttempt, tokenExpired, error }
}
