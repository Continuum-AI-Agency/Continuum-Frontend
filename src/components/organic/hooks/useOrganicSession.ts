"use client";

import * as React from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { OrganicChatMessage, OrganicChatSession } from "@/lib/organic/chat.types";

type SendMessageOptions = {
  brandProfileId?: string;
  weekStart?: string;
  activePlatforms?: string[];
  platformAccountIds?: Record<string, string>;
};

type UseOrganicSessionOptions = {
  brandId: string;
  userId: string;
  weekStart: string;
};

type UseOrganicSessionResult = {
  session: OrganicChatSession | null;
  messages: OrganicChatMessage[];
  isLoadingSession: boolean;
  isStreaming: boolean;
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
};

export function useOrganicSession({
  brandId,
  userId,
  weekStart,
}: UseOrganicSessionOptions): UseOrganicSessionResult {
  const [session, setSession] = React.useState<OrganicChatSession | null>(null);
  const [messages, setMessages] = React.useState<OrganicChatMessage[]>([]);
  const [isLoadingSession, setIsLoadingSession] = React.useState(true);
  const [isStreaming, setIsStreaming] = React.useState(false);

  const abortRef = React.useRef<AbortController | null>(null);

  // Load the session for this brand + week from Supabase
  React.useEffect(() => {
    if (!brandId || !userId) return;

    setIsLoadingSession(true);
    const supabase = createSupabaseBrowserClient();

    const load = async () => {
      const { data, error } = await supabase
        .schema("organic" as never)
        .from("organic_chat_sessions")
        .select("*")
        .eq("brand_id", brandId)
        .eq("week_start", weekStart)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setSession(data as OrganicChatSession);

        // Load existing messages for this session
        const { data: msgs } = await supabase
          .schema("organic" as never)
          .from("organic_chat_messages")
          .select("*")
          .eq("session_id", (data as OrganicChatSession).session_id)
          .order("created_at", { ascending: true });

        if (msgs) {
          setMessages(msgs as OrganicChatMessage[]);
        }
      }

      setIsLoadingSession(false);
    };

    void load();
  }, [brandId, userId, weekStart]);

  // Subscribe to new messages via Supabase realtime
  React.useEffect(() => {
    if (!session?.session_id) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`organic-chat-messages-${session.session_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "organic",
          table: "organic_chat_messages",
          filter: `session_id=eq.${session.session_id}`,
        },
        (payload) => {
          const msg = payload.new as OrganicChatMessage;
          setMessages((prev) => {
            // Deduplicate by id
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.session_id]);

  // Subscribe to session updates (title, last_message_at, etc.)
  React.useEffect(() => {
    if (!brandId) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`organic-chat-session-${brandId}-${weekStart}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "organic",
          table: "organic_chat_sessions",
          filter: `brand_id=eq.${brandId}`,
        },
        (payload) => {
          const updated = payload.new as OrganicChatSession;
          if (updated.week_start === weekStart) {
            setSession(updated);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [brandId, weekStart]);

  const sendMessage = React.useCallback(
    async (content: string, options: SendMessageOptions = {}) => {
      if (!content.trim()) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      // Optimistically add the user message
      const optimisticMessage: OrganicChatMessage = {
        id: Date.now(),
        session_id: session?.session_id ?? "",
        brand_id: brandId,
        user_id: userId,
        role: "user",
        content: content.trim(),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMessage]);
      setIsStreaming(true);

      try {
        const response = await fetch("/api/organic/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content.trim(),
            session_id: session?.session_id,
            brand_id: brandId,
            user_id: userId,
            week_start: weekStart,
            brand_profile_id: options.brandProfileId,
            active_platforms: options.activePlatforms,
            platform_account_ids: options.platformAccountIds,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Chat request failed: ${response.status}`);
        }

        // Consume NDJSON stream — the backend persists messages to Supabase
        // and our realtime subscription picks them up. We just drain the stream.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const chunk = await reader.read();
          done = chunk.done;
          if (chunk.value) {
            const text = decoder.decode(chunk.value, { stream: !done });
            const lines = text.split("\n").filter(Boolean);
            for (const line of lines) {
              try {
                const event = JSON.parse(line) as Record<string, unknown>;
                // If backend echos a new session_id, adopt it
                if (typeof event.session_id === "string" && !session) {
                  // Session will be populated via realtime
                }
              } catch {
                // Ignore non-JSON lines
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
      } finally {
        setIsStreaming(false);
      }
    },
    [brandId, session, userId, weekStart]
  );

  return { session, messages, isLoadingSession, isStreaming, sendMessage };
}
