import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganicServiceBaseUrl } from "@/lib/organic/config";
import {
  calendarGenerationRequestSchema,
  type CalendarGenerationRequest,
} from "@/lib/organic/calendar-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toBackendPayload(payload: CalendarGenerationRequest) {
  return {
    brandProfileId: payload.brandProfileId,
    weekStart: payload.weekStart,
    timezone: payload.timezone,
    platformAccountIds: payload.platformAccountIds ?? {},
    placements: payload.placements.map((placement) => ({
      placementId: placement.placementId,
      trendId: placement.trendId,
      dayId: placement.dayId,
      scheduledAt: placement.scheduledAt,
      timeLabel: placement.timeLabel ?? null,
      platform: placement.platform,
      accountId: placement.accountId ?? null,
      seedSource: placement.seedSource ?? null,
      desiredFormat: placement.desiredFormat ?? null,
      metadata: placement.metadata ?? null,
    })),
    options: payload.options
      ? {
          schedulePreset: payload.options.schedulePreset ?? null,
          includeNewsletter: payload.options.includeNewsletter ?? null,
          newsletterDayId: payload.options.newsletterDayId ?? null,
          guidancePrompt: payload.options.guidancePrompt ?? null,
          language: payload.options.language ?? null,
          preferredPlatforms: payload.options.preferredPlatforms ?? null,
        }
      : null,
  };
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = calendarGenerationRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upstreamResponse = await fetch(
    `${getOrganicServiceBaseUrl()}/generate-calendar`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(toBackendPayload(parsed.data)),
    }
  );

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
          .catch((err) => {
            cleanup();
            controller.error(err);
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

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
