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
