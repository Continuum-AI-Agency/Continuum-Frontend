import { NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildBackendUrl(path: string): string {
  return new URL(path, getApiBaseUrl()).toString();
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const upstreamUrl = jobId
    ? buildBackendUrl(`/ai-studio/generate/stream?jobId=${encodeURIComponent(jobId)}`)
    : buildBackendUrl(`/ai-studio/generate/stream${url.search}`);

  const upstream = await fetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      Accept: "text/event-stream",
    },
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Upstream stream unavailable" }, { status: upstream.status || 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-store",
    },
  });
}

