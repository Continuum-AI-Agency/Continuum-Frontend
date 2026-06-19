// Browser client for the calendar "Create with AI" single-post fast path. POSTs
// a validated request to the Backend, which enqueues ONE durable post_generation
// job; the generated draft surfaces later via realtime / job polling.

import {
  quickCreatePostRequestSchema,
  quickCreatePostResponseSchema,
  type QuickCreatePostRequest,
  type QuickCreatePostResponse,
} from "@continuum/contracts"

import { getApiBaseUrl } from "@/lib/api/config"
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken"

export interface QuickCreatePostDeps {
  fetchImpl?: typeof fetch
  getToken?: () => Promise<string | null>
  baseUrl?: string
}

export async function quickCreatePost(
  request: QuickCreatePostRequest,
  deps: QuickCreatePostDeps = {},
): Promise<QuickCreatePostResponse> {
  // Validate before any network call so a malformed request fails fast.
  const body = quickCreatePostRequestSchema.parse(request)
  const fetchImpl = deps.fetchImpl ?? fetch
  const getToken = deps.getToken ?? getBrowserAccessToken
  const baseUrl = deps.baseUrl ?? getApiBaseUrl()

  const token = await getToken()
  const response = await fetchImpl(`${baseUrl}/api/organic/agent/posts/quick-create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`quick-create failed (${response.status})`)
  }
  return quickCreatePostResponseSchema.parse(await response.json())
}
