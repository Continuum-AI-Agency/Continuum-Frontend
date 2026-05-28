import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getApiBaseUrl } from "@/lib/api/config";
import { getPostHogClient } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP_HEADERS = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
] as const;

function createStreamResponseHeaders(upstreamHeaders: Headers): Headers {
  const headers = new Headers(upstreamHeaders);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  headers.set("Content-Type", "application/x-ndjson");
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("X-Accel-Buffering", "no");
  return headers;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: userData.user.id,
    event: "organic_agent_chat_message_sent",
    properties: {
      brand_id: (body as Record<string, unknown>)?.brandId ?? null,
      session_id: (body as Record<string, unknown>)?.sessionId ?? null,
    },
  });
  posthog.shutdown().catch(() => {});

  const baseUrl = getApiBaseUrl();
  const upstreamUrl = `${baseUrl}/api/organic/agent/chat`;

  const backendResponse = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!backendResponse.ok || !backendResponse.body) {
    const detail = await backendResponse
      .text()
      .catch(() => "Failed to connect to Organic agent.");
    return NextResponse.json(
      { error: detail || "Failed to connect to Organic agent." },
      { status: backendResponse.status || 500 }
    );
  }

  const headers = createStreamResponseHeaders(backendResponse.headers);
  return new Response(backendResponse.body, {
    headers,
    status: backendResponse.status,
    statusText: backendResponse.statusText,
  });
}
