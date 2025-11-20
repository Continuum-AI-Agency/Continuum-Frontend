import { z } from "zod";

import {
  aiStudioGenerationRequestSchema,
  aiStudioGenerationResponseSchema,
  aiStudioJobSchema,
  aiStudioJobsResponseSchema,
  aiStudioTemplatesResponseSchema,
  type AiStudioGenerationRequest,
  type AiStudioJob,
  type AiStudioMedium,
  type AiStudioProvider,
  type AiStudioTemplate,
} from "@/lib/schemas/aiStudio";

type JsonSchema<T> = z.ZodType<T>;

function resolveInternalApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") {
    return normalizedPath;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
    "http://localhost:3000";

  return `${baseUrl.replace(/\/$/, "")}${normalizedPath}`;
}

async function parseJsonResponse<T>(
  response: Response,
  schema: JsonSchema<T>
): Promise<T> {
  const payload = (await response.json()) as unknown;
  return schema.parse(payload);
}

async function handleErrorResponse(response: Response): Promise<never> {
  try {
    const data = (await response.json()) as { error?: string };
    const message =
      typeof data?.error === "string"
        ? data.error
        : `${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${response.status} ${response.statusText}`.trim());
    }
    throw error;
  }
}

async function getInternal<T>(path: string, schema: JsonSchema<T>, init?: RequestInit): Promise<T> {
  const url = resolveInternalApiUrl(path);
  const headers = new Headers(init?.headers);
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    ...init,
    headers,
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  return parseJsonResponse(response, schema);
}

async function postInternal<T>(
  path: string,
  body: unknown,
  schema: JsonSchema<T>
): Promise<T> {
  const url = resolveInternalApiUrl(path);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  return parseJsonResponse(response, schema);
}

export async function createAiStudioJob(
  payload: AiStudioGenerationRequest
): Promise<AiStudioJob> {
  const body = aiStudioGenerationRequestSchema.parse(payload);
  const { job } = await postInternal(
    "/api/ai-studio/generate",
    body,
    aiStudioGenerationResponseSchema
  );
  return job;
}

type ListJobsParams = {
  brandProfileId: string;
  limit?: number;
  after?: string;
};

export async function listAiStudioJobs(
  params: ListJobsParams,
  init?: RequestInit
): Promise<AiStudioJob[]> {
  const search = new URLSearchParams({
    brandProfileId: params.brandProfileId,
    ...(params.limit ? { limit: params.limit.toString() } : {}),
    ...(params.after ? { after: params.after } : {}),
  });

  const { jobs } = await getInternal(
    `/api/ai-studio/jobs?${search.toString()}`,
    aiStudioJobsResponseSchema,
    init
  );
  return jobs;
}

export async function getAiStudioJob(
  jobId: string,
  brandProfileId: string,
  init?: RequestInit
): Promise<AiStudioJob> {
  const search = new URLSearchParams({
    brandProfileId,
  });
  return getInternal(
    `/api/ai-studio/jobs/${encodeURIComponent(jobId)}?${search.toString()}`,
    aiStudioJobSchema,
    init
  );
}

type ListTemplatesParams = {
  brandProfileId: string;
  medium?: AiStudioMedium;
  provider?: AiStudioProvider;
};

export async function listAiStudioTemplates(
  params: ListTemplatesParams,
  init?: RequestInit
): Promise<AiStudioTemplate[]> {
  const search = new URLSearchParams({
    brandProfileId: params.brandProfileId,
    ...(params.medium ? { medium: params.medium } : {}),
    ...(params.provider ? { provider: params.provider } : {}),
  });

  const { templates } = await getInternal(
    `/api/ai-studio/templates?${search.toString()}`,
    aiStudioTemplatesResponseSchema,
    init
  );
  return templates;
}


