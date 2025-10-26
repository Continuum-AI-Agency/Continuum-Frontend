"use server";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOrganicServiceBaseUrl } from "@/lib/organic/config";
import { createClient } from "@/lib/supabase/server";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  Connection: "keep-alive",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("job_id");

  if (!jobId) {
    return NextResponse.json(
      { error: "Missing job_id query parameter" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = new URL("/generate-grid/events", getOrganicServiceBaseUrl());
  backendUrl.searchParams.set("job_id", jobId);

  const upstreamResponse = await fetch(backendUrl, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    let detail = "";
    try {
      detail = await upstreamResponse.text();
    } catch {
      // ignore
    }
    return NextResponse.json(
      {
        error: "Failed to open content generation stream",
        detail: detail || null,
      },
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

  return new NextResponse(stream, { headers: SSE_HEADERS });
}
