'use client';

// The search-term explorer (P6 view 4): Search and Performance Max terms grouped by root, each
// root opening onto its terms. A free selection is a question for Jaina, never a write: batch
// negatives and promotions go only through the Optimizer's G05 cards, and a term one of them
// already proposes says so.

import type { GoogleSignalsRead, PlatformCard } from '@continuum/contracts';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { jainaPromptHref } from '@/lib/jaina/deepLink';
import { ChartEmpty } from '../../../charts/ChartStates';
import { formatCurrency } from '../../../format';
import { windowRangeLabel } from '../../platforms/googleAdsOverviewModel';
import { type GoogleReadTarget, useGoogleSignals } from '../googleReads';
import { resultsText } from './cell';
import {
  type CardCover,
  groupByRoot,
  isPmaxTerm,
  jainaTermsPrompt,
  ROOTS_SHOWN,
  type RootGroup,
  type SearchTerm,
  searchTermsOf,
  TERMS_SHOWN,
  termKey,
  termsInCards,
} from './searchTermRoots';
import { ReadGate, ScopeLine, usePendingGoogleCards, type ViewRead, viewRead } from './viewParts';

const STATUS_WORDS: Readonly<Record<string, string>> = {
  ADDED: 'Keyword',
  EXCLUDED: 'Excluded',
  ADDED_EXCLUDED: 'Keyword · excluded',
};

const COVER_WORDS: Record<CardCover, string> = {
  negatives: 'In a Negatives card',
  promote: 'In a Search term card',
};

function figures(spend: number, clicks: number, conversions: number, currency: string | null) {
  return `${formatCurrency(spend, currency)} · ${clicks.toLocaleString('en-US')} clicks · ${resultsText(conversions)} conv.`;
}

function TermRow({
  term,
  checked,
  onToggle,
  cover,
  currency,
}: {
  term: SearchTerm;
  checked: boolean;
  onToggle: () => void;
  cover: CardCover | undefined;
  currency: string | null;
}) {
  const id = `search-term-${termKey(term)}`;
  const status = term.status ? STATUS_WORDS[term.status] : undefined;
  return (
    <li className="flex items-start gap-2 py-1.5" data-testid="search-term">
      <Checkbox
        aria-label={`Select search term ${term.term}`}
        checked={checked}
        id={id}
        onCheckedChange={onToggle}
      />
      <label className="min-w-0 flex-1 cursor-pointer" htmlFor={id}>
        <span className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="break-words">{term.term}</span>
          {isPmaxTerm(term) ? <Badge variant="muted">PMax</Badge> : null}
          {status ? <Badge variant="secondary">{status}</Badge> : null}
          {cover ? (
            <Badge data-testid="search-term-card" variant="violet">
              {COVER_WORDS[cover]}
            </Badge>
          ) : null}
        </span>
        <span className="block text-muted-foreground text-xs tabular-nums">
          {figures(term.totals.spend, term.totals.clicks, term.totals.conversions, currency)}
        </span>
      </label>
    </li>
  );
}

function RootRow({
  group,
  selected,
  onChange,
  covered,
  currency,
}: {
  group: RootGroup;
  selected: ReadonlySet<string>;
  onChange: (keys: string[], on: boolean) => void;
  covered: ReadonlyMap<string, CardCover>;
  currency: string | null;
}) {
  const keys = group.terms.map(termKey);
  const ticked = keys.filter((key) => selected.has(key)).length;
  const shown = group.terms.slice(0, TERMS_SHOWN);
  return (
    <li className="flex items-start gap-2 py-2" data-root={group.root} data-testid="search-root">
      <Checkbox
        aria-label={`Select every term under ${group.root}`}
        checked={ticked === keys.length ? true : ticked > 0 ? 'indeterminate' : false}
        onCheckedChange={() => onChange(keys, ticked < keys.length)}
      />
      <details className="group min-w-0 flex-1">
        <summary className="hit-area cursor-pointer list-none">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-sm">{group.root}</span>
            <span className="text-muted-foreground text-xs">
              {group.terms.length} {group.terms.length === 1 ? 'term' : 'terms'}
              <span className="group-open:hidden"> · show</span>
            </span>
          </span>
          <span className="block text-muted-foreground text-xs tabular-nums">
            {figures(group.spend, group.clicks, group.conversions, currency)}
          </span>
        </summary>
        <ul className="mt-1 divide-y divide-border/60">
          {shown.map((term) => {
            const key = termKey(term);
            return (
              <TermRow
                checked={selected.has(key)}
                cover={covered.get(term.term.trim().toLowerCase())}
                currency={currency}
                key={key}
                onToggle={() => onChange([key], !selected.has(key))}
                term={term}
              />
            );
          })}
        </ul>
        {group.terms.length > shown.length ? (
          <p className="text-muted-foreground text-xs">
            The {shown.length} that spent most; {group.terms.length - shown.length} more under this
            root.
          </p>
        ) : null}
      </details>
    </li>
  );
}

