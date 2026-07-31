'use client';

import type * as React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { cn } from '@/lib/utils';
import { draftStatusPresentation, platformBadgeVariants } from './draft-card-styles';
import type { OrganicDraftStatus, OrganicPlatformTag } from './types';

const PLATFORM_ABBR: Record<string, string> = {
  instagram: 'IG',
  linkedin: 'LI',
  facebook: 'FB',
  tiktok: 'TT',
  youtube: 'YT',
  twitter: 'TW',
};

export function PlatformBadge({ platform }: { platform: OrganicPlatformTag }) {
  const platformKey = platform as 'instagram' | 'linkedin' | 'facebook' | 'tiktok' | 'youtube';
  return (
    <span className={cn(platformBadgeVariants({ platform: platformKey }), 'px-1.5 py-0 text-3xs')}>
      {PLATFORM_ABBR[platform] ?? platform.slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * The one readable status marker in the planner. A draft's status is a word, not an
 * 8px dot: the calendar card, the hover preview and the list row all render this so
 * "Scheduled" and "Published" can never read as the same thing.
 */
export function StatusBadge({
  status,
  format,
  className,
}: {
  status: OrganicDraftStatus;
  format?: string;
  className?: string;
}) {
  if (format === 'Newsletter') {
    return (
      <Pill
        variant="outline"
        className={cn('border-destructive/30 bg-destructive/10 text-destructive', className)}
        title="Newsletter"
      >
        Newsletter
      </Pill>
    );
  }

  const { label, hint, tone, pillClassName } = draftStatusPresentation(status);

  return (
    <Pill variant={tone} className={cn(pillClassName, className)} title={hint} aria-label={hint}>
      {label}
    </Pill>
  );
}

/**
 * The status marker for surfaces too narrow for the word — the month grid's chip, which
 * is coloured by PLATFORM and so carried no status signal at all. The dot takes the
 * canonical strip hue, and the label it hides visually is still announced and hoverable,
 * so "every status is labeled" holds on the month grid too.
 */
export function StatusDot({ status }: { status: OrganicDraftStatus }): React.JSX.Element {
  const { label, hint, strip } = draftStatusPresentation(status);

  return (
    <span className="inline-flex shrink-0 items-center" title={hint}>
      <span className={cn('size-1.5 rounded-full', strip)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
