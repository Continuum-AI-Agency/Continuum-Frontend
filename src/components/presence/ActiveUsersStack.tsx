"use client";

import React from "react";
import { useBrandPresence } from "./BrandPresenceProvider";
import { Avatar, Tooltip } from "@radix-ui/themes";

export function ActiveUsersStack() {
  const { onlineUsers } = useBrandPresence();

  const uniqueUsers = Array.from(
    new Map(onlineUsers.map((user) => [user.user_id, user])).values()
  );

  if (uniqueUsers.length === 0) return null;

  return (
    <div className="flex -space-x-2 overflow-hidden items-center p-1">
      {uniqueUsers.slice(0, 5).map((user) => (
        <Tooltip key={user.user_id} content={user.full_name}>
          <Avatar
            size="2"
            radius="full"
            src={user.avatar_url}
            fallback={user.full_name.slice(0, 2).toUpperCase()}
            className="border-2 border-slate-950 ring-1 ring-white/10"
          />
        </Tooltip>
      ))}
      {uniqueUsers.length > 5 && (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-950 text-[10px] font-bold text-white ring-1 ring-white/10">
          +{uniqueUsers.length - 5}
        </div>
      )}
    </div>
  );
}
