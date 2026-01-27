import {
  calendarGenerationEventSchema,
  calendarGenerationRequestSchema,
  type CalendarGenerationEvent,
  type CalendarGenerationRequest,
} from "@/lib/organic/calendar-generation"
import { ORGANIC_CALENDAR_API } from "./organic-calendar-config"

function parseJsonSafely<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
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
  const response = await fetch(ORGANIC_CALENDAR_API.generateCalendar, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(parsed),
  })

  if (!response.ok || !response.body) {
    let detail = "Failed to start calendar generation."
    try {
      const json = await response.json()
      detail = (json as { error?: string })?.error ?? detail
    } catch {
      try {
        detail = await response.text()
      } catch {
        detail = "Failed to start calendar generation."
      }
    }
    throw new Error(detail)
  }

  await streamNdjson<CalendarGenerationEvent>(response, (event) => {
    const parsedEvent = calendarGenerationEventSchema.safeParse(event)
    if (parsedEvent.success) {
      onEvent(parsedEvent.data)
    }
  })
}
