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
//
// The request itself is NOT rebuilt here. `buildJainaChatStreamRequest` is the one place a turn
// becomes `jainaChatRequestSchema`, and a transport that assembles a narrower body of its own
// silently drops `include_thoughts`, the entity `dataScope`, references, attachments and the
// plan/scaffold/tool actions — a turn that quietly does less, with nothing at the call site to
// show for it.

import { useChat } from '@ai-sdk/react';
import type { JainaUIMessage } from '@continuum/contracts';
import { DefaultChatTransport } from 'ai';
import { useCallback, useMemo, useRef } from 'react';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { buildJainaChatStreamRequest, type JainaChatInput } from '@/lib/jaina/chatRequest';

const STREAM_PATH = '/api/agents/jaina/chat/stream';

/** What the composer hands over for one turn. `query` is what goes on the wire. */
export type JainaTurnInput = Omit<JainaChatInput, 'onDispatchError'> & {
  /**
   * The sentence to show in the transcript, when it differs from what is sent. The canvas graph
   * is folded into `query` so Jaina can read it; the reader typed a request, not a wall of nodes.
   */
  displayText?: string;
  /** An approval or plan verdict: sent because the schema needs a query, never rendered. */
  silent?: boolean;
  /**
   * Called when the turn fails to reach the Backend. A caller holding optimistic UI has no other
   * way to learn it was dropped — without this an approval that never arrived still reads
   * "Approved", which is the exact silence an approval gate exists to prevent.
   */
  onDispatchError?: (message: string) => void;
};

export type UseJainaChatOptions = {
  sessionId: string;
  initialMessages?: JainaUIMessage[];
  /** Transient parts — the keepalive and the session fence. Never part of the transcript. */
  onNotice?: (notice: Record<string, unknown>) => void;
};

export function useJainaChat({ sessionId, initialMessages, onNotice }: UseJainaChatOptions) {
  // The failure callback of the turn currently in flight. `sendMessage` resolves before the fetch
  // settles, so the only honest place to learn a turn was dropped is the hook's own error path.
  const dispatchErrorRef = useRef<((message: string) => void) | null>(null);

  const transport = useMemo(() => {
    const api = `${getApiBaseUrl()}${STREAM_PATH}`;

    return new DefaultChatTransport<JainaUIMessage>({
      api,
      // Resolved per request, not captured once: a Supabase access token expires mid-session and a
      // stale bearer would 401 the turn the reader is waiting on.
      headers: async () => {
        const token = await getBrowserAccessToken();
        return {
          // Asking for the AI SDK stream is what selects the native wire.
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
      },

      // The SDK would post `{ id, messages, trigger }`. Jaina's route takes the turn's own request
      // shape, and the composer already assembled it — this only parses it against the contract.
      prepareSendMessagesRequest: ({ body }) => {
        const input = (body as { jainaInput?: JainaTurnInput } | undefined)?.jainaInput;
        if (!input) {
          // Louder than a narrowed turn. A send with no input would otherwise reach the Backend
          // missing every optional field and come back as a plausible, smaller answer.
          throw new Error('Jaina turn dispatched without a request input.');
        }
        return { body: buildJainaChatStreamRequest(input) };
      },

      // Without this the transport would GET `${api}/${chatId}/stream`. Jaina resumes on the same
      // path with the session as a query parameter, and answers 204 when nothing is in flight.
      prepareReconnectToStreamRequest: ({ id }) => ({
        api: `${api}?session_id=${encodeURIComponent(id)}`,
      }),
    });
  }, []);

  const chat = useChat<JainaUIMessage>({
    id: sessionId,
    transport,
    ...(initialMessages ? { messages: initialMessages } : {}),
    // Reconnect on mount. A reader who reloaded mid-answer rejoins the run instead of watching a
    // dead transcript; the run itself never stopped, because a browser disconnect does not abort it.
    resume: true,
    // At most one transcript render per 50ms while a turn streams; without it every token is a
    // render. The SDK flushes the latest messages on `ready`/`error`, so the tail is never dropped.
    throttle: 50,
    onData: (part) => {
      if (part.type === 'data-jaina-notice') {
        onNotice?.((part.data ?? {}) as Record<string, unknown>);
      }
    },
    onError: (error) => {
      const notify = dispatchErrorRef.current;
      dispatchErrorRef.current = null;
      notify?.(error instanceof Error ? error.message : 'Jaina did not receive it.');
    },
    onFinish: () => {
      dispatchErrorRef.current = null;
    },
  });

  const { sendMessage } = chat;

  const sendTurn = useCallback(
    (input: JainaTurnInput) => {
      const { displayText, silent, onDispatchError, ...request } = input;
      dispatchErrorRef.current = onDispatchError ?? null;

      return sendMessage(
        {
          role: 'user',
          parts: [{ type: 'text', text: displayText ?? request.query }],
          ...(silent ? { metadata: { silent: true } } : {}),
        },
        { body: { jainaInput: request } },
      );
    },
    [sendMessage],
  );

  return { ...chat, sendTurn };
}
