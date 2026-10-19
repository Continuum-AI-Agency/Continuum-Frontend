'use client';

import { findStampedCandidate, publishAccountLabel } from '@continuum/contracts';
import { Check, X } from 'lucide-react';
import Link from 'next/link';
import {
  AgentButton,
  AgentDecisionCard,
  MetaRow,
  PlatformTag,
} from '@/components/shared/agent-cards/agentCardKit';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CardContent, CardFooter } from '@/components/ui/card';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { type PublishAccount, usePublishAccountsState } from '@/lib/organic/publishTargets';
import { HeadlessBatchApprovalCard } from './HeadlessBatchApprovalCard';
import type { ToolApproval } from './types';

type ContentInput = {
  platform?: string;
  format?: string;
  /**
   * The publishing tools send `scheduledFor` (see PublishInputSchema). The card only ever read
   * `scheduledAt`/`scheduled_at`, so the date on a publish approval never rendered at all.
   */
  scheduledFor?: string;
  scheduledAt?: string;
  scheduled_at?: string;
  /**
   * The exact caption that will publish. The publishing tools' own descriptions tell the model
   * "the user is approving this string" — yet it used to appear only inside a truncated JSON dump
   * behind a 400ms hover delay. The one field the gate exists to show is now in the card body.
   */
  finalCaption?: string;
  angle?: string;
  topic?: string;
  description?: string;
  objective?: string;
  /**
   * Batch gates (buildDraftBlueprint) approve a SET of drafts, not one post. Without
   * this the card fell through to rendering the bare tool name — "Approve" over a
   * label, which is not informed consent for a step that spends on rendering media.
   */
  draftIds?: unknown;
  /**
   * approveDraft / publishDraft: where it posts, as getDraft printed it ('@handle', or
   * 'unavailable (why)' when the draft's stamp does not resolve). The human approves the
   * destination, not only the caption.
   */
  account?: string;
  accountId?: string;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const isUuid = (value: string) => new RegExp(`^${UUID.source}$`, 'i').test(value.trim());
const sameLabel = (a: string, b: string) =>
  a.trim().replace(/^@/, '').toLowerCase() === b.trim().replace(/^@/, '').toLowerCase();

function matchAccount(
  accounts: PublishAccount[],
  { account, accountId, platform }: { account: string; accountId?: string; platform?: string },
): { candidate: PublishAccount; needsReauth: boolean } | null {
  if (accountId) return findStampedCandidate(accounts, accountId);
  const candidate = accounts.find(
    (option) => option.platform === platform && sameLabel(publishAccountLabel(option), account),
  );
  return candidate ? { candidate, needsReauth: candidate.needsReauth } : null;
}

function ApprovalAccount({
  brandId,
  account,
  accountId,
  platform,
}: {
  brandId?: string | null;
  account: string;
  accountId?: string;
  platform?: string;
}) {
  const { accounts } = usePublishAccountsState(brandId);
  if (account.trim().startsWith('unavailable')) {
    const why = /\((.*)\)/.exec(account)?.[1]?.replace(UUID, '').trim();
    return (
      <div data-slot="approval-account" className="text-xs text-amber-700 dark:text-amber-300">
        <p className="font-medium">Account unavailable</p>
        {why && !why.includes('_') ? <p className="leading-relaxed">{why}</p> : null}
      </div>
    );
  }
  const match = matchAccount(accounts, { account, accountId, platform });
  const name = match
    ? publishAccountLabel(match.candidate)
    : isUuid(account)
      ? 'Unknown account'
      : account.trim();
  return (
    <div
      data-slot="approval-account"
      data-account-reauth={match?.needsReauth ? 'true' : undefined}
      className="flex min-w-0 items-center gap-2"
    >
      <Avatar className="size-6">
        {match?.candidate.avatarUrl ? <AvatarImage src={match.candidate.avatarUrl} alt="" /> : null}
        <AvatarFallback className="text-2xs">
          {name.replace(/^@/, '').charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{name}</p>
        {match?.needsReauth ? (
          <p className="text-2xs text-amber-700 dark:text-amber-300">
            Needs reconnecting ·{' '}
            <Link
              href="/settings?section=integrations"
              className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Reconnect
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function parseContentInput(input: unknown): ContentInput {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as ContentInput;
}

function formatScheduledAt(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new Date(raw).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function inputSummary(input: unknown): string {
  try {
    const raw = typeof input === 'string' ? input : JSON.stringify(input, null, 2);
    const text = raw.replace(UUID, '…');
    return text.length > 400 ? `${text.slice(0, 400)}…` : text;
  } catch {
    return String(input);
  }
}

type ToolApprovalCardProps = {
  approval: ToolApproval;
  /** Resolves the destination account's avatar and reconnect state; the label shows without it. */
  brandId?: string | null;
  onApproveAction: () => void;
  onDenyAction: () => void;
  disabled?: boolean;
};

export function ToolApprovalCard(props: ToolApprovalCardProps) {
  const { approval } = props;
  // A batch spends money: with no readable quote it gets the batch card's fail-closed state,
  // never the generic card's live Approve.
  if (approval.toolName === 'headlessBatchCreate') {
    return (
      <HeadlessBatchApprovalCard
        quote={approval.batchPreview ?? null}
        onApproveAction={props.onApproveAction}
        onDenyAction={props.onDenyAction}
        disabled={props.disabled}
      />
    );
  }
  return <GenericToolApprovalCard {...props} />;
}

function GenericToolApprovalCard({
  approval,
  brandId,
  onApproveAction,
  onDenyAction,
  disabled,
}: ToolApprovalCardProps) {
  const content = parseContentInput(approval.input);
  const platform = content.platform;
  const format = content.format;
  const scheduledAt = formatScheduledAt(
    content.scheduledFor ?? content.scheduledAt ?? content.scheduled_at,
  );
  const caption = content.finalCaption;
  const angle = content.angle ?? content.topic ?? content.description;
  const batchSize = Array.isArray(content.draftIds) ? content.draftIds.length : 0;
  const account = typeof content.account === 'string' ? content.account.trim() : '';

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <HoverCard openDelay={400}>
            <HoverCardTrigger
              render={
                <AgentDecisionCard className="mt-0 w-[210px] shrink-0 cursor-default transition-colors hover:border-border/70">
                  <CardContent className="space-y-2.5 px-3.5 pt-3.5 pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {platform && <PlatformTag platform={platform} />}
                      {format && (
                        <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {format}
                        </span>
                      )}
                    </div>
                    {account ? (
                      <ApprovalAccount
                        brandId={brandId}
                        account={account}
                        accountId={
                          typeof content.accountId === 'string' ? content.accountId : undefined
                        }
                        platform={platform}
                      />
                    ) : null}
                    {scheduledAt && <MetaRow items={[scheduledAt]} className="text-xs" />}
                    {caption ? (
                      <div>
                        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Caption
                        </p>
                        <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 p-1.5 text-xs leading-relaxed text-foreground/90">
                          {caption}
                        </p>
                      </div>
                    ) : null}
                    {angle && !caption && (
                      <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">
                        {angle}
                      </p>
                    )}
                    {batchSize > 0 && (
                      <p className="text-sm leading-relaxed text-foreground/80">
                        {`Generate the creative for ${batchSize} draft${batchSize === 1 ? '' : 's'}.`}
                      </p>
                    )}
                    {!platform && !angle && !caption && batchSize === 0 && (
                      <p className="text-xs text-muted-foreground">{approval.toolName}</p>
                    )}
                  </CardContent>
                  <CardFooter className="flex items-center justify-end gap-1 border-t border-border/50 px-3 py-2">
                    <AgentButton
                      variant="ghost"
                      disabled={disabled}
                      onClick={onDenyAction}
                      className="h-7 min-h-0 gap-1 px-2.5 text-xs"
                    >
                      <X className="h-3 w-3" />
                      Deny
                    </AgentButton>
                    <AgentButton
                      variant="primary"
                      disabled={disabled}
                      onClick={onApproveAction}
                      className="h-7 min-h-0 gap-1 px-2.5 text-xs"
                    >
                      <Check className="h-3 w-3" />
                      Approve
                    </AgentButton>
                  </CardFooter>
                </AgentDecisionCard>
              }
            />
            <HoverCardContent side="top" align="start" className="w-72 p-0">
              <div className="space-y-2 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {approval.toolName}
                </p>
                <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-2.5 text-2xs leading-relaxed text-muted-foreground">
                  {inputSummary(approval.input)}
                </pre>
              </div>
            </HoverCardContent>
          </HoverCard>
        }
      />
      <ContextMenuContent className="w-44">
        <ContextMenuLabel className="text-xs text-muted-foreground">
          {approval.toolName}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={disabled}
          onSelect={onApproveAction}
          className="gap-2 text-emerald-600 focus:text-emerald-600 dark:text-emerald-400"
        >
          <Check className="h-3.5 w-3.5" />
          Approve
        </ContextMenuItem>
        <ContextMenuItem
          disabled={disabled}
          onSelect={onDenyAction}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
          Deny
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