function SearchTermBody({
  terms,
  window,
  cards,
  currency,
}: {
  terms: SearchTerm[];
  window: { since: string; until: string };
  cards: readonly PlatformCard[];
  currency: string | null;
}) {
  const groups = useMemo(() => groupByRoot(terms), [terms]);
  const covered = useMemo(() => termsInCards(cards), [cards]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  if (terms.length === 0) {
    return <ChartEmpty message="No search term spent in Google's last 30 complete days." />;
  }
  const byKey = new Map(terms.map((term) => [termKey(term), term]));
  const picked = [...selected].flatMap((key) => byKey.get(key) ?? []);
  const pickedSpend = picked.reduce((sum, term) => sum + term.totals.spend, 0);
  const inCards = terms.filter((term) => covered.has(term.term.trim().toLowerCase())).length;
  const shown = groups.slice(0, ROOTS_SHOWN);

  function change(keys: string[], on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <ScopeLine>
        {windowRangeLabel(window.since, window.until)} · Google's last 30 complete days · Search and
        Performance Max terms · {terms.length.toLocaleString('en-US')} terms under {groups.length}{' '}
        {groups.length === 1 ? 'root' : 'roots'}
      </ScopeLine>
      <p className="text-muted-foreground text-xs" data-testid="search-terms-cards-note">
        Negatives and new keywords come as the Optimizer's Negatives and Search term cards in
        Actions
        {inCards > 0 ? ` (${inCards} ${inCards === 1 ? 'term is' : 'terms are'} in one now)` : ''}.
        Nothing changes from here.
      </p>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        data-testid="search-terms-selection"
      >
        {picked.length > 0 ? (
          <>
            <span className="tabular-nums">
              {picked.length} {picked.length === 1 ? 'term' : 'terms'} selected ·{' '}
              {formatCurrency(pickedSpend, currency)}
            </span>
            <a
              className="text-primary-ink hover:underline"
              data-testid="search-terms-ask-jaina"
              href={jainaPromptHref(
                jainaTermsPrompt(
                  picked.map((term) => term.term),
                  window,
                ),
                'google_ads',
                { newConversation: true },
              )}
            >
              Ask Jaina about these
            </a>
            <button
              className="hit-area text-muted-foreground text-xs hover:text-foreground"
              onClick={() => setSelected(new Set())}
              type="button"
            >
              Clear
            </button>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">
            Tick terms, or a whole root, to ask Jaina about them.
          </span>
        )}
      </div>
      <ul className="divide-y divide-border/60">
        {shown.map((group) => (
          <RootRow
            covered={covered}
            currency={currency}
            group={group}
            key={group.root}
            onChange={change}
            selected={selected}
          />
        ))}
      </ul>
      {groups.length > shown.length ? (
        <p className="text-muted-foreground text-xs">
          The {shown.length} roots that spent most; {groups.length - shown.length} more were read.
        </p>
      ) : null}
    </div>
  );
}

export function SearchTermExplorerView({
  read,
  cards,
  currency,
}: {
  read: ViewRead<GoogleSignalsRead>;
  cards: readonly PlatformCard[];
  currency: string | null;
}) {
  return (
    <ReadGate read={read}>
      {(data) => {
        const terms = searchTermsOf(data);
        if ('reason' in terms) {
          return (
            <p className="text-muted-foreground text-sm" data-testid="search-terms-unread">
              — {terms.reason}
            </p>
          );
        }
        return (
          <SearchTermBody
            cards={cards}
            currency={data.signals?.currency ?? currency}
            terms={terms.terms}
            window={terms.window}
          />
        );
      }}
    </ReadGate>
  );
}

const SEARCH_TERM_BLOCKS = ['search_terms'] as const;

export function SearchTermExplorer({
  currency,
  ...target
}: GoogleReadTarget & { currency: string | null }) {
  const query = useGoogleSignals({ ...target, blocks: SEARCH_TERM_BLOCKS });
  const cards = usePendingGoogleCards(target.brandId);
  return <SearchTermExplorerView cards={cards} currency={currency} read={viewRead(query)} />;
}
