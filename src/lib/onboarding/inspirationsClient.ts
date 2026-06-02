// Browser → Backend NDJSON stream clients for the onboarding finale. http.ts is
// JSON-only, so these use raw fetch (same base URL + Bearer attach) and decode
// the line-delimited frames through the shared @continuum/contracts schemas.

import { getApiBaseUrl } from "@/lib/api/config";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import {
  parseFrame,
  onboardingInspirationsStreamFrameSchema,
  onboardingGenerationStreamFrameSchema,
  type OnboardingInspirationsStreamFrame,
  type OnboardingGenerationStreamFrame,
} from "@continuum/contracts";
import type { ZodType } from "zod";

const postStream = async (
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> => {
  const token = await getBrowserAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`onboarding_stream_failed_${response.status}`);
  }
  return response;
};

const readFrames = async <TFrame>(
  response: Response,
  schema: ZodType,
  onFrame: (frame: TFrame) => void,
): Promise<void> => {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const frame = parseFrame(trimmed, schema);
    if (frame) onFrame(frame as TFrame);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      flushLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
    }
  }
  flushLine(buffer);
};

// Persists the brand kit (colors/typography/logo) before a pre-approve creative
// prewarm so generation is grounded in real brand colors. JSON response, not a
// stream. Idempotent upsert on the Backend; safe to call again at approve.
export const persistOnboardingBrandKit = async (params: {
  brandId: string;
  colors: string[];
  typography: { primary: string | null; secondary: string | null };
  logoPath?: string | null;
}): Promise<void> => {
  const token = await getBrowserAccessToken();
  const response = await fetch(`${getApiBaseUrl()}/api/onboarding/brand-kit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(`onboarding_brand_kit_failed_${response.status}`);
  }
};

export const streamInspirations = async (params: {
  brandId: string;
  signal?: AbortSignal;
  onFrame: (frame: OnboardingInspirationsStreamFrame) => void;
}): Promise<void> => {
  const response = await postStream(
    "/api/onboarding/inspirations",
    { brandId: params.brandId },
    params.signal,
  );
  await readFrames(response, onboardingInspirationsStreamFrameSchema, params.onFrame);
};

export const streamGeneration = async (params: {
  brandId: string;
  referenceImageUrl?: string | null;
  competitorName?: string | null;
  signal?: AbortSignal;
  onFrame: (frame: OnboardingGenerationStreamFrame) => void;
}): Promise<void> => {
  const response = await postStream(
    "/api/onboarding/inspirations/generate",
    {
      brandId: params.brandId,
      referenceImageUrl: params.referenceImageUrl ?? null,
      competitorName: params.competitorName ?? null,
    },
    params.signal,
  );
  await readFrames(response, onboardingGenerationStreamFrameSchema, params.onFrame);
};
