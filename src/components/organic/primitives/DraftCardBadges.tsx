'use client';

import { PUBLISH_PLATFORM_LABELS, PUBLISH_PLATFORM_ORDER } from '@continuum/contracts';
import * as React from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { cardCaption } from '@/lib/organic/groupDraft';
import { isPostPlatform } from '@/lib/organic/postPlatforms';
import { accountName, findAccount, usePublishAccounts } from '@/lib/organic/publishTargets';
import { cn } from '@/lib/utils';
import { draftStatusPresentation } from './draft-card-styles';
import { PlatformIcon } from './PlatformSelector';
import type { OrganicCalendarDraft, OrganicDraftStatus } from './types';

/**
 * The caption a card previews: what its first platform receives, hashtags included — the string
 * that gets sent, not the raw body (K8).
 */
export function useCardCaption(draft: OrganicCalendarDraft): string {
  const platform = draft.platforms.find(isPostPlatform);
  return React.useMemo(
    () => (platform ? cardCaption(draft, platform) : draft.captionPreview),
    [platform, draft],
  );
}

/**
 * Where a card's post goes: one brand mark per member platform, in the contracts order, and the
 * handle of the account its own row posts to. Every calendar view renders this, so a group reads
 * the same in the week grid, the month and the list. The account is never shown as its id.
 */
export function CardTargets({
  draft,
  brandId,
  className,
}: {
  draft: Pick<OrganicCalendarDraft, 'platforms' | 'targetAccountId'>;
  /** Defaults to the workspace's brand. */
  brandId?: string;
  className?: string;
}) {
  const accounts = usePublishAccounts(brandId);
  const platforms = PUBLISH_PLATFORM_ORDER.filter((platform) => draft.platforms.includes(platform));
  const account = findAccount(accounts, draft.targetAccountId);
  // ponytail: an empty list is "still loading" or "none connected"; the card stays quiet for
  // both and the review panel names which.
  const accountText = account
    ? accountName(account)
    : accounts.length > 0
      ? 'Choose account'
      : null;
  return (
    <span className={cn('flex min-w-0 items-center gap-1', className)}>
      <span data-card-platforms="" className="flex shrink-0 items-center gap-0.5">
        {platforms.map((platform) => (
          <PlatformIcon key={platform} platform={platform} className="size-3" />
        ))}
        <span className="sr-only">
          {platforms.map((platform) => PUBLISH_PLATFORM_LABELS[platform]).join(', ')}
        </span>
      </span>
      {accountText ? (
        <span data-card-account="" className="min-w-0 truncate">
          {accountText}
        </span>
      ) : null}
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
