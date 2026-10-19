'use client';

// The review panel's identity row (which is the account picker), readiness line and footer.
// All presentational: the preview decides what blocks the post and what each action does, these
// decide only how it reads. A disabled action always says why in text the user can read without
// hovering.
//
// Account picker roles (the bench reads them): the trigger is a button named
// "<Platform> account: <@handle | name | Choose account>" carrying `data-account-id`; the popup is
// a Base UI Popover holding a Base UI RadioGroup — `role="radiogroup"` named by `groupLabel`, items
// `role="radio"` with `aria-checked` (NOT a Menu, whose radio items would be `menuitemradio`). Arrow
// keys move the selection as radios do; the choice is written ONCE, on a click or when the popup
// closes (Enter, Escape, click outside), so arrowing through three accounts is one PATCH, not three.

import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { PUBLISH_PLATFORM_LABELS, type PublishPlatform } from '@continuum/contracts';
import { Check, ChevronDown, CircleCheck, Loader2, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup } from '@/components/ui/radio-group';
import { accountName, findAccount, type PublishAccount } from '@/lib/organic/publishTargets';
import { cn } from '@/lib/utils';
import { PlatformIcon } from './PlatformSelector';

/** Where a person fixes a connection. Opened in a new tab so the draft stays open. */
export const INTEGRATIONS_SETTINGS_HREF = '/settings?section=integrations';

function initials(name: string): string {
  const letters = name
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('');
  return (letters || name.slice(0, 2)).slice(0, 2).toUpperCase();
}

