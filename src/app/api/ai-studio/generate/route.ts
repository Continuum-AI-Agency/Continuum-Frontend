import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { mapBackendGenerationResponse } from "@/lib/ai-studio/backend";
import { getApiBaseUrl } from "@/lib/api/config";
import {
  aiStudioGenerationRequestSchema,
  type AiStudioGenerationRequest,
} from "@/lib/schemas/aiStudio";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createFallbackJobFromRequest,
  markFallbackJobErrored,
  recordFallbackJob,
} from "../fallback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildBackendUrl(path: string): string {
  return new URL(path, getApiBaseUrl()).toString();
}

function toBackendPayload(payload: AiStudioGenerationRequest) {
  return {
    brand_profile_id: payload.brandProfileId,
    provider: payload.provider,
    medium: payload.medium,
    prompt: payload.prompt,
    negative_prompt: payload.negativePrompt ?? null,
    template_id: payload.templateId ?? null,
    aspect_ratio: payload.aspectRatio ?? null,
    duration_seconds: payload.durationSeconds ?? null,
    guidance_scale: payload.guidanceScale ?? null,
    seed: payload.seed ?? null,
    metadata: payload.metadata ?? null,
  };
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = aiStudioGenerationRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let response: Response;
  try {
    response = await fetch(buildBackendUrl("/ai-studio/generate"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(toBackendPayload(parsed.data)),
    });
  } catch (error) {
    console.error("Failed to reach AI Studio generation service", error);
    const fallbackJob = createFallbackJobFromRequest(parsed.data);
    recordFallbackJob(fallbackJob);
    return NextResponse.json(
      { job: fallbackJob, meta: { fallback: true, reason: "upstream-unreachable" } },
      { status: 202, headers: { "x-continuum-ai-studio": "fallback" } }
    );
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }

    console.warn("AI Studio generation upstream returned error", {
      status: response.status,
      detail,
    });

    const fallbackJob = createFallbackJobFromRequest(parsed.data);
    recordFallbackJob(fallbackJob);

    return NextResponse.json(
      {
        job: fallbackJob,
        meta: {
          fallback: true,
          reason: "upstream-error",
          status: response.status,
          detail,
        },
      },
      { status: 202, headers: { "x-continuum-ai-studio": "fallback" } }
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    console.error("AI Studio generation upstream returned non-JSON payload", error);
    const fallbackJob = createFallbackJobFromRequest(parsed.data);
    recordFallbackJob(fallbackJob);
    return NextResponse.json(
      {
        job: fallbackJob,
        meta: {
          fallback: true,
          reason: "invalid-json",
        },
      },
      { status: 202, headers: { "x-continuum-ai-studio": "fallback" } }
    );
  }

  try {
    const result = mapBackendGenerationResponse(payload);
    recordFallbackJob(result.job);
    return NextResponse.json(result, { status: response.status });
  } catch (err) {
    console.error("Failed to normalize AI Studio generation payload", err);
    const fallbackJob = createFallbackJobFromRequest(parsed.data);
    recordFallbackJob(fallbackJob);
    markFallbackJobErrored(
      fallbackJob.brandProfileId,
      fallbackJob.id,
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      {
        job: fallbackJob,
        meta: {
          fallback: true,
          reason: "schema-mismatch",
          detail: err instanceof Error ? err.message : err,
        },
      },
      { status: 202, headers: { "x-continuum-ai-studio": "fallback" } }
    );
  }
}


