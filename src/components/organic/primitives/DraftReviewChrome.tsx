'use client';

// The review panel's readiness line and footer. Both are presentational: the preview
// decides what blocks the post and what each action does, these decide only how it reads.
// A disabled action always says why in text the user can read without hovering.

import type { PublishPlatform } from '@continuum/contracts';
import { CircleCheck, Loader2, X } from 'lucide-react';
import * as React from 'react';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  TikTokIcon,
  XIcon,
  YouTubeIcon,
} from '@/components/shared/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PLATFORM_GLYPH: Record<PublishPlatform, React.ComponentType<{ className?: string }>> = {
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  linkedin: LinkedInIcon,
  tiktok: TikTokIcon,
  youtube: YouTubeIcon,
  x: XIcon,
};

function initials(name: string): string {
  const letters = name
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('');
  return (letters || name.slice(0, 2)).slice(0, 2).toUpperCase();
}

export type ReviewAccount = {
  /** The handle the post goes out as, e.g. "@vivo47.fit"; null when none resolves. */
  handle: string | null;
  avatarUrl: string | null;
};

/**
 * Who, what and when, read-only: the account the post goes out as, with the platform, the
 * format and the time under it. Editing those lives in the footer, beside the action they
 * feed, so this row holds only two controls (the ⋯ menu and close). The heading carries
 * `titleRef` so the panel can land focus on it when it opens.
 */
export function ReviewIdentityRow({
  titleRef,
  insetStart = false,
  account,
  platform,
  summary,
  menu,
  onClose,
}: {
  titleRef?: React.Ref<HTMLHeadingElement>;
  /** Leaves room for the wide panel's collapse chevron, which sits over the row's start. */
  insetStart?: boolean;
  account: ReviewAccount;
  platform: PublishPlatform;
  /** "Carousel · Tue Oct 13, 10:00 AM PDT". */
  summary: string;
  menu: React.ReactNode;
  onClose?: () => void;
}) {
  const Glyph = PLATFORM_GLYPH[platform];
  return (
    <div
      data-review-identity=""
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-border/60 py-2 pr-2',
        insetStart ? 'pl-8' : 'pl-3',
      )}
    >
      {account.avatarUrl ? (
        <img
          src={account.avatarUrl}
          alt=""
          className="size-8 shrink-0 rounded-full border border-border/60 object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-muted-foreground"
        >
          {account.handle ? initials(account.handle) : '?'}
        </span>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="flex min-w-0 items-center gap-1.5 text-sm font-semibold focus:outline-none"
        >
          <Glyph className="size-3.5 shrink-0" />
          <span
            data-review-account=""
            className={cn('truncate', !account.handle && 'text-amber-700 dark:text-amber-300')}
          >
            {account.handle ?? 'No account connected'}
          </span>
        </h2>
        <p data-review-when="" className="truncate text-xs text-muted-foreground">
          {summary}
        </p>
      </div>
      {menu}
      {onClose && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close preview"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

/** Where a readiness item jumps to. Mirrors the shared gate's `fix` targets. */
export type ReadinessFixTarget = 'caption' | 'media' | 'account' | 'format' | 'cover' | 'options';

export type ReadinessItem = { key: string; message: string; fix: ReadinessFixTarget };

export function ReadinessLine({
  items,
  readyLabel,
  onFix,
}: {
  items: ReadinessItem[];
  readyLabel: string;
  onFix: (target: ReadinessFixTarget) => void;
}) {
  const ready = items.length === 0;
  return (
    <div
      data-readiness={ready ? 'ready' : 'blocked'}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-xs"
    >
      {/* ONE live element in both states, so going from blocked to ready (or back) is announced.
          Only the count is live: a region around the fix buttons re-reads all of them per edit. */}
      <span
        role="status"
        className={
          ready
            ? 'flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400'
            : 'font-semibold text-amber-700 dark:text-amber-300'
        }
      >
        {ready ? <CircleCheck className="size-3.5 shrink-0" aria-hidden /> : null}
        {ready ? readyLabel : `${items.length} to fix`}
      </span>
      {ready ? null : (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {items.map((item, index) => (
            <li key={item.key}>
              <button
                type="button"
                data-readiness-fix={item.fix}
                onClick={() => onFix(item.fix)}
                className="rounded px-1 py-0.5 text-left text-foreground underline decoration-amber-500/60 underline-offset-2 transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {index + 1}. {item.message}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export type ReviewAction = {
  label: string;
  busyLabel: string;
  busy: boolean;
  /** Non-null disables the action and is shown under it, verbatim. */
  disabledReason: string | null;
  onClick: () => void;
  icon?: React.ReactNode;
};

/**
 * Variant C's footer: the schedule chips with the secondary action, the primary action, and
 * under it the note that explains it — the readiness line, or why the action is unavailable.
 * A disabled action with no note still shows its reason, as text tied to the button.
 */
export function ReviewFooter({
  when,
  primary,
  secondary,
  note,
  status,
  alert,
}: {
  /** The platform, format and time editors. */
  when?: React.ReactNode;
  primary: ReviewAction | null;
  secondary: ReviewAction | null;
  note?: React.ReactNode;
  /** Shown in place of the primary action once the post is past review. */
  status?: React.ReactNode;
  alert?: React.ReactNode;
}) {
  const noteId = React.useId();
  const reason = primary?.disabledReason ?? secondary?.disabledReason ?? null;
  const shownNote =
    note ??
    (reason ? (
      <p data-footer-reason className="text-xs text-muted-foreground">
        {reason}
      </p>
    ) : null);
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 bg-background/90 p-3">
      {alert}
      {(when || secondary) && (
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">{when}</div>
          {secondary && (
            <ActionButton
              action={secondary}
              variant="ghost"
              size="sm"
              describedBy={shownNote ? noteId : undefined}
            />
          )}
        </div>
      )}
      {primary && (
        <ActionButton
          action={primary}
          variant="cta"
          size="lg"
          describedBy={shownNote ? noteId : undefined}
        />
      )}
      {status}
      {shownNote && <div id={noteId}>{shownNote}</div>}
    </div>
  );
}

function ActionButton({
  action,
  variant,
  size,
  describedBy,
}: {
  action: ReviewAction;
  variant: 'cta' | 'ghost';
  size: 'sm' | 'lg';
  describedBy: string | undefined;
}) {
  const disabled = action.busy || action.disabledReason !== null;
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={disabled}
      // Still a tab stop when disabled: its reason (aria-describedby) is then reachable by
      // keyboard, and a press while busy does not drop focus to the page.
      focusableWhenDisabled
      aria-busy={action.busy || undefined}
      aria-describedby={disabled ? describedBy : undefined}
      onClick={action.onClick}
      className={cn('min-w-0', variant === 'cta' ? 'w-full' : 'shrink-0')}
    >
      {action.busy ? <Loader2 className="animate-spin" aria-hidden /> : action.icon}
      <span className="truncate">{action.busy ? action.busyLabel : action.label}</span>
    </Button>
  );
}
