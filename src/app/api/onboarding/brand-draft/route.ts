import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const brandId = url.searchParams.get("brand");
  if (!brandId) {
    return NextResponse.json({ error: "Missing brand" }, { status: 400 });
  }

  let payload: { websiteUrl?: string; locale?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const websiteUrl = payload.websiteUrl?.trim() ?? "";
  if (websiteUrl.length < 5) {
    return NextResponse.json({ error: "Invalid websiteUrl" }, { status: 400 });
  }

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Missing Supabase URL" }, { status: 500 });
  }

  const edgeResponse = await fetch(`${supabaseUrl}/functions/v1/brand_draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    },
    body: JSON.stringify({ brandId, websiteUrl, locale: payload.locale }),
    cache: "no-store",
  });

  if (!edgeResponse.ok || !edgeResponse.body) {
    const message = await edgeResponse.text().catch(() => null);
    const errorBody = message ? `Edge function failed: ${message}` : "Edge function failed";
    return NextResponse.json({ error: errorBody }, { status: edgeResponse.status || 500 });
  }

  const headers = new Headers(edgeResponse.headers);
  headers.set("Content-Type", "text/event-stream");
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("Connection", "keep-alive");
  headers.set("X-Accel-Buffering", "no");
  headers.delete("content-length");

  const edgeReader = edgeResponse.body.getReader();
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await edgeReader.read();
      if (done) {
        controller.close();
        return;
      }
      if (value) controller.enqueue(value);
    },
    cancel(reason) {
      try {
        edgeReader.cancel(reason);
      } catch {
        // ignore
      }
    },
  });

  return new Response(stream, { headers, status: edgeResponse.status });
}