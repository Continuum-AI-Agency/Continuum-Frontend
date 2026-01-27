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
    brand_profile_id: payload.brandProfileId,
    week_start: payload.weekStart,
    timezone: payload.timezone,
    platform_account_ids: payload.platformAccountIds ?? {},
    placements: payload.placements.map((placement) => ({
      placement_id: placement.placementId,
      trend_id: placement.trendId,
      day_id: placement.dayId,
      scheduled_at: placement.scheduledAt,
      time_label: placement.timeLabel ?? null,
      platform: placement.platform,
      account_id: placement.accountId ?? null,
      seed_source: placement.seedSource ?? null,
      desired_format: placement.desiredFormat ?? null,
      metadata: placement.metadata ?? null,
    })),
    options: payload.options
      ? {
          schedule_preset: payload.options.schedulePreset ?? null,
          include_newsletter: payload.options.includeNewsletter ?? null,
          newsletter_day_id: payload.options.newsletterDayId ?? null,
          guidance_prompt: payload.options.guidancePrompt ?? null,
          preferred_platforms: payload.options.preferredPlatforms ?? null,
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
