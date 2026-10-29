// The body of a P8 Google account finding: the producer's figures, bars, checklist and negative
// lists, printed as given. The card carries no write — every idea is recommend-only — so nothing
// here applies a change; copying a negative list to paste in Google Ads is not a write.

import type { PlatformCard } from '@continuum/contracts';
import { CheckIcon, CopyIcon, InfoIcon } from 'lucide-react';
import { useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  type AccountFindingStatus,
  accountBarGeometry,
  accountBarValueLabel,
  accountFindingScope,
  CHECKLIST_STATUS,
  countLabel,
  negativesClipboardText,
  percentLabel,
  RECOMMEND_ONLY_BADGE,
} from './platformCardModel';

type AccountFindingCard = Extract<PlatformCard, { variant: 'google_account_finding' }>;

const STATUS_TONE: Record<NonNullable<AccountFindingStatus>, string> = {
  done: 'text-success',
  partial: 'text-warning',
  pending: 'text-muted-foreground',
};

function Facts({ facts }: { facts: AccountFindingCard['facts'] }) {
  return (
    <dl
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm"
      data-testid="account-finding-facts"
    >
      {facts.map((fact) => (
        <div className="contents" data-testid="account-finding-fact" key={fact.label}>
          <dt className="min-w-0 text-muted-foreground">{fact.label}</dt>
          <dd className="text-right font-medium text-foreground tabular-nums">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Bars({ card }: { card: AccountFindingCard }) {
  const bars = card.bars ?? [];
  if (bars.length === 0) return null;
  const geometry = accountBarGeometry(bars);
  return (
    <ul className="space-y-2" data-testid="account-finding-bars">
      {bars.map((bar, index) => {
        const shape = geometry[index];
        return (
          <li
            className="space-y-1"
            data-flagged={bar.flagged ? 'true' : 'false'}
            data-testid="account-finding-bar"
            key={bar.label}
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span
                className={cn('min-w-0 truncate', bar.flagged ? 'text-warning' : 'text-foreground')}
              >
                {bar.label}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                <span className="text-foreground" data-testid="account-finding-bar-value">
                  {accountBarValueLabel(bar.value, card.unit, card.currency)}
                </span>
                {bar.share != null ? (
                  <span data-testid="account-finding-bar-share"> · {percentLabel(bar.share)}</span>
                ) : null}
                {bar.target_share != null ? (
                  <span data-testid="account-finding-bar-target">
                    {' '}
                    · target {percentLabel(bar.target_share)}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="relative h-1.5 w-full rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full',
                  bar.flagged ? 'bg-warning' : 'bg-muted-foreground/60',
                )}
                style={{ width: `${(shape?.width ?? 0) * 100}%` }}
              />
              {shape?.target != null ? (
                <span
                  aria-hidden="true"
                  className="-top-0.5 -translate-x-1/2 absolute h-2.5 w-0.5 rounded-full bg-foreground"
                  data-testid="account-finding-bar-tick"
                  style={{ left: `${shape.target * 100}%` }}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Checklist({ items }: { items: AccountFindingCard['checklist'] }) {
  if (items.length === 0) return null;
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm" data-testid="account-finding-checklist">
      {items.map((item) => {
        const status = item.status ? CHECKLIST_STATUS[item.status] : null;
        return (
          <li
            className="text-foreground"
            data-status={item.status ?? 'none'}
            data-testid="account-finding-step"
            key={item.label}
          >
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span>{item.label}</span>
              {status && item.status ? (
                <span
                  className={cn('text-xs', STATUS_TONE[item.status])}
                  data-testid="account-finding-step-status"
                >
                  <span aria-hidden="true">{status.glyph}</span> {status.label}
                </span>
              ) : null}
            </span>
            {item.detail ? (
              <span className="block text-muted-foreground text-xs">{item.detail}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function CopyTerms({ theme, terms }: { theme: string; terms: readonly string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(negativesClipboardText(terms))?.catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button
      aria-label={`Copy the ${theme} negatives`}
      className="gap-1.5"
      data-testid="account-finding-copy"
      onClick={copy}
      size="sm"
      type="button"
      variant="ghost"
    >
      {copied ? (
        <CheckIcon aria-hidden="true" className="size-3.5 text-success" />
      ) : (
        <CopyIcon aria-hidden="true" className="size-3.5" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function Negatives({ groups }: { groups: NonNullable<AccountFindingCard['negatives']> }) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="account-finding-negatives">
      {groups.map((group) => (
        <section
          className="space-y-1 rounded-md border border-border/70 p-2"
          data-testid="account-finding-negative-group"
          key={group.theme}
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="min-w-0 truncate font-medium text-foreground text-sm">
              {group.theme}{' '}
              <span className="font-normal text-muted-foreground">
                · {countLabel(group.terms.length)} {group.terms.length === 1 ? 'term' : 'terms'}
              </span>
            </h4>
            <CopyTerms terms={group.terms} theme={group.theme} />
          </div>
          <p className="break-words text-muted-foreground text-xs">
            {group.terms.map((term) => `"${term}"`).join(', ')}
          </p>
        </section>
      ))}
    </div>
  );
}

export function AccountFindingEvidence({ card }: { card: AccountFindingCard }) {
  return (
    <div className="space-y-3" data-idea={card.idea} data-testid="account-finding">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground text-xs" data-testid="account-finding-scope">
          {accountFindingScope(card)}
        </p>
        {card.recommend_only ? (
          <Pill className="text-xs" data-testid="account-finding-recommend-only" variant="outline">
            {RECOMMEND_ONLY_BADGE}
          </Pill>
        ) : null}
      </div>
      <Facts facts={card.facts} />
      <Bars card={card} />
      <Checklist items={card.checklist} />
      {card.negatives ? <Negatives groups={card.negatives} /> : null}
      {card.blocked ? (
        <p
          className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-muted-foreground text-xs"
          data-testid="account-finding-blocked"
        >
          <InfoIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>{card.blocked}</span>
        </p>
      ) : null}
    </div>
  );
}
