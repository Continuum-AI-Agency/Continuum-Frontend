"use client";

import { useEffect, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { proxyAvatarUrlIfNeeded } from "@/lib/auth/avatar-url";

type UseCurrentUserAvatarResult = {
  user: User | null;
  avatarUrl: string | null;
  initials: string;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

function getInitials(user?: User | null): string {
  const name = (user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email || "";
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";
}

export function useCurrentUserAvatar(): UseCurrentUserAvatarResult {
  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createSupabaseBrowserClient();

  const resolveAvatarUrl = useCallback(
    async (u: User | null) => {
      if (!u) {
        setAvatarUrl(null);
        return;
      }

      const rawMeta =
        "raw_user_meta_data" in u
          ? (u as { raw_user_meta_data?: { picture?: string } }).raw_user_meta_data
          : undefined;

      const picture = rawMeta?.picture || (u.user_metadata as { picture?: string } | undefined)?.picture;

      const avatarUrlFromMetadata = typeof picture === "string" && picture.length > 0
        ? picture
        : (u.user_metadata as { avatar_url?: string } | undefined)?.avatar_url;

      if (avatarUrlFromMetadata && /^https?:\/\//i.test(avatarUrlFromMetadata)) {
        setAvatarUrl(proxyAvatarUrlIfNeeded(avatarUrlFromMetadata));
        return;
      }

      if (avatarUrlFromMetadata) {
        const { data } = supabase.storage.from("avatars").getPublicUrl(avatarUrlFromMetadata);
        setAvatarUrl(data?.publicUrl ?? null);
        return;
      }

      setAvatarUrl(null);
    },
    [supabase]
  );

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    setUser(data.user ?? null);
    await resolveAvatarUrl(data.user ?? null);
    setIsLoading(false);
  }, [resolveAvatarUrl, supabase]);

  useEffect(() => {
    void refresh();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      void resolveAvatarUrl(session?.user ?? null);
      setIsLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [resolveAvatarUrl, supabase, refresh]);

  return { user, avatarUrl, initials: getInitials(user), isLoading, refresh };
}
