'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

// The rules list — what someone sees on opening the tab.
//
// Its first job is not editing, it is answering "what is my account sending
// right now?". That question has no other home in the product, and the rules
// send messages to strangers on the account owner's behalf, so the state of
// each rule and the way to stop all of them are the two things that read first.
//
// Decisions worth knowing before changing this file:
// - The open row is marked with aria-current and a filled background, matching
//   CompetitorRail and BoardsPanel. It keeps full contrast even when switched
//   off, because what is being edited has to stay legible.
// - Click counts are pinned right with tabular figures so they line up into a
//   column that reads down across rows.
// - A rule with no link shows no count, and a link nobody clicked shows zero.
//   Absent and zero are different answers; collapsing them prints a
//   measurement nobody took.

import type { CommentTriggerRule, TrackedLinkStats } from '@continuum/contracts';
import { MessageSquare, MousePointerClick, Plus, Power } from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PANEL_HEADER_FRAME, PANEL_TITLE } from './panelHeader';

/** Live, scheduled, expired or off — the four states a person needs to tell apart at a glance. */
type RuleState = 'live' | 'scheduled' | 'expired' | 'off';

export function ruleState(rule: CommentTriggerRule, now: Date): RuleState {
  if (!rule.enabled) return 'off';
  const at = now.getTime();
  if (rule.activeFrom !== null && at < Date.parse(rule.activeFrom)) return 'scheduled';
  if (rule.activeUntil !== null && at > Date.parse(rule.activeUntil)) return 'expired';
  return 'live';
}

const STATE_LABEL = {
  live: 'ruleStateActive',
  scheduled: 'ruleStateScheduled',
  expired: 'ruleStateEnded',
  off: 'ruleStateOff',
} as const satisfies Record<RuleState, string>;

const STATE_CLASS: Record<RuleState, string> = {
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  scheduled: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  expired: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  off: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

function formatDay(iso: string, locale: UiLocale): string {
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/** The live window in words, or nothing when the rule runs until switched off. */
function windowLabel(
  rule: CommentTriggerRule,
  locale: UiLocale,
  translate: (key: 'ruleWindowFrom' | 'ruleWindowUntil', values: { date: string }) => string,
): string | null {
  if (rule.activeFrom === null && rule.activeUntil === null) return null;
  if (rule.activeFrom !== null && rule.activeUntil !== null) {
    return `${formatDay(rule.activeFrom, locale)} – ${formatDay(rule.activeUntil, locale)}`;
  }
  if (rule.activeFrom !== null)
    return translate('ruleWindowFrom', { date: formatDay(rule.activeFrom, locale) });
  return rule.activeUntil === null
    ? null
    : translate('ruleWindowUntil', { date: formatDay(rule.activeUntil, locale) });
}

/** Null, not zero, when the rule has no link or its count has not arrived. */
function clicksFor(rule: CommentTriggerRule, stats: Map<string, TrackedLinkStats>): number | null {
  if (rule.trackedLinkId === null) return null;
  return stats.get(rule.trackedLinkId)?.clicks ?? null;
}

function RuleRow({
  rule,
  now,
  clicks,
  isEditing,
  onEdit,
}: {
  rule: CommentTriggerRule;
  now: Date;
  clicks: number | null;
  isEditing: boolean;
  onEdit: (rule: CommentTriggerRule) => void;
}) {
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
  const state = ruleState(rule, now);
  const window = windowLabel(rule, uiLocale, uiText);

  return (
    <button
      type="button"
      onClick={() => onEdit(rule)}
      aria-current={isEditing}
      className={cn(
        'flex w-full flex-col gap-2 border-b px-4 py-3 text-left transition-colors last:border-b-0',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isEditing ? 'bg-muted' : 'hover:bg-muted/40',
        state !== 'live' && !isEditing && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('h-5 px-1.5 text-2xs', STATE_CLASS[state])}>
          {uiText(STATE_LABEL[state])}
        </Badge>
        <span className="text-sm font-medium">
          {rule.matchMode === 'any_comment' ? (
            <span className="text-muted-foreground">{uiText('any_comment_e950036')}</span>
          ) : (
            rule.keywords.join(', ')
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {rule.postScope === 'all_posts'
            ? uiText('on_every_post_3d14298')
            : uiText('rulePostScope', { count: rule.platformPostIds.length })}
        </span>
        {window ? <span className="text-xs text-muted-foreground">· {window}</span> : null}
      </div>
      <div className="flex items-center gap-2.5">
        <p className="line-clamp-1 min-w-0 flex-1 text-xs text-muted-foreground">
          {rule.replyMessage}
        </p>
        {clicks === null ? null : (
          <span
            className="flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums text-foreground"
            title={
              clicks === 0
                ? uiText('nobody_has_opened_this_link_yet_598120c')
                : uiText('ruleOpenedLink', { count: clicks })
            }
          >
            <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
            {clicks}
          </span>
        )}
      </div>
    </button>
  );
}

export function CommentRulesList({
  rules,
  linkStats = [],
  selectedRuleId = null,
  isLoading,
  onCreate,
  onEdit,
  onDisableAll,
  isDisablingAll,
  now = new Date(),
}: {
  rules: CommentTriggerRule[];
  linkStats?: TrackedLinkStats[];
  /** The rule whose editor is open, so the list can say which one that is. */
  selectedRuleId?: string | null;
  isLoading: boolean;
  onCreate: () => void;
  onEdit: (rule: CommentTriggerRule) => void;
  onDisableAll: () => void;
  isDisablingAll: boolean;
  now?: Date;
}) {
  const uiText = useTranslations('organic');
  const liveCount = rules.filter((rule) => ruleState(rule, now) === 'live').length;
  const statsByLink = React.useMemo(
    () => new Map(linkStats.map((entry) => [entry.linkId, entry])),
    [linkStats],
  );
  const totalClicks = React.useMemo(
    () => linkStats.reduce((sum, entry) => sum + entry.clicks, 0),
    [linkStats],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border">
      <div
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${PANEL_HEADER_FRAME}`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className={PANEL_TITLE}>{uiText('comment_rules_579e3a4')}</h2>
          {liveCount > 0 ? (
            <span className="text-xs leading-none text-muted-foreground">
              {uiText.rich('sentence_34ce920e2a7e', { count: liveCount })}
            </span>
          ) : null}
          {linkStats.length > 0 ? (
            <span className="flex items-center gap-1 text-sm font-medium leading-none tabular-nums text-foreground">
              <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {uiText('ruleClicks', { count: totalClicks })}
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
              {isDisablingAll ? uiText('turning_off_c62412a') : uiText('turn_all_off_59d74fd')}
            </Button>
          ) : null}
          <Button size="sm" onClick={onCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {uiText('new_rule_99cd24e')}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            {uiText('loading_rules_354167f')}
          </p>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">{uiText('no_rules_yet_d29cf78')}</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {uiText('a_rule_watches_your_posts_for_a_word_replies__14d551e')}
            </p>
            <Button size="sm" variant="outline" onClick={onCreate} className="mt-1 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {uiText('create_the_first_one_6bd8198')}
            </Button>
          </div>
        ) : (
          rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              now={now}
              clicks={clicksFor(rule, statsByLink)}
              isEditing={rule.id === selectedRuleId}
              onEdit={onEdit}
            />
          ))
        )}
      </div>
    </div>
  );
}
