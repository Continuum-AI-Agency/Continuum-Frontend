'use client';

/**
 * The facts a user is agreeing to when they confirm a publish: one row per platform.
 *
 * Rendered inside the publish confirmation dialog. These values come from the backend's
 * /publish-intent, which also returns the `intent_hash` the confirmation is bound to — so what is
 * shown here is provably what gets posted. The account is named by the handle the intent carries,
 * never by its id: a UUID tells nobody where a public post is going.
 */

import { PUBLISH_PLATFORM_LABELS, publishAccountLabel } from '@continuum/contracts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { isPostPlatform } from '@/lib/organic/postPlatforms';
import { PlatformIcon } from './PlatformSelector';

export type PublishIntentAccount = {
  id: string | null;
  handle?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type PublishIntentSummaryData = {
  platform?: string;
  blockers: { reason: string; message: string }[];
  /**
   * Gaps that do NOT stop the post — an unverified claim is the live example. They belong
   * in front of the person confirming it: the backend has always produced them, and until
   * they were rendered here nobody ever saw one.
   */
  warnings?: { reason: string; message: string }[];
  format: string;
  account: PublishIntentAccount;
  caption: { length: number; preview: string | null };
  media: { count: number; required: number };
};

/** How the confirm and the result toast name the account a member posts to. Never its id. */
export function intentAccountName(account: PublishIntentAccount): string {
  if (!account.id) return 'No account selected';
  if (!account.handle && !account.displayName) return 'Unknown account';
  return publishAccountLabel({
    handle: account.handle ?? null,
    displayName: account.displayName ?? null,
  });
}

export function PublishIntentSummary({ intent }: { intent: PublishIntentSummaryData }) {
  const platform = isPostPlatform(intent.platform) ? intent.platform : null;
  const name = intentAccountName(intent.account);
  return (
    <div data-publish-target={platform ?? ''} className="space-y-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {platform ? (
          <span className="flex shrink-0 items-center gap-1.5 font-medium">
            <PlatformIcon platform={platform} className="size-4" />
            {PUBLISH_PLATFORM_LABELS[platform]}
          </span>
        ) : null}
        <span data-publish-account="" className="flex min-w-0 items-center gap-1.5">
          <Avatar className="size-5 shrink-0" aria-hidden="true">
            {intent.account.avatarUrl ? (
              <AvatarImage src={intent.account.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback className="text-3xs">{name.replace('@', '').charAt(0)}</AvatarFallback>
          </Avatar>
          <span data-publish-account-name="" className="truncate">
            {name}
          </span>
        </span>
        <span className="text-secondary ml-auto shrink-0 text-xs">
          {intent.format} · {intent.media.count} of {intent.media.required} media
        </span>
      </div>

      {intent.caption.preview ? (
        // Padding sits outside the clamped box: a clamped box clips at its padding edge, so
        // padding on it would show half of the first hidden line.
        <div className="border-border bg-muted/40 rounded border p-2">
          <p data-publish-caption="" className="line-clamp-2 whitespace-pre-wrap text-xs">
            {intent.caption.preview}
          </p>
        </div>
      ) : null}

      {intent.blockers.length > 0 ? (
        <ul className="space-y-1">
          {intent.blockers.map((blocker) => (
            <li key={blocker.reason} className="text-destructive text-xs">
              {blocker.message}
            </li>
          ))}
        </ul>
      ) : null}

      {intent.warnings && intent.warnings.length > 0 ? (
        <ul className="space-y-1">
          {intent.warnings.map((warning) => (
            <li key={warning.reason} className="text-xs text-amber-600 dark:text-amber-500">
              {warning.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Every member of a group publish, one row each, in the order they will be sent. */
export function PublishTargetsSummary({ intents }: { intents: PublishIntentSummaryData[] }) {
  return (
    <ul className="divide-border space-y-2 divide-y">
      {intents.map((intent, index) => (
        <li key={intent.platform ?? index} className="pt-2 first:pt-0">
          <PublishIntentSummary intent={intent} />
        </li>
      ))}
    </ul>
  );
}
