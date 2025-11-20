import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapBackendJob } from "@/lib/ai-studio/backend";
import { getApiBaseUrl } from "@/lib/api/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  brandProfileId: z.string().min(1, "brandProfileId is required"),
});

function buildBackendUrl(path: string): URL {
  return new URL(path, getApiBaseUrl());
}

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const jobId = params.jobId;
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

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

  const url = buildBackendUrl(`/ai-studio/jobs/${encodeURIComponent(jobId)}`);
  url.searchParams.set("brand_profile_id", parsed.data.brandProfileId);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }

    return NextResponse.json(
      { error: "Failed to fetch job", detail },
      { status: response.status }
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return NextResponse.json(
      { error: "Generation service returned a non-JSON response" },
      { status: 502 }
    );
  }

  try {
    const job = mapBackendJob(payload);
    return NextResponse.json(job, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Unexpected payload from generation service",
        detail: err instanceof Error ? err.message : err,
      },
      { status: 502 }
    );
  }
}


