"use client"

import * as React from "react"
import { useCalendarStore } from "@/lib/organic/store"
import { buildPublishBody } from "@/lib/organic/publish-utils"
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken"
import { useToast } from "@/components/ui/ToastProvider"
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"

// ── SSE event shapes ────────────────────────────────────────────────────────

type StartedEvent = { type: "started"; postType: string }
type ProcessingEvent =
  | { type: "processing"; stage: "container_created"; containerId: string; itemIndex?: number }
  | { type: "processing"; stage: "polling"; attempt: number; statusCode: string; containerId: string }
type PublishedEvent = { type: "published"; postId: string | null; postType: string; igUserId: string }
type FailedEvent = { type: "failed"; error: string; code: string }

type PublishSSEEvent = StartedEvent | ProcessingEvent | PublishedEvent | FailedEvent

// ── Public types ────────────────────────────────────────────────────────────

export type PublishProgressStage =
  | "started"
  | "container_created"
  | "polling"

export type UsePublishDraftResult = {
  publish: (draft: OrganicCalendarDraft) => Promise<void>
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

export function usePublishDraft(): UsePublishDraftResult {
  const updateDraft = useCalendarStore((state) => state.updateDraft)
  const accountContext = useCalendarStore((state) => state.accountContext)
  const { show } = useToast()

  const [isPublishing, setIsPublishing] = React.useState(false)
  const [stage, setStage] = React.useState<PublishProgressStage | null>(null)
  const [pollingAttempt, setPollingAttempt] = React.useState(0)
  const [tokenExpired, setTokenExpired] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const publish = React.useCallback(
    async (draft: OrganicCalendarDraft) => {
      setIsPublishing(true)
      setStage(null)
      setPollingAttempt(0)
      setTokenExpired(false)
      setError(null)

      try {
        const token = await getBrowserAccessToken()
        const body = buildPublishBody(draft, accountContext.igAccountId, accountContext.brandId)

        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (token) headers["Authorization"] = `Bearer ${token}`

        const response = await fetch(`/api/organic/calendar/drafts/${draft.id}/publish`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })

        if (response.status === 401) {
          setError("Not authenticated.")
          show({ title: "Publishing failed", description: "Session expired.", variant: "error" })
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
            } else if (
              ev.code === "token_expired" ||
              ev.error.toLowerCase().includes("token") ||
              ev.error.toLowerCase().includes("expired") ||
              ev.error.toLowerCase().includes("reconnect")
            ) {
              setTokenExpired(true)
              show({ title: "Publishing failed", description: ev.error, variant: "error" })
            } else {
              setError(ev.error)
              show({ title: "Publishing failed", description: ev.error, variant: "error" })
            }
          }
        }
      } catch {
        const msg = "Network error. Please try again."
        setError(msg)
        show({ title: "Publishing failed", description: msg, variant: "error" })
      } finally {
        setIsPublishing(false)
        setStage(null)
      }
    },
    [updateDraft, accountContext, show]
  )

  return { publish, isPublishing, stage, pollingAttempt, tokenExpired, error }
}
