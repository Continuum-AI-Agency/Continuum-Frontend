import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapBackendTemplatesResponse } from "@/lib/ai-studio/backend";
import { getApiBaseUrl } from "@/lib/api/config";
import {
  aiStudioMediumSchema,
  aiStudioProviderSchema,
} from "@/lib/schemas/aiStudio";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFallbackTemplates } from "../fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  brandProfileId: z.string().min(1, "brandProfileId is required"),
  medium: aiStudioMediumSchema.optional(),
  provider: aiStudioProviderSchema.optional(),
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

  const url = buildBackendUrl("/ai-studio/templates");
  url.searchParams.set("brand_profile_id", parsed.data.brandProfileId);
  if (parsed.data.medium) {
    url.searchParams.set("medium", parsed.data.medium);
  }
  if (parsed.data.provider) {
    url.searchParams.set("provider", parsed.data.provider);
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
    console.error("Failed to reach AI Studio template service", error);
    const fallbackTemplates = getFallbackTemplates(parsed.data);
    return NextResponse.json(
      { templates: fallbackTemplates, meta: { fallback: true, reason: "upstream-unreachable" } },
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

    console.warn("AI Studio template upstream returned error", {
      status: response.status,
      detail,
    });

    const fallbackTemplates = getFallbackTemplates(parsed.data);
    return NextResponse.json(
      {
        templates: fallbackTemplates,
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
    console.error("AI Studio template upstream returned non-JSON payload", error);
    const fallbackTemplates = getFallbackTemplates(parsed.data);
    return NextResponse.json(
      {
        templates: fallbackTemplates,
        meta: {
          fallback: true,
          reason: "invalid-json",
        },
      },
      { status: 200, headers: { "x-continuum-ai-studio": "fallback" } }
    );
  }

  try {
    const dataResponse = mapBackendTemplatesResponse(payload);
    return NextResponse.json(dataResponse, { status: 200 });
  } catch (err) {
    console.error("Failed to normalize AI Studio templates payload", err);
    const fallbackTemplates = getFallbackTemplates(parsed.data);
    return NextResponse.json(
      {
        templates: fallbackTemplates,
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


