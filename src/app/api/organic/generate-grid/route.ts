import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
// z is not used directly here; schemas are imported from types.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganicServiceBaseUrl } from "@/lib/organic/config";
import {
  generationRequestSchema,
  gridJobResponseSchema,
  type GenerationRequestPayload,
} from "@/lib/organic/types";

const clientRequestSchema = generationRequestSchema;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toBackendPayload(payload: GenerationRequestPayload) {
  return {
    platform_account_ids: payload.platformAccountIds,
    language: payload.language,
    user_prompt: payload.userPrompt,
    generation_prompt: payload.generationPrompt ?? null,
    selected_trend_ids: payload.selectedTrendIds ?? [],
    prompt: {
      id: payload.prompt.id,
      name: payload.prompt.name,
      description: payload.prompt.description ?? null,
      content: payload.prompt.content,
      source: payload.prompt.source,
    },
  };
}

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const parsed = clientRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const backendUrl = `${getOrganicServiceBaseUrl()}/generate-grid`;
  const response = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(toBackendPayload(parsed.data)),
  });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    return NextResponse.json(
      { error: "Failed to queue content generation", detail },
      { status: response.status }
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return NextResponse.json(
      { error: "Backend returned a non-JSON response" },
      { status: 502 }
    );
  }

  const jobParse = gridJobResponseSchema.safeParse(payload);
  if (!jobParse.success) {
    return NextResponse.json(
      {
        error: "Unexpected job payload from generation service",
        detail: jobParse.error.flatten(),
      },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      jobId: jobParse.data.job_id,
      channel: jobParse.data.channel,
      status: jobParse.data.status,
    },
    { status: 202 }
  );
}
