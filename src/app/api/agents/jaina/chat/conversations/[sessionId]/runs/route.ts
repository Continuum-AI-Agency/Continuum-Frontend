import { NextResponse } from "next/server";
import { z } from "zod";

import {
  backendConversationRunSchema,
  jainaConversationRunsHydrationQuerySchema,
  jainaConversationRunsHydrationResponseSchema,
  mapConversationRunRow,
} from "@/lib/jaina/conversations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

async function authorizeConversationRequest(): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}

type RunsRouteContext = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(request: Request, context: RunsRouteContext) {
  const auth = await authorizeConversationRequest();
  if (!auth.ok) return auth.response;

  const { sessionId } = await context.params;
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) {
    return NextResponse.json(
      { error: "Session id is required." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = jainaConversationRunsHydrationQuerySchema.safeParse({
    sessionId: normalizedSessionId,
    brandId:
      searchParams.get("brandId") ??
      searchParams.get("brand_id") ??
      undefined,
    adAccountId:
      searchParams.get("adAccountId") ??
      searchParams.get("ad_account_id") ??
      undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", details: parsedQuery.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("jaina_conversation_runs")
      .select(
        "id, run_id, session_id, brand_id, ad_account_id, status, result_type, result_payload, query, created_at"
      )
      .eq("session_id", parsedQuery.data.sessionId)
      .eq("brand_id", parsedQuery.data.brandId);

    if (parsedQuery.data.adAccountId) {
      query = query.eq("ad_account_id", parsedQuery.data.adAccountId);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(parsedQuery.data.limit);
    if (error) {
      console.error("Error loading Jaina conversation runs:", error);
      return NextResponse.json(
        { error: "Failed to load conversation run payloads." },
        { status: 500 }
      );
    }

    const parsedRows = z.array(backendConversationRunSchema).safeParse(data ?? []);
    if (!parsedRows.success) {
      return NextResponse.json(
        { error: "Invalid conversation run payload from backend." },
        { status: 502 }
      );
    }

    const runs = parsedRows.data.map(mapConversationRunRow);
    return NextResponse.json(
      jainaConversationRunsHydrationResponseSchema.parse({
        sessionId: parsedQuery.data.sessionId,
        runs,
      })
    );
  } catch (error) {
    console.error("Error loading Jaina conversation run payloads:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
