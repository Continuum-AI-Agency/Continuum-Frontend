'use client';

// Jaina's transcript, owned by the AI SDK.
//
// This replaces `useJainaChatStream`: a hand-rolled NDJSON reader, an 80ms coalescing buffer, a
// 120-second inactivity watchdog with a durable-run poll behind it, and a reducer that folded
// every frame into one growing state object. All of that existed to rebuild, on the client, a
// message the server already knew. `useChat` keeps the messages; the SDK keeps the protocol.
//
// The three things that made answers disappear are structural here rather than patched:
//   - ONE owner. `useChat.messages` is the transcript. Persisted history is initial state when a
//     session opens, never something that races a live answer.
//   - RESUME instead of re-fold. A dropped connection reconnects on GET and the server replays the
//     durable log through the same adapter, so the answer survives a reload rather than being
//     reconstructed from a second source.
//   - ABORT is not an error. `stop()` only detaches locally; a deliberate stop must never surface
//     as a failed request, which is what turned "I pressed stop" into a destructive toast.

import { useChat } from '@ai-sdk/react';
import type { JainaUIMessage } from '@continuum/contracts';
import { DefaultChatTransport } from 'ai';
import { useMemo } from 'react';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

export type JainaChatContext = {
  adAccountId: string | null;
  brandId: string | null;
  sessionId: string | null;
  projectId?: string | null;
  timezone?: string;
};

export type UseJainaChatOptions = {
  sessionId: string;
  context: JainaChatContext;
  initialMessages?: JainaUIMessage[];
  /** Transient parts — the keepalive and the session fence. Never part of the transcript. */
  onNotice?: (notice: Record<string, unknown>) => void;
};

const STREAM_PATH = '/api/agents/jaina/chat/stream';

export function useJainaChat({
  sessionId,
  context,
  initialMessages,
  onNotice,
}: UseJainaChatOptions) {
  const transport = useMemo(() => {
    const api = `${getApiBaseUrl()}${STREAM_PATH}`;

    return new DefaultChatTransport<JainaUIMessage>({
      api,
      // Resolved per request, not captured once: a Supabase access token expires mid-session and a
      // stale bearer would 401 the turn the reader is waiting on.
      headers: async () => {
        const token = await getBrowserAccessToken();
        return {
          // Asking for the AI SDK stream is what selects the native wire; the Backend still serves
          // NDJSON to anything that does not, so an older tab keeps working during a deploy.
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
      },

      // The SDK would post `{ id, messages, trigger }`. Jaina's route takes the turn's own request
      // shape, so the newest user message becomes `query` and the rest is its context.
      prepareSendMessagesRequest: ({ messages, body }) => {
        const latest = [...messages].reverse().find((message) => message.role === 'user');
        const text = (latest?.parts ?? [])
          .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
          .map((part) => part.text)
          .join('');

        return {
          body: {
            query: text,
            client_message_id: latest?.id,
            context: {
              adAccountId: context.adAccountId,
              brandId: context.brandId,
              sessionId: context.sessionId ?? sessionId,
              ...(context.projectId ? { projectId: context.projectId } : {}),
              ...(context.timezone ? { timezone: context.timezone } : {}),
            },
            ...(body ?? {}),
          },
        };
      },

      // Without this the transport would GET `${api}/${chatId}/stream`. Jaina resumes on the same
      // path with the session as a query parameter, and answers 204 when nothing is in flight.
      prepareReconnectToStreamRequest: ({ id }) => ({
        api: `${api}?session_id=${encodeURIComponent(id)}`,
      }),
    });
  }, [
    context.adAccountId,
    context.brandId,
    context.projectId,
    context.sessionId,
    context.timezone,
    sessionId,
  ]);

  const chat = useChat<JainaUIMessage>({
    id: sessionId,
    transport,
    ...(initialMessages ? { messages: initialMessages } : {}),
    // Reconnect on mount. A reader who reloaded mid-answer rejoins the run instead of watching a
    // dead transcript; the run itself never stopped, because a browser disconnect does not abort it.
    resume: true,
    onData: (part) => {
      if (part.type === 'data-jaina-notice') {
        onNotice?.((part.data ?? {}) as Record<string, unknown>);
      }
    },
  });

  return chat;
}
