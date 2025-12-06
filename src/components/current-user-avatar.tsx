"use client";

import { Avatar } from "@radix-ui/themes";
import { useCurrentUserAvatar } from "@/hooks/useCurrentUserAvatar";

type Props = {
  size?: number;
  className?: string;
};

export function CurrentUserAvatar({ size = 40, className }: Props) {
  const { avatarUrl, initials } = useCurrentUserAvatar();

  return (
    <Avatar
      src={avatarUrl ?? undefined}
      fallback={initials}
      className={className}
      size="3"
      style={{ width: size, height: size }}
    />
  );
}
