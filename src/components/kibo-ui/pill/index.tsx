import { ChevronDownIcon, ChevronUpIcon, MinusIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Canonical status/label pill. Composes our tokenized Badge so every pill in the
// app shares one look (styleguide §5 Tags/Badges: rounded-full, dense text-2xs,
// muted/desaturated). This replaces the hand-rolled *Pill/*Chip one-offs and the
// Radix Themes Badge. All tones resolve through semantic tokens — no hardcoded
// hues — so light/dark theming stays automatic.

export type PillProps = ComponentProps<typeof Badge>;

export const Pill = ({ variant = 'secondary', className, ...props }: PillProps) => (
  <Badge
    className={cn('gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium', className)}
    variant={variant}
    {...props}
  />
);

export type PillAvatarProps = ComponentProps<typeof AvatarImage> & {
  fallback?: string;
};

export const PillAvatar = ({ fallback, className, ...props }: PillAvatarProps) => (
  <Avatar className={cn('-ml-1 size-4', className)}>
    <AvatarImage {...props} />
    <AvatarFallback className="text-3xs">{fallback}</AvatarFallback>
  </Avatar>
);

export type PillButtonProps = ComponentProps<typeof Button>;

export const PillButton = ({ className, ...props }: PillButtonProps) => (
  <Button
    className={cn('-my-1 -mr-1.5 size-5 rounded-full p-0.5 hover:bg-foreground/5', className)}
    size="icon"
    variant="ghost"
    {...props}
  />
);

export type PillStatusProps = {
  children: ReactNode;
  className?: string;
};

export const PillStatus = ({ children, className, ...props }: PillStatusProps) => (
  <div
    className={cn('flex items-center gap-1.5 border-r border-border pr-2 font-medium', className)}
    {...props}
  >
    {children}
  </div>
);

type IndicatorTone = 'success' | 'error' | 'warning' | 'info';

const INDICATOR_TONE: Record<IndicatorTone, string> = {
  success: 'bg-success',
  error: 'bg-destructive',
  warning: 'bg-warning',
  info: 'bg-primary',
};

export type PillIndicatorProps = {
  variant?: IndicatorTone;
  pulse?: boolean;
};

export const PillIndicator = ({ variant = 'success', pulse = false }: PillIndicatorProps) => (
  <span className="relative flex size-2">
    {pulse && (
      <span
        className={cn(
          'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
          INDICATOR_TONE[variant],
        )}
      />
    )}
    <span className={cn('relative inline-flex size-2 rounded-full', INDICATOR_TONE[variant])} />
  </span>
);

export type PillDeltaProps = {
  className?: string;
  delta: number;
};

export const PillDelta = ({ className, delta }: PillDeltaProps) => {
  if (!delta) {
    return <MinusIcon className={cn('size-3 text-muted-foreground', className)} />;
  }

  if (delta > 0) {
    return <ChevronUpIcon className={cn('size-3 text-success', className)} />;
  }

  return <ChevronDownIcon className={cn('size-3 text-destructive', className)} />;
};

export type PillIconProps = {
  icon: typeof ChevronUpIcon;
  className?: string;
};

export const PillIcon = ({ icon: Icon, className, ...props }: PillIconProps) => (
  <Icon className={cn('size-3 text-muted-foreground', className)} size={12} {...props} />
);

export type PillAvatarGroupProps = {
  children: ReactNode;
  className?: string;
};

export const PillAvatarGroup = ({ children, className, ...props }: PillAvatarGroupProps) => (
  <div
    className={cn(
      '-space-x-1 flex items-center',
      '[&>*:not(:first-of-type)]:[mask-image:radial-gradient(circle_9px_at_-4px_50%,transparent_99%,white_100%)]',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
