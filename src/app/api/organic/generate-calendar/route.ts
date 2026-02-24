import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApiUrl } from "@/lib/api/config";
import {
  calendarGenerationRequestSchema,
  toBackendCalendarGenerationRequest,
} from "@/lib/organic/calendar-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsedRequest = calendarGenerationRequestSchema.safeParse(json);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: "Invalid calendar generation payload",
        detail: parsedRequest.error.flatten(),
      },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError || !session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = session.access_token.trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  const backendUrl = getApiUrl("/api/organic/generate-calendar");
  const payload = toBackendCalendarGenerationRequest(parsedRequest.data);
  
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
