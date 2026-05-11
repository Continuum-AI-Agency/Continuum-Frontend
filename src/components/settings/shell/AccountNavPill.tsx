"use client";

import Image from "next/image";
import { useCurrentUserAvatar } from "@/hooks/useCurrentUserAvatar";

type AccountNavPillProps = {
  email: string;
};

export function AccountNavPill({ email }: AccountNavPillProps) {
  const { avatarUrl, initials } = useCurrentUserAvatar();
  const fallback = (initials || email.charAt(0) || "?").toUpperCase();

  return (
    <span
      className="inline-flex max-w-[140px] items-center gap-1.5 rounded-full border border-border/60 bg-card/40 py-0.5 pl-0.5 pr-2 text-[11px] font-medium text-foreground/90"
      title={email}
    >
      <span className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-muted text-[9px] font-semibold uppercase text-muted-foreground">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={16}
            height={16}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          fallback
        )}
      </span>
      <span className="truncate">{email}</span>
    </span>
  );
}
