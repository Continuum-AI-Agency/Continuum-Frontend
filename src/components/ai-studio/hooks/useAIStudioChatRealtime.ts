"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/useSession";
import { toast } from "sonner";

export type ChatMessage = {
  id: string;
  brand_profile_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  room_id: string;
  content: string;
  created_at: string;
};

export function useAIStudioChatRealtime(brandProfileId: string, roomId: string = "main") {
  const supabase = createSupabaseBrowserClient();
  const { user } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<any>(null);

  // Load initial messages
  useEffect(() => {
    if (!brandProfileId) return;

    const loadInitialMessages = async () => {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .schema("brand_profiles")
        .from("chat_messages")
        .select("*")
        .eq("brand_profile_id", brandProfileId)
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error loading chat messages:", error);
        toast.error("Failed to load chat history");
      } else if (data) {
        setMessages([...data].reverse());
      }
      setIsLoading(false);
    };

    loadInitialMessages();
  }, [brandProfileId, roomId, supabase]);

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
          setMessages((prev) => [...prev, newMessage]);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [brandProfileId, roomId, supabase]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!user || !brandProfileId) return;

      const { error } = await supabase
        .schema("brand_profiles")
        .from("chat_messages")
        .insert({
          brand_profile_id: brandProfileId,
          user_id: user.id,
          user_name: user.user_metadata?.full_name || user.email || "Unknown",
          user_avatar: user.user_metadata?.avatar_url || "",
          room_id: roomId,
          content,
        });

      if (error) {
        console.error("Error sending message:", error);
        toast.error("Failed to send message");
      }
    },
    [brandProfileId, roomId, user, supabase]
  );

  return { messages, sendMessage, isLoading };
}