function AccountAvatar({
  account,
  className,
}: {
  account: PublishAccount | null;
  className?: string;
}) {
  if (account?.avatarUrl) {
    return (
      <img
        src={account.avatarUrl}
        alt=""
        className={cn('shrink-0 rounded-full border border-border/60 object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-muted-foreground',
        className,
      )}
    >
      {account ? initials(accountName(account)) : '?'}
    </span>
  );
}

const linkClass =
  'shrink-0 rounded px-1 text-xs font-medium text-primary underline underline-offset-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/**
 * One account choice: a popover of radios, one per account, avatar + name. An account that needs
 * reconnecting is shown disabled with a "Reconnect" link beside it.
 */
export function AccountPicker({
  accounts,
  selectedAccountId,
  onSelect,
  groupLabel,
  trigger,
  disabled = false,
}: {
  accounts: PublishAccount[];
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
  /** The radiogroup's name, also shown as the popup heading. */
  groupLabel: string;
  /** The trigger button element (Base UI `render`). */
  trigger: React.ReactElement;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  // The stamp may be a twin's id: the picker shows the candidate it belongs to as chosen.
  const selectedId = findAccount(accounts, selectedAccountId)?.id ?? selectedAccountId;
  const [pending, setPending] = React.useState(selectedId);
  const byPointer = React.useRef(false);
  // Escape backs out: an account arrowed to but not confirmed never changes where a post goes.
  const cancelled = React.useRef(false);
  const headingId = React.useId();
  const reauthId = React.useId();

  const close = (choice: string | null) => {
    setOpen(false);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (choice && choice !== selectedId) onSelect(choice);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          cancelled.current = false;
          setPending(selectedId);
          setOpen(true);
        } else {
          close(pending);
        }
      }}
    >
      <PopoverTrigger disabled={disabled} render={trigger} />
      <PopoverContent
        align="start"
        className="w-64 p-1"
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape') cancelled.current = true;
        }}
      >
        <p id={headingId} className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
          {groupLabel}
        </p>
        <RadioGroup
          aria-label={groupLabel}
          value={pending ?? ''}
          onValueChange={(value) => {
            const choice = String(value);
            setPending(choice);
            if (byPointer.current) close(choice);
          }}
          onPointerDownCapture={() => {
            byPointer.current = true;
          }}
          onKeyDownCapture={(event) => {
            byPointer.current = false;
            if (event.key === 'Enter') {
              event.preventDefault();
              close(pending);
            }
          }}
          className="gap-0.5"
        >
          {accounts.map((account) => {
            const checked = account.id === pending;
            return (
              <div key={account.id} className="flex items-center gap-1">
                <RadioPrimitive.Root
                  value={account.id}
                  disabled={account.needsReauth}
                  aria-describedby={account.needsReauth ? `${reauthId}-${account.id}` : undefined}
                  data-account-id={account.id}
                  className="flex min-w-0 flex-1 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none hover:bg-muted focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring data-disabled:cursor-not-allowed data-disabled:text-muted-foreground data-disabled:hover:bg-transparent"
                >
                  <AccountAvatar account={account} className="size-6" />
                  <span className="min-w-0 flex-1 truncate">{accountName(account)}</span>
                  {checked ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                </RadioPrimitive.Root>
                {account.needsReauth ? (
                  <>
                    <span id={`${reauthId}-${account.id}`} className="sr-only">
                      Needs reconnecting before it can post
                    </span>
                    <a
                      href={INTEGRATIONS_SETTINGS_HREF}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Reconnect ${accountName(account)}`}
                      className={linkClass}
                    >
                      Reconnect
                    </a>
                  </>
                ) : null}
              </div>
            );
          })}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Who, what and when: the account the post goes out as — which is also where it is changed —
 * with the platform, the format and the time under it. The account shown is the frame's own
 * stamp resolved against the platform's candidates, so it reads right before any dry run answers
 * (A4) and is never a brand name or an id. The heading carries `titleRef` so the panel can land
 * focus on it when it opens.
 */
export function ReviewIdentityRow({
  titleRef,
  insetStart = false,
  platform,
  accounts,
  selectedAccountId,
  onSelectAccount,
  pickerDisabledReason = null,
  accountsLoading = false,
  summary,
  menu,
  onClose,
}: {
  titleRef?: React.Ref<HTMLHeadingElement>;
  /** Leaves room for the wide panel's collapse chevron, which sits over the row's start. */
  insetStart?: boolean;
  platform: PublishPlatform;
  /** This platform's candidate accounts. */
  accounts: PublishAccount[];
  /** The frame draft's stamp (`platform_account_id`). */
  selectedAccountId: string | null;
  /** Absent: the account is shown, not changeable. */
  onSelectAccount?: (accountId: string) => void;
  /** Non-null disables the picker and is shown under the row. */
  pickerDisabledReason?: string | null;
  /** The candidates are still loading: the stamp is not yet known to be missing. */
  accountsLoading?: boolean;
  /** "Carousel · Tue Oct 13, 10:00 AM PDT". */
  summary: string;
  menu: React.ReactNode;
  onClose?: () => void;
}) {
  const label = PUBLISH_PLATFORM_LABELS[platform];
  const stamped = findAccount(accounts, selectedAccountId);
  const name = stamped ? accountName(stamped) : null;
  const noAccounts = accounts.length === 0 && !accountsLoading;
  const reasonId = React.useId();
  const accountText = (
    <span
      data-review-account=""
      data-account-id={selectedAccountId ?? ''}
      className={cn(
        'truncate',
        !name && !accountsLoading && 'text-amber-700 dark:text-amber-300',
        !name && accountsLoading && 'text-muted-foreground',
      )}
    >
      {name ??
        (accountsLoading
          ? 'Loading account…'
          : noAccounts
            ? 'No account connected'
            : 'Choose account')}
    </span>
  );

  return (
    <div
      data-review-identity=""
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-border/60 py-2 pr-2',
        insetStart ? 'pl-8' : 'pl-3',
      )}
    >
      <AccountAvatar account={stamped} className="size-8" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex min-w-0 items-center gap-1">
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="flex min-w-0 items-center gap-1.5 text-sm font-semibold focus:outline-none"
          >
            {onSelectAccount && !noAccounts ? (
              <AccountPicker
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onSelect={onSelectAccount}
                groupLabel={`${label} account`}
                disabled={pickerDisabledReason !== null || accountsLoading}
                trigger={
                  <button
                    type="button"
                    aria-label={`${label} account: ${name ?? (accountsLoading ? 'Loading account…' : 'Choose account')}`}
                    aria-describedby={pickerDisabledReason ? reasonId : undefined}
                    data-account-id={selectedAccountId ?? ''}
                    className="-mx-1 flex min-w-0 items-center gap-1.5 rounded px-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:hover:bg-transparent"
                  >
                    <PlatformIcon platform={platform} className="size-3.5" />
                    {accountText}
                    <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden="true" />
                  </button>
                }
              />
            ) : (
              <>
                <PlatformIcon platform={platform} className="size-3.5" />
                {accountText}
              </>
            )}
          </h2>
          {noAccounts ? (
            <a
              href={INTEGRATIONS_SETTINGS_HREF}
              target="_blank"
              rel="noreferrer"
              className={linkClass}
            >
              Connect
            </a>
          ) : null}
        </div>
        <p data-review-when="" className="truncate text-xs text-muted-foreground">
          {summary}
        </p>
        {pickerDisabledReason ? (
          <p
            id={reasonId}
            data-account-picker-reason=""
            className="truncate text-xs text-muted-foreground"
          >
            {pickerDisabledReason}
          </p>
        ) : null}
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
