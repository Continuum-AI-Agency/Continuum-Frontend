import {
  calendarGenerationEventSchema,
  calendarGenerationRequestSchema,
  calendarPlacementSchema,
  toBackendCalendarGenerationRequest,
  type CalendarGenerationEvent,
  type CalendarGenerationRequest,
} from "@/lib/organic/calendar-generation"
import { ORGANIC_CALENDAR_API } from "./organic-calendar-config"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

function parseJsonSafely<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  return undefined
}

function readSummary(record: Record<string, unknown>) {
  const summaryValue = record.summary
  if (!isRecord(summaryValue)) return undefined

  const total = readNumber(summaryValue, "total")
  const succeeded = readNumber(summaryValue, "succeeded")
  const failed = readNumber(summaryValue, "failed")
  if (
    typeof total !== "number" ||
    typeof succeeded !== "number" ||
    typeof failed !== "number"
  ) {
    return undefined
  }

  return {
    total,
    succeeded,
    failed,
  }
}

function normalizeRunEvent(eventPayload: Record<string, unknown>): CalendarGenerationEvent | null {
  const eventType = readString(eventPayload, "type")
  if (!eventType) return null

  if (eventType === "run_progress") {
    const progressRecord = isRecord(eventPayload.progress) ? eventPayload.progress : null
    const completed =
      readNumber(eventPayload, "completed") ??
      (progressRecord ? readNumber(progressRecord, "completed") : undefined) ??
      0
    const total =
      readNumber(eventPayload, "total") ??
      (progressRecord ? readNumber(progressRecord, "total") : undefined) ??
      0
    const stage =
      readString(eventPayload, "stage") ??
      (progressRecord ? readString(progressRecord, "stage") : undefined)
    const message =
      readString(eventPayload, "message") ??
      readString(eventPayload, "detail") ??
      (progressRecord ? readString(progressRecord, "message") : undefined)

    const parsed = calendarGenerationEventSchema.safeParse({
      type: "progress",
      completed,
      total,
      stage,
      message,
    })
    return parsed.success ? parsed.data : null
  }

  if (eventType === "slot_started") {
    const placementId = readString(eventPayload, "placementId")
    if (!placementId) return null
    const parsed = calendarGenerationEventSchema.safeParse({
      type: "slot_started",
      placementId,
      message: readString(eventPayload, "message"),
    })
    return parsed.success ? parsed.data : null
  }

  if (eventType === "slot_heartbeat") {
    const placementId = readString(eventPayload, "placementId")
    const progress = readNumber(eventPayload, "progress")
    if (!placementId || typeof progress !== "number") return null
    const parsed = calendarGenerationEventSchema.safeParse({
      type: "slot_heartbeat",
      placementId,
      stage: readString(eventPayload, "stage"),
      progress,
      elapsedMs: readNumber(eventPayload, "elapsedMs"),
    })
    return parsed.success ? parsed.data : null
  }

  if (eventType === "slot_stage") {
    const placementId = readString(eventPayload, "placementId")
    const stage = readString(eventPayload, "stage")
    if (!placementId || !stage) return null
    const parsed = calendarGenerationEventSchema.safeParse({
      type: "slot_stage",
      placementId,
      stage,
    })
    return parsed.success ? parsed.data : null
  }

  if (eventType === "slot_completed") {
    const placementValue = eventPayload.placement
    const parsedPlacement = calendarPlacementSchema.safeParse(placementValue)
    if (!parsedPlacement.success) return null
    const parsed = calendarGenerationEventSchema.safeParse({
      type: "slot_completed",
      placement: parsedPlacement.data,
      persistedDraftId: readString(eventPayload, "persistedDraftId"),
    })
    return parsed.success ? parsed.data : null
  }

  if (eventType === "slot_failed") {
    const placementId = readString(eventPayload, "placementId")
    const message = readString(eventPayload, "message")
    if (!placementId || !message) return null
    const parsed = calendarGenerationEventSchema.safeParse({
      type: "slot_failed",
      placementId,
      code: readString(eventPayload, "code"),
      message,
      retryable:
        typeof eventPayload.retryable === "boolean" ? eventPayload.retryable : undefined,
      attempts: readNumber(eventPayload, "attempts"),
    })
    return parsed.success ? parsed.data : null
  }

  if (eventType === "run_warning" || eventType === "run_failed") {
    const message =
      readString(eventPayload, "message") ??
      readString(eventPayload, "detail") ??
      "Organic generation run failed."
    const parsed = calendarGenerationEventSchema.safeParse({
      type: "error",
      code: readString(eventPayload, "code"),
      message,
      placementId: readString(eventPayload, "placementId"),
    })
    return parsed.success ? parsed.data : null
  }

  if (eventType === "run_completed") {
    const parsed = calendarGenerationEventSchema.safeParse({
      type: "complete",
      summary: readSummary(eventPayload),
    })
    return parsed.success ? parsed.data : null
  }

  return null
}

function normalizeStreamEvent(raw: unknown): CalendarGenerationEvent | null {
  const legacyEvent = calendarGenerationEventSchema.safeParse(raw)
  if (legacyEvent.success) return legacyEvent.data

  if (!isRecord(raw)) return null
  const envelopeEvent = raw.event
  if (!isRecord(envelopeEvent)) return null
  return normalizeRunEvent(envelopeEvent)
}

async function streamNdjson<T>(
  response: Response,
  onItem: (item: T) => void
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parsed = parseJsonSafely<T>(trimmed)
      if (parsed) onItem(parsed)
    }
  }

  const tail = buffer.trim()
  if (tail.length > 0) {
    const parsed = parseJsonSafely<T>(tail)
    if (parsed) onItem(parsed)
  }
}

export function buildCalendarGenerationPayload(
  payload: CalendarGenerationRequest
): CalendarGenerationRequest {
  return calendarGenerationRequestSchema.parse(payload)
}

export async function streamCalendarGeneration(
  payload: CalendarGenerationRequest,
  onEvent: (event: CalendarGenerationEvent) => void
): Promise<void> {
  const parsed = buildCalendarGenerationPayload(payload)
  const runPayload = {
    mode: "batch" as const,
    input: toBackendCalendarGenerationRequest(parsed),
  }
  
  const supabase = createSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  
  const response = await fetch(ORGANIC_CALENDAR_API.generateRun, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(runPayload),
  })

  if (!response.ok || !response.body) {
    let detail = "Failed to start organic generation run."
    try {
      const json = await response.json()
      detail = (json as { error?: string })?.error ?? detail
    } catch {
      try {
        detail = await response.text()
      } catch {
        detail = "Failed to start organic generation run."
      }
    }
    throw new Error(detail)
  }

  await streamNdjson<unknown>(response, (event) => {
    const parsedEvent = normalizeStreamEvent(event)
    if (parsedEvent) {
      onEvent(parsedEvent)
    }
  })
}
