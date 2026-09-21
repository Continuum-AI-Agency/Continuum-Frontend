'use client';

// The rules list — what someone sees on opening the tab.
//
// Its first job is not editing, it is answering "what is my account sending
// right now?". That question has no other home in the product, and the rules
// send messages to strangers on the account owner's behalf, so the state of
// each rule and the way to stop all of them are the two things that read first.

import type { CommentTriggerRule } from '@continuum/contracts';
import { MessageSquare, Plus, Power } from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Live, scheduled, expired or off — the four states a person needs to tell apart at a glance. */
type RuleState = 'live' | 'scheduled' | 'expired' | 'off';

export function ruleState(rule: CommentTriggerRule, now: Date): RuleState {
  if (!rule.enabled) return 'off';
  const at = now.getTime();
  if (rule.activeFrom !== null && at < Date.parse(rule.activeFrom)) return 'scheduled';
  if (rule.activeUntil !== null && at > Date.parse(rule.activeUntil)) return 'expired';
  return 'live';
}

const STATE_LABEL: Record<RuleState, string> = {
  live: 'Active',
  scheduled: 'Scheduled',
  expired: 'Ended',
  off: 'Off',
};

const STATE_CLASS: Record<RuleState, string> = {
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  scheduled: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  expired: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  off: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The live window in words, or nothing when the rule runs until switched off. */
function windowLabel(rule: CommentTriggerRule): string | null {
  if (rule.activeFrom === null && rule.activeUntil === null) return null;
  if (rule.activeFrom !== null && rule.activeUntil !== null) {
    return `${formatDay(rule.activeFrom)} – ${formatDay(rule.activeUntil)}`;
  }
  if (rule.activeFrom !== null) return `From ${formatDay(rule.activeFrom)}`;
  return `Until ${formatDay(rule.activeUntil as string)}`;
}

function RuleRow({
  rule,
  now,
  onEdit,
}: {
  rule: CommentTriggerRule;
  now: Date;
  onEdit: (rule: CommentTriggerRule) => void;
}) {
  const state = ruleState(rule, now);
  const window = windowLabel(rule);

  return (
    <button
      type="button"
      onClick={() => onEdit(rule)}
      className={cn(
        'flex w-full flex-col gap-2 border-b px-4 py-3 text-left transition-colors last:border-b-0',
        'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        state !== 'live' && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('h-5 px-1.5 text-2xs', STATE_CLASS[state])}>
          {STATE_LABEL[state]}
        </Badge>
        <span className="text-sm font-medium">
          {rule.matchMode === 'any_comment' ? (
            <span className="text-muted-foreground">Any comment</span>
          ) : (
            rule.keywords.join(', ')
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {rule.postScope === 'all_posts'
            ? 'on every post'
            : `on ${rule.platformPostIds.length} post${rule.platformPostIds.length === 1 ? '' : 's'}`}
        </span>
        {window ? <span className="text-xs text-muted-foreground">· {window}</span> : null}
      </div>
      <p className="line-clamp-1 text-xs text-muted-foreground">{rule.replyMessage}</p>
    </button>
  );
}

export function CommentRulesList({
  rules,
  isLoading,
  onCreate,
  onEdit,
  onDisableAll,
  isDisablingAll,
  now = new Date(),
}: {
  rules: CommentTriggerRule[];
  isLoading: boolean;
  onCreate: () => void;
  onEdit: (rule: CommentTriggerRule) => void;
  onDisableAll: () => void;
  isDisablingAll: boolean;
  now?: Date;
}) {
  const liveCount = rules.filter((rule) => ruleState(rule, now) === 'live').length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Comment rules</h2>
          {liveCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {liveCount} sending automatically
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {liveCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDisableAll}
              disabled={isDisablingAll}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Power className="h-3.5 w-3.5" />
              {isDisablingAll ? 'Turning off…' : 'Turn all off'}
            </Button>
          ) : null}
          <Button size="sm" onClick={onCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New rule
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
        {isLoading ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">Loading rules…</p>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">No rules yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              A rule watches your posts for a word, replies to the comment, and sends that person a
              direct message with your link.
            </p>
            <Button size="sm" variant="outline" onClick={onCreate} className="mt-1 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Create the first one
            </Button>
          </div>
        ) : (
          rules.map((rule) => <RuleRow key={rule.id} rule={rule} now={now} onEdit={onEdit} />)
        )}
      </div>
    </div>
  );
}
