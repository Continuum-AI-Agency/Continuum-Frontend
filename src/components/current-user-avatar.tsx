'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCurrentUserAvatar } from '@/hooks/useCurrentUserAvatar';
import { cn } from '@/lib/utils';

type Props = {
  size?: number;
  className?: string;
};

export function CurrentUserAvatar({ size = 40, className }: Props) {
  const { avatarUrl, initials } = useCurrentUserAvatar();

  return (
    <Avatar className={cn(className)} style={{ width: size, height: size }}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={initials} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}
