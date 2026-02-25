import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  brandId: z.string().min(1),
});

const responseSchema = z.object({
  accounts: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    })
  ),
});

function getEdgeBaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Missing Supabase URL configuration");
  }
  return supabaseUrl;
}

function getAnonKey(): string {
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error("Missing Supabase anon/publishable key configuration");
  }

  return anonKey;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (sessionError || !accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const edgeResponse = await fetch(`${getEdgeBaseUrl()}/functions/v1/fetch-timeline-accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: getAnonKey(),
      },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
    });

    if (!edgeResponse.ok) {
      let message = "Failed to fetch timeline accounts";
      try {
        const edgeError = (await edgeResponse.json()) as { error?: string };
        if (edgeError.error) {
          message = edgeError.error;
        }
      } catch {
        // Ignore response parse failure and return generic error.
      }

      return NextResponse.json({ error: message }, { status: edgeResponse.status });
    }

    const edgeData = await edgeResponse.json();
    const validated = responseSchema.safeParse(edgeData);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Invalid response format from timeline accounts edge function" },
        { status: 502 }
      );
    }

    return NextResponse.json(validated.data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Unexpected error in paid-media timeline accounts route", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
