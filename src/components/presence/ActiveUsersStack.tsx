"use client";

import React from "react";
import { AvatarStack } from "@/components/realtime/avatar-stack";
import { useSession } from "@/hooks/useSession";

type PresenceUser = {
  user_id: string;
  full_name: string;
  avatar_url: string;
  online_at: string;
  email?: string;
  color?: string;
};

type RealtimeStatus = "INITIALIZING" | "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "ERROR";

interface ActiveUsersStackProps {
  onlineUsers: PresenceUser[];
  status: RealtimeStatus;
}

export function ActiveUsersStack({ onlineUsers, status }: ActiveUsersStackProps) {
  const { user: currentUser } = useSession();

  const userMap = new Map(onlineUsers.map((u) => [u.user_id, u]));
  
  if (currentUser && !userMap.has(currentUser.id)) {
    userMap.set(currentUser.id, {
      user_id: currentUser.id,
      full_name: currentUser.user_metadata?.full_name || currentUser.email || "Anonymous",
      avatar_url: currentUser.user_metadata?.avatar_url || "",
      email: currentUser.email || "",
      online_at: new Date().toISOString(),
    });
  }

  const uniqueUsers = Array.from(userMap.values());

  const sortedUsers = uniqueUsers.sort((a, b) => {
    if (a.user_id === currentUser?.id) return -1;
    if (b.user_id === currentUser?.id) return 1;
    return new Date(b.online_at).getTime() - new Date(a.online_at).getTime();
  });

  const avatars = sortedUsers.map((user) => ({
    name: user.user_id === currentUser?.id ? `${user.full_name} (You)` : user.full_name,
    image: user.avatar_url,
    email: user.email,
  }));

  return (
    <div className="flex items-center gap-2">
      {status !== "SUBSCRIBED" && (
        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Connecting to realtime..." />
      )}
      {avatars.length > 0 && <AvatarStack avatars={avatars} />}
    </div>
  );
}
