"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/useSession";
import { toast } from "sonner";

export type ChatMessage = {
  id: string;
  brand_profile_id: string;
  user_id: string;
  user_name?: string | null;
  user_avatar?: string | null;
  room_id: string;
  content: string;
  created_at: string;
};

type RealtimeStatus = "INITIALIZING" | "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "ERROR";

const normalizeRealtimeStatus = (value: string): RealtimeStatus =>
  value === "CHANNEL_ERROR" ? "ERROR" : (value as RealtimeStatus);

const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;

function getChatRetentionCutoffIso(now = Date.now()): string {
  return new Date(now - CHAT_RETENTION_MS).toISOString();
}

const mergeMessages = (existing: ChatMessage[], incoming: ChatMessage[]) => {
  const map = new Map<string, ChatMessage>();
  [...existing, ...incoming].forEach((message) => {
    map.set(message.id, message);
  });

  return [...map.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
};

export function useAIStudioChatRealtime(brandProfileId: string, roomId: string = "main") {
  const supabase = createSupabaseBrowserClient();
  const { user } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [channelStatus, setChannelStatus] = useState<RealtimeStatus>("INITIALIZING");
  const channelRef = useRef<any>(null);

  const loadLatestMessages = useCallback(
    async (showErrorToast: boolean = true) => {
      if (!brandProfileId) return;
      const cutoffIso = getChatRetentionCutoffIso();

      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("chat_messages")
        .select("*")
        .eq("brand_profile_id", brandProfileId)
        .eq("room_id", roomId)
        .gte("created_at", cutoffIso)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error loading chat messages:", error);
        if (showErrorToast) {
          toast.error("Failed to load chat history");
        }
        return;
      }

      const latestMessages = [...(data ?? [])].reverse() as ChatMessage[];
      setMessages(latestMessages);
    },
    [brandProfileId, roomId, supabase]
  );

  // Load initial messages
  useEffect(() => {
    if (!brandProfileId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const loadInitialMessages = async () => {
      setIsLoading(true);
      setMessages([]);
      await loadLatestMessages();
      setIsLoading(false);
    };

    void loadInitialMessages();
  }, [brandProfileId, loadLatestMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!brandProfileId) return;

    const channel = supabase.channel(`chat:${brandProfileId}:${roomId}`, {
      config: {
        broadcast: { self: true },
      },
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "brand_profiles",
          table: "chat_messages",
          filter: `brand_profile_id=eq.${brandProfileId}`,
        },
        async (payload) => {
          const newMessage = payload.new as ChatMessage;
          if (newMessage.room_id !== roomId) return;
          setMessages((prev) => mergeMessages(prev, [newMessage]));
        }
      )
      .subscribe((subStatus) => {
        const normalizedStatus = normalizeRealtimeStatus(subStatus);
        setChannelStatus(normalizedStatus);
        if (subStatus === "SUBSCRIBED") {
          void loadLatestMessages(false);
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setChannelStatus("INITIALIZING");
    };
  }, [brandProfileId, roomId, supabase, loadLatestMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !brandProfileId) return;

      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("chat_messages")
        .insert({
          brand_profile_id: brandProfileId,
          user_id: user.id,
          user_name: user.user_metadata?.full_name || user.email || "Unknown",
          user_avatar: user.user_metadata?.avatar_url || "",
          room_id: roomId,
          content,
        })
        .select("*")
        .single();

      if (error) {
        console.error("Error sending message:", error);
        toast.error("Failed to send message");
        return;
      }

      if (data) {
        setMessages((prev) => mergeMessages(prev, [data as ChatMessage]));
      }

      if (channelStatus !== "SUBSCRIBED" || !data) {
        void loadLatestMessages(false);
      }
    },
    [brandProfileId, roomId, user, supabase, channelStatus, loadLatestMessages]
  );

  return { messages, sendMessage, isLoading };
}
