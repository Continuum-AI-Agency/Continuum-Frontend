import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapBackendJobsResponse } from "@/lib/ai-studio/backend";
import { getApiBaseUrl } from "@/lib/api/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFallbackJobs } from "../fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  brandProfileId: z.string().min(1, "brandProfileId is required"),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  after: z.string().optional(),
});

function buildBackendUrl(path: string): URL {
  return new URL(path, getApiBaseUrl());
}

export async function GET(request: NextRequest) {
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = buildBackendUrl("/ai-studio/jobs");
  url.searchParams.set("brand_profile_id", parsed.data.brandProfileId);
  if (parsed.data.limit) {
    url.searchParams.set("limit", parsed.data.limit.toString());
  }
  if (parsed.data.after) {
    url.searchParams.set("after", parsed.data.after);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    });
  } catch (error) {
    console.error("Failed to reach AI Studio jobs service", error);
    const fallbackJobs = getFallbackJobs({
      brandProfileId: parsed.data.brandProfileId,
      limit: parsed.data.limit,
      after: parsed.data.after,
    });
    return NextResponse.json(
      { jobs: fallbackJobs, meta: { fallback: true, reason: "upstream-unreachable" } },
      { status: 200, headers: { "x-continuum-ai-studio": "fallback" } }
    );
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }

    console.warn("AI Studio jobs upstream returned error", {
      status: response.status,
      detail,
    });

    const fallbackJobs = getFallbackJobs({
      brandProfileId: parsed.data.brandProfileId,
      limit: parsed.data.limit,
      after: parsed.data.after,
    });
    return NextResponse.json(
      {
        jobs: fallbackJobs,
        meta: {
          fallback: true,
          reason: "upstream-error",
          status: response.status,
          detail,
        },
      },
      { status: 200, headers: { "x-continuum-ai-studio": "fallback" } }
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    console.error("AI Studio jobs upstream returned non-JSON payload", error);
    const fallbackJobs = getFallbackJobs({
      brandProfileId: parsed.data.brandProfileId,
      limit: parsed.data.limit,
      after: parsed.data.after,
    });
    return NextResponse.json(
      {
        jobs: fallbackJobs,
        meta: {
          fallback: true,
          reason: "invalid-json",
        },
      },
      { status: 200, headers: { "x-continuum-ai-studio": "fallback" } }
    );
  }

  try {
    const dataResponse = mapBackendJobsResponse(payload);
    return NextResponse.json(dataResponse, { status: 200 });
  } catch (err) {
    console.error("Failed to normalize AI Studio jobs payload", err);
    const fallbackJobs = getFallbackJobs({
      brandProfileId: parsed.data.brandProfileId,
      limit: parsed.data.limit,
      after: parsed.data.after,
    });
    return NextResponse.json(
      {
        jobs: fallbackJobs,
        meta: {
          fallback: true,
          reason: "schema-mismatch",
          detail: err instanceof Error ? err.message : err,
        },
      },
      { status: 200, headers: { "x-continuum-ai-studio": "fallback" } }
    );
  }
}


