import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApiUrl } from "@/lib/api/config";
import {
  calendarGenerationRequestSchema,
  type CalendarGenerationRequest,
} from "@/lib/organic/calendar-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toBackendPayload(payload: any) {
  const cleanOptions: any = {};
  if (payload.options) {
    if (payload.options.schedulePreset) cleanOptions.schedulePreset = payload.options.schedulePreset;
    if (payload.options.includeNewsletter !== undefined) cleanOptions.includeNewsletter = payload.options.includeNewsletter;
    if (payload.options.newsletterDayId && payload.options.newsletterDayId.trim() !== "") cleanOptions.newsletterDayId = payload.options.newsletterDayId;
    if (payload.options.guidancePrompt && payload.options.guidancePrompt.trim() !== "") cleanOptions.guidancePrompt = payload.options.guidancePrompt;
    if (payload.options.language && payload.options.language.trim() !== "") cleanOptions.language = payload.options.language;
    if (payload.options.preferredPlatforms) {
      if (Array.isArray(payload.options.preferredPlatforms)) {
        cleanOptions.preferredPlatforms = payload.options.preferredPlatforms
          .filter((p: any) => typeof p === "string" || typeof p === "number")
          .map((p: any) => String(p));
      } else if (typeof payload.options.preferredPlatforms === "string") {
        cleanOptions.preferredPlatforms = [payload.options.preferredPlatforms];
      }
    }
  }

  return {
    brandProfileId: payload.brandProfileId,
    weekStart: payload.weekStart,
    timezone: payload.timezone,
    platformAccountIds: payload.platformAccountIds ?? {},
    placements: (payload.placements || []).map((placement: any) => {
      let format = placement.desiredFormat ? String(placement.desiredFormat).toLowerCase() : null;
      
      if (format && format.includes("newsletter")) {
        format = "newsletter";
      }
      
      if (format === "static") {
        format = "post";
      }

      return {
        placementId: placement.placementId,
        trendId: placement.trendId ?? null,
        dayId: placement.dayId,
        scheduledAt: placement.scheduledAt,
        timeLabel: placement.timeLabel ?? null,
        platform: placement.platform,
        accountId: placement.accountId ?? null,
        seedSource: placement.seedSource ?? null,
        desiredFormat: format,
        metadata: placement.metadata ?? null,
      };
    }),
    options: Object.keys(cleanOptions).length > 0 ? cleanOptions : null,
  };
}

export async function POST(request: NextRequest) {
  let json: any;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = session.access_token.trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  const backendUrl = getApiUrl("/api/organic/generate-calendar");
  const payload = toBackendPayload(json);
  
  const fetchHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/x-ndjson",
    "Authorization": `Bearer ${token}`,
    "apikey": anonKey,
    "x-supabase-auth": token,
    "x-auth-token": token,
    "X-Brand-Profile-Id": payload.brandProfileId,
  };

  const upstreamResponse = await fetch(backendUrl, {
    method: "POST",
    headers: fetchHeaders,
    body: JSON.stringify(payload),
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
