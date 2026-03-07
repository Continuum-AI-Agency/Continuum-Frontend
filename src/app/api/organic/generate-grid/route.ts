import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApiUrl } from "@/lib/api/config";
import {
  calendarGenerationRequestSchema,
  toBackendCalendarGenerationRequest,
  type CalendarGenerationRequest,
} from "@/lib/organic/calendar-generation";
import {
  generationRequestSchema,
  gridJobResponseSchema,
  type GenerationRequestPayload,
} from "@/lib/organic/types";

const clientRequestSchema = generationRequestSchema;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function toBackendPayload(payload: GenerationRequestPayload) {
  return {
    platform_account_ids: payload.platformAccountIds,
    language: payload.language,
    user_prompt: payload.userPrompt,
    generation_prompt: payload.generationPrompt ?? null,
    selected_trend_ids: payload.selectedTrendIds ?? [],
    prompt: {
      id: payload.prompt.id,
      name: payload.prompt.name,
      description: payload.prompt.description ?? null,
      content: payload.prompt.content,
      source: payload.prompt.source,
    },
  };
}

function toFlattenedCalendarBackendPayload(payload: CalendarGenerationRequest) {
  const normalized = toBackendCalendarGenerationRequest(payload);
  return {
    brandProfileId: normalized.brandProfileId,
    weekStart: normalized.weekStart,
    timezone: normalized.timezone,
    platformAccountIds: normalized.platformAccountIds,
    placements: normalized.placements.map((placement) => ({
      timeLabel: placement.timeLabel ?? null,
      platform: placement.platform,
      accountId: placement.accountId ?? null,
      seedSource: placement.seedSource,
      desiredFormat: placement.desiredFormat ?? null,
      metadata: placement.metadata ?? null,
    })),
    options: normalized.options,
  };
}

async function streamCalendarGeneration(
  request: NextRequest,
  token: string,
  payload: CalendarGenerationRequest
) {
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const backendUrl = getApiUrl("/api/organic/generate-calendar");
  const upstreamResponse = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "x-supabase-auth": token,
      "x-auth-token": token,
      "X-Brand-Profile-Id": payload.brandProfileId,
    },
    body: JSON.stringify(toFlattenedCalendarBackendPayload(payload)),
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    let detail: unknown = null;
    try {
      detail = await upstreamResponse.json();
    } catch {
      try {
        detail = await upstreamResponse.text();
      } catch {
        detail = null;
      }
    }
    return NextResponse.json(
      { error: "Failed to start calendar generation", detail },
      { status: upstreamResponse.status || 502 }
    );
  }

  const reader = upstreamResponse.body.getReader();
  let abortHandler: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        if (abortHandler) {
          request.signal.removeEventListener("abort", abortHandler);
          abortHandler = null;
        }
      };

      abortHandler = () => {
        cleanup();
        void reader.cancel();
        controller.close();
      };

      const forward = (): void => {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              cleanup();
              controller.close();
              return;
            }
            if (value) {
              controller.enqueue(value);
            }
            forward();
          })
          .catch((error: unknown) => {
            cleanup();
            controller.error(error);
          });
      };

      request.signal.addEventListener("abort", abortHandler);
      forward();
    },
    cancel() {
      if (abortHandler) {
        request.signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
      void reader.cancel();
    },
  });

  return new NextResponse(stream, { headers: NDJSON_HEADERS });
}

async function queueLegacyGridGeneration(
  payload: GenerationRequestPayload,
  token: string
) {
  const backendUrl = getApiUrl("/api/organic/generate-grid");
  const response = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(toBackendPayload(payload)),
  });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    return NextResponse.json(
      { error: "Failed to queue content generation", detail },
      { status: response.status }
    );
  }

  let responsePayload: unknown;
  try {
    responsePayload = await response.json();
  } catch {
    return NextResponse.json(
      { error: "Backend returned a non-JSON response" },
      { status: 502 }
    );
  }

  const jobParse = gridJobResponseSchema.safeParse(responsePayload);
  if (!jobParse.success) {
    return NextResponse.json(
      {
        error: "Unexpected job payload from generation service",
        detail: jobParse.error.flatten(),
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      jobId: jobParse.data.job_id,
      channel: jobParse.data.channel,
      status: jobParse.data.status,
    },
    { status: 202 }
  );
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const calendarParsed = calendarGenerationRequestSchema.safeParse(json);
  const legacyParsed = clientRequestSchema.safeParse(json);
  if (!calendarParsed.success && !legacyParsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        detail: {
          calendar: calendarParsed.error.flatten(),
          legacyGrid: legacyParsed.error.flatten(),
        },
      },
      { status: 422 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const token = data.session.access_token.trim();
  if (calendarParsed.success) {
    return streamCalendarGeneration(request, token, calendarParsed.data);
  }
  return queueLegacyGridGeneration(legacyParsed.data, token);
}
