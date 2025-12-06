"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@radix-ui/themes";
import { useCurrentUserAvatar } from "@/hooks/useCurrentUserAvatar";

type Props = {
  size?: number;
  className?: string;
};

export function CurrentUserAvatar({ size = 40, className }: Props) {
  const { avatarUrl, initials } = useCurrentUserAvatar();

  return (
    <Avatar className={className} style={{ width: size, height: size }}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={initials} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
