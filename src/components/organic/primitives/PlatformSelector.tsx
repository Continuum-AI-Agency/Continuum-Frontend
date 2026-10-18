'use client';

// The one platform multi-select (end state 6). Roles the benches rely on:
// - trigger: a button whose accessible name starts `Change platforms` and names every selected
//   platform (`Change platforms — Instagram, TikTok selected`);
// - items: Base UI Menu checkbox items, role `menuitemcheckbox`, named EXACTLY by the contracts
//   label, in `PUBLISH_PLATFORM_ORDER`; a disabled one is `aria-disabled` and shows its reason as
//   visible text in `[data-platform-reason]` (also its accessible description).
// It holds no state: the caller owns `selected` and decides what a toggle does.

import {
  PUBLISH_PLATFORM_LABELS,
  PUBLISH_PLATFORM_ORDER,
  type PublishPlatform,
} from '@continuum/contracts';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import {
  FacebookIcon,
  type IconComponent,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from '@/components/shared/icons';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PlatformVerdict } from '@/lib/organic/platformSelection';
import { cn } from '@/lib/utils';

const PLATFORM_ICONS: Readonly<Record<PublishPlatform, IconComponent>> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  linkedin: LinkedInIcon,
  tiktok: TikTokIcon,
  youtube: YouTubeIcon,
  x: XIcon,
};

/** A platform's brand mark. Decorative: the label next to it names the platform. */
export function PlatformIcon({
  platform,
  className,
}: {
  platform: PublishPlatform;
  className?: string;
}) {
  const Icon = PLATFORM_ICONS[platform];
  // aria-hidden: the icon carries a `title`, which would otherwise join the accessible name.
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      <Icon className={className} />
    </span>
  );
}

export type PlatformSelectorProps = {
  selected: PublishPlatform[];
  verdicts: Record<PublishPlatform, PlatformVerdict>;
  onToggle: (platform: PublishPlatform, next: boolean) => void;
  /** Disables the whole selector, shown next to it (e.g. "Saving…" before the draft has a row). */
  disabledReason?: string | null;
  className?: string;
};

const LAST_PLATFORM_REASON = 'A post needs at least one platform';

function triggerText(labels: string[]): string {
  if (labels.length === 0) return 'Choose platforms';
  if (labels.length <= 2) return labels.join(' + ');
  return `${labels.length} platforms`;
}

export function PlatformSelector({
  selected,
  verdicts,
  onToggle,
  disabledReason,
  className,
}: PlatformSelectorProps) {
  const reasonIdPrefix = React.useId();
  const ordered = PUBLISH_PLATFORM_ORDER.filter((platform) => selected.includes(platform));
  const labels = ordered.map((platform) => PUBLISH_PLATFORM_LABELS[platform]);

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={Boolean(disabledReason)}
          render={
            <button
              type="button"
              aria-label={`Change platforms — ${labels.length > 0 ? labels.join(', ') : 'none'} selected`}
              aria-describedby={disabledReason ? `${reasonIdPrefix}-selector` : undefined}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-foreground/90 transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center gap-0.5">
                {ordered.map((platform) => (
                  <PlatformIcon key={platform} platform={platform} className="size-3.5" />
                ))}
              </span>
              {triggerText(labels)}
              <ChevronDown className="size-3 opacity-60" aria-hidden="true" />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-64">
          {PUBLISH_PLATFORM_ORDER.map((platform) => {
            const label = PUBLISH_PLATFORM_LABELS[platform];
            const checked = selected.includes(platform);
            const verdict = verdicts[platform];
            const reason =
              checked && selected.length === 1
                ? LAST_PLATFORM_REASON
                : verdict && !verdict.available
                  ? (verdict.reason ?? `${label} is unavailable`)
                  : null;
            const reasonId = `${reasonIdPrefix}-${platform}`;
            return (
              <DropdownMenuCheckboxItem
                key={platform}
                checked={checked}
                disabled={reason !== null}
                aria-label={label}
                aria-describedby={reason ? reasonId : undefined}
                data-platform={platform}
                onCheckedChange={(next) => onToggle(platform, next)}
                className="items-start data-disabled:opacity-100"
              >
                <PlatformIcon platform={platform} className="mt-0.5 size-4" />
                <span className="flex min-w-0 flex-col">
                  <span className={cn(reason && 'text-muted-foreground')}>{label}</span>
                  {reason ? (
                    <span
                      id={reasonId}
                      data-platform-reason=""
                      className="text-[11px] leading-snug text-muted-foreground"
                    >
                      {reason}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {disabledReason ? (
        <span
          id={`${reasonIdPrefix}-selector`}
          data-platform-selector-reason=""
          className="text-xs text-muted-foreground"
        >
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
