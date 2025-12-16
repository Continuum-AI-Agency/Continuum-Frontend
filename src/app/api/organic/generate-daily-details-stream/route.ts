import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganicServiceBaseUrl } from "@/lib/organic/config";
import { dailyDetailsRequestSchema } from "@/lib/organic/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const parsed = dailyDetailsRequestSchema.safeParse(json);
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
    `${getOrganicServiceBaseUrl()}/generate-daily-details-stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        platform_account_ids: parsed.data.platformAccountIds,
        weekly_grid: parsed.data.weeklyGrid,
        language: parsed.data.language,
        selected_trend_ids: parsed.data.selectedTrendIds ?? [],
      }),
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
      { error: "Failed to start details stream", detail },
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
