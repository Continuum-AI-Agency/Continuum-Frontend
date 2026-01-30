"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/hooks/useSession";

type PresenceUser = {
  user_id: string;
  full_name: string;
  avatar_url: string;
  online_at: string;
};

type BrandPresenceContextType = {
  onlineUsers: PresenceUser[];
};

const BrandPresenceContext = createContext<BrandPresenceContextType | undefined>(undefined);

export function BrandPresenceProvider({
  brandProfileId,
  children,
}: {
  brandProfileId: string;
  children: React.ReactNode;
}) {
  const supabase = createSupabaseBrowserClient();
  const { user } = useSession();
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!brandProfileId || !user) return;

    const channel = supabase.channel(`brand_presence:${brandProfileId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = [];
        
        Object.values(state).forEach((presenceEntries: any) => {
          presenceEntries.forEach((entry: any) => {
            users.push(entry);
          });
        });
        
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            full_name: user.user_metadata?.full_name || user.email || "Anonymous",
            avatar_url: user.user_metadata?.avatar_url || "",
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [brandProfileId, user, supabase]);

  return (
    <BrandPresenceContext.Provider value={{ onlineUsers }}>
      {children}
    </BrandPresenceContext.Provider>
  );
}

export function useBrandPresence() {
  const context = useContext(BrandPresenceContext);
  if (context === undefined) {
    throw new Error("useBrandPresence must be used within a BrandPresenceProvider");
  }
  return context;
}
