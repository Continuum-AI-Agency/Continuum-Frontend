import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApiUrl } from "@/lib/api/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveBrandProfileId(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const input = payload.input;
  if (!isRecord(input)) return undefined;
  const brandProfileId = input.brandProfileId;
  if (typeof brandProfileId !== "string") return undefined;
  const trimmed = brandProfileId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = session.access_token.trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const brandProfileId = resolveBrandProfileId(payload);

  const fetchHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
    Authorization: `Bearer ${token}`,
    apikey: anonKey,
    "x-supabase-auth": token,
    "x-auth-token": token,
    ...(brandProfileId ? { "X-Brand-Profile-Id": brandProfileId } : {}),
  };

  const upstreamResponse = await fetch(getApiUrl("/api/organic/runs"), {
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
      { error: "Failed to start organic generation run", detail },
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
          .catch((error) => {
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

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
