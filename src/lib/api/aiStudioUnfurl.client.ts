"use client";

import { http } from "@/lib/api/http";
import { unfurlMediaResponseSchema, type UnfurlMediaResponse } from "@continuum/contracts";

// Calls the Backend link-unfurl endpoint. Returns typed media items the canvas
// turns into unattached reference nodes. Auth bearer is attached by http.request.
export async function unfurlMediaFromUrl(url: string): Promise<UnfurlMediaResponse> {
  return http.request<UnfurlMediaResponse>({
    path: "/api/ai-studio/unfurl",
    method: "POST",
    body: { url },
    schema: unfurlMediaResponseSchema,
    cache: "no-store",
  });
}
