'use client';

import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { googleCopy } from '../googlePresentation';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useLocale, useTranslations } from 'next-intl';

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

function figures(
  spend: number,
  clicks: number,
  conversions: number,
  currency: string | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
) {
  return uiTranslate
    ? uiTranslate('helper_0b3f2bbc8887', {
        v0: formatCurrency(spend, currency, uiLocale),
        v1: clicks.toLocaleString(uiLocale),
        v2: resultsText(conversions, uiLocale),
      })
    : `${formatCurrency(spend, currency, uiLocale)} · ${clicks.toLocaleString(uiLocale)} clicks · ${resultsText(conversions, uiLocale)} conv.`;
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');

  const id = `search-term-${termKey(term)}`;
  const status = term.status ? STATUS_WORDS[term.status] : undefined;
  return (
    <li className="flex items-start gap-2 py-1.5" data-testid="search-term">
      <Checkbox
        aria-label={uiText('template_a5284a9c5ccd', { v0: term.term })}
        checked={checked}
        id={id}
        onCheckedChange={onToggle}
      />
      <label className="min-w-0 flex-1 cursor-pointer" htmlFor={id}>
        <span className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="break-words">{term.term}</span>
          {isPmaxTerm(term) ? <Badge variant="muted">PMax</Badge> : null}
          {status ? <Badge variant="secondary">{googleCopy(status, uiText)}</Badge> : null}
          {cover ? (
            <Badge data-testid="search-term-card" variant="violet">
              {googleCopy(COVER_WORDS[cover], uiText)}
            </Badge>
          ) : null}
        </span>
        <span className="block text-muted-foreground text-xs tabular-nums">
          {figures(
            term.totals.spend,
            term.totals.clicks,
            term.totals.conversions,
            currency,
            uiText,
            uiLocale,
          )}
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const keys = group.terms.map(termKey);
  const ticked = keys.filter((key) => selected.has(key)).length;
  const shown = group.terms.slice(0, TERMS_SHOWN);
  return (
    <li className="flex items-start gap-2 py-2" data-root={group.root} data-testid="search-root">
      <Checkbox
        aria-label={uiText('template_2aaa8cafd397', { v0: group.root })}
        checked={ticked === keys.length ? true : ticked > 0 ? 'indeterminate' : false}
        onCheckedChange={() => onChange(keys, ticked < keys.length)}
      />
      <details className="group min-w-0 flex-1">
        <summary className="hit-area cursor-pointer list-none">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-sm">{group.root}</span>
            <span className="text-muted-foreground text-xs">
              {uiText('term_count', { count: group.terms.length })}
              <span className="group-open:hidden">{uiText('show_80c1e60')}</span>
            </span>
          </span>
          <span className="block text-muted-foreground text-xs tabular-nums">
            {figures(group.spend, group.clicks, group.conversions, currency, uiText, uiLocale)}
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
            {uiText.rich('sentence_1e18e0074a8f', {
              v0: shown.length,
              v1: group.terms.length - shown.length,
            })}
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const groups = useMemo(() => groupByRoot(terms), [terms]);
  const covered = useMemo(() => termsInCards(cards), [cards]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  if (terms.length === 0) {
    return <ChartEmpty message={uiText('no_search_term_spent_in_google_s_last_30_comp_ebc3749')} />;
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
        {uiText.rich('sentence_538c7ab1692b', {
          range: windowRangeLabel(window.since, window.until, uiLocale),
          terms: terms.length.toLocaleString(uiLocale),
          roots: groups.length,
        })}
      </ScopeLine>
      <p className="text-muted-foreground text-xs" data-testid="search-terms-cards-note">
        {uiText.rich('sentence_0747a12ff16a', { count: inCards })}
      </p>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        data-testid="search-terms-selection"
      >
        {picked.length > 0 ? (
          <>
            <span className="tabular-nums">
              {uiText.rich('sentence_0a46eab3e584', {
                count: picked.length,
                spend: formatCurrency(pickedSpend, currency, uiLocale),
              })}
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
              {uiText('ask_jaina_about_these_736f511')}
            </a>
            <button
              className="hit-area text-muted-foreground text-xs hover:text-foreground"
              onClick={() => setSelected(new Set())}
              type="button"
            >
              {uiText('clear_83b12c2')}
            </button>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">
            {uiText('tick_terms_or_a_whole_root_to_ask_jaina_about_2ea7962')}
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
          {uiText.rich('sentence_4d66e69673ef', {
            v0: shown.length,
            v1: groups.length - shown.length,
          })}
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
