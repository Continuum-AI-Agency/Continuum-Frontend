// Browser client for the planner's one-shot post generator. POSTs predetermined
// inputs (direction + selected metrics/insights/angles + tagged creatives +
// trends) to the Backend, which runs ONE synchronous schema-direct creative
// pass and returns the persisted text-checkpoint draft in the response.

import {
  type OneShotPostRequest,
  type OneShotPostResponse,
  oneShotPostRequestSchema,
  oneShotPostResponseSchema,
} from '@continuum/contracts';

import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

export interface OneShotPostDeps {
  fetchImpl?: typeof fetch;
  getToken?: () => Promise<string | null>;
  baseUrl?: string;
}

export async function createOneShotPost(
  request: OneShotPostRequest,
  deps: OneShotPostDeps = {},
): Promise<OneShotPostResponse> {
  const body = oneShotPostRequestSchema.parse(request);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getToken = deps.getToken ?? getBrowserAccessToken;
  const baseUrl = deps.baseUrl ?? getApiBaseUrl();

  const token = await getToken();
  const response = await fetchImpl(`${baseUrl}/api/organic/agent/posts/one-shot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `one-shot create failed (${response.status})`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // Non-JSON error body — keep the status-based message.
    }
    throw new Error(message);
  }
  return oneShotPostResponseSchema.parse(await response.json());
}
