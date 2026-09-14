import { z } from 'zod';
import {
  type ListChatConnectionsResponse,
  listChatConnectionsResponseSchema,
} from '@/lib/chat/connections';
import { http } from './http';

const mutationResponseSchema = z.object({}).passthrough();

export function listChatConnections(signal?: AbortSignal): Promise<ListChatConnectionsResponse> {
  return http.request({
    path: '/api/chat/connections',
    schema: listChatConnectionsResponseSchema,
    signal,
  });
}

export async function setPreferredChatConnection(
  brandId: string,
  connectionId: string,
): Promise<void> {
  await http.request({
    path: `/api/chat/preferences/${encodeURIComponent(brandId)}`,
    method: 'PUT',
    body: { connectionId },
    schema: mutationResponseSchema,
  });
}

export async function revokeChatConnection(connectionId: string): Promise<void> {
  await http.request({
    path: `/api/chat/connections/${encodeURIComponent(connectionId)}`,
    method: 'DELETE',
    schema: mutationResponseSchema,
  });
}

const slackInstallResponseSchema = z.object({ url: z.string().url() });

/**
 * Begin a Slack workspace install.
 *
 * Distinct from linking an identity: this installs the app into a workspace (a bot token
 * in slack_installations), which is what has to exist before anyone can message the bot
 * at all. The backend returns the URL rather than redirecting, because a 302 on a fetch
 * is not something the page can follow to Slack.
 */
export async function startSlackInstall(returnTo?: string): Promise<string> {
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  // `request` infers its response from the expected type, not from `schema`, so the
  // generic is explicit here — the same reason the wrappers above declare a return type.
  const { url } = await http.request<z.infer<typeof slackInstallResponseSchema>>({
    path: `/api/chat/slack/install${query}`,
    schema: slackInstallResponseSchema,
  });
  return url;
}
