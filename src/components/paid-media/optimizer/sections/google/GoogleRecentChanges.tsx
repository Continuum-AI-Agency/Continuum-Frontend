'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { GoogleText } from './googlePresentation';

// Idea 10, the Google tab's recent changes: what Continuum wrote to Google (optimizer_list_actions,
// each row with its undo, as Activity shows it) and what Google's own change history saw in the
// same week, by whichever channel made it. Undo is the row's own control; nothing else writes.

import { ArrowRightIcon } from 'lucide-react';
import {
  type OptimizerActionFeedRow,
  useOptimizerActions,
  useOptimizerAdAccounts,
} from '../../useOptimizerData';
import { actionPlatform } from '../actionRows';
import { ActionRow } from '../OptimizerActionFeed';
import { accountsOn } from '../platforms/platformTabsModel';
import {
  changeHistoryWindow,
  changeLine,
  dayLabel,
  type HistoryRead,
} from './campaignExplorerModel';
import { GoogleSection } from './GoogleSection';
import { useGoogleChangeHistory } from './googleReads';

/** The window both lists cover: the action feed's default, and a week of Google's history. */
export const RECENT_DAYS = 7;
const MAX_WRITES = 5;
const MAX_CHANGES = 10;
const DAY_MS = 86_400_000;

export type WritesRead =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: OptimizerActionFeedRow[] };

export function recentGoogleChanges(history: HistoryRead, now: Date) {
  if (history.status !== 'ready') return [];
  const since = now.getTime() - RECENT_DAYS * DAY_MS;
  return history.history.changes.filter((change) => Date.parse(change.at) >= since);
}

export function recentSummary(
  writes: WritesRead,
  history: HistoryRead,
  now: Date,
  translate?: GoogleText,
): string {
  if (translate)
    return translate('googleRecentSummary', {
      writesState: writes.status,
      historyState: history.status,
      writes: writes.status === 'ready' ? writes.rows.length : 0,
      changes: recentGoogleChanges(history, now).length,
      days: RECENT_DAYS,
    });
  const plural = (count: number) => `${count} ${count === 1 ? 'change' : 'changes'}`;
  const wrote =
    writes.status === 'ready'
      ? writes.rows.length === 0
        ? `Continuum wrote nothing to Google in ${RECENT_DAYS} days`
        : `Continuum wrote ${plural(writes.rows.length)} to Google in ${RECENT_DAYS} days`
      : writes.status === 'error'
        ? "Continuum's writes could not be read"
        : "Reading Continuum's writes…";
  const seen =
    history.status === 'ready'
      ? `Google's change history shows ${plural(recentGoogleChanges(history, now).length)} in the same ${RECENT_DAYS} days, by every channel`
      : history.status === 'error'
        ? "Google's change history could not be read"
        : "reading Google's change history…";
  return `${wrote}; ${seen}.`;
}

export function GoogleRecentChangesView({
  brandId,
  currency,
  writes,
  history,
  now,
  onOpenActivity,
}: {
  brandId: string;
  currency: string | null;
  writes: WritesRead;
  history: HistoryRead;
  now: Date;
  onOpenActivity: () => void;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const changes = recentGoogleChanges(history, now);
  return (
    <GoogleSection
      showLabel={uiText('googleShowChanges')}
      summary={recentSummary(writes, history, now, uiText)}
      testId="google-recent-changes"
      title={uiText('recent_changes_on_google_638448b')}
    >
      <section className="space-y-1" data-testid="google-recent-writes">
        <h4 className="font-semibold text-foreground text-xs">
          {uiText('written_by_continuum_8198863')}
        </h4>
        {writes.status === 'ready' && writes.rows.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {writes.rows.slice(0, MAX_WRITES).map((row) => (
              <ActionRow brandId={brandId} currency={currency} key={row.id} row={row} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">
            {writes.status === 'error'
              ? uiText('continuum_s_writes_could_not_be_read_ff31b75')
              : writes.status === 'loading'
                ? uiText('reading_874bfa5')
                : uiText('template_8159fc3b84e7', { v0: RECENT_DAYS })}
          </p>
        )}
        <button
          className="hit-area inline-flex items-center gap-1 font-semibold text-primary-ink text-xs hover:underline"
          data-testid="google-recent-activity"
          onClick={onOpenActivity}
          type="button"
        >
          {uiText('every_change_with_undo_in_activity_45a00aa')}
          <ArrowRightIcon aria-hidden="true" className="size-3.5" />
        </button>
      </section>
      <section className="space-y-1" data-testid="google-recent-history">
        <h4 className="font-semibold text-foreground text-xs">
          {uiText('seen_in_google_s_change_history_326162e')}
        </h4>
        {history.status !== 'ready' ? (
          <p className="text-muted-foreground text-xs">
            {history.status === 'error'
              ? uiText('it_could_not_be_read_39569fb')
              : uiText('reading_874bfa5')}
          </p>
        ) : changes.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {uiText.rich('sentence_7bf95a7cf413', { v0: RECENT_DAYS })}
          </p>
        ) : (
          <ul className="space-y-1">
            {changes.slice(0, MAX_CHANGES).map((change, index) => {
              const line = changeLine(change, uiText, uiLocale);
              return (
                <li
                  className="text-xs"
                  data-testid="google-recent-history-line"
                  key={`${change.at}-${index}`}
                >
                  <span className="text-muted-foreground">{dayLabel(change.at, uiLocale)} · </span>
                  {line.what}
                  {line.where ? uiText('template_c262bd68cf74', { v0: line.where }) : ''}
                  {line.detail ? `: ${line.detail}` : ''}
                  <span className="text-muted-foreground"> · {line.who}</span>
                </li>
              );
            })}
            {changes.length > MAX_CHANGES ? (
              <li className="text-muted-foreground text-xs">
                {uiText.rich('sentence_90c98037bc8b', {
                  count: changes.length - MAX_CHANGES,
                })}
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </GoogleSection>
  );
}

export function GoogleRecentChanges({
  brandId,
  onOpenActivity,
}: {
  brandId: string;
  onOpenActivity: () => void;
}) {
  const account = accountsOn(useOptimizerAdAccounts(brandId).data, 'google_ads')[0] ?? null;
  const actions = useOptimizerActions(brandId, RECENT_DAYS);
  const historyQuery = useGoogleChangeHistory({
    brandId,
    customerId: account?.account_id ?? '',
    window: changeHistoryWindow(),
  });
  if (!account) return null;
  const writes: WritesRead = actions.isError
    ? { status: 'error' }
    : actions.isPending
      ? { status: 'loading' }
      : {
          status: 'ready',
          rows: actions.data.filter((row) => actionPlatform(row) === 'google_ads'),
        };
  const history: HistoryRead = historyQuery.isError
    ? { status: 'error' }
    : historyQuery.data
      ? { status: 'ready', history: historyQuery.data }
      : { status: 'loading' };
  return (
    <GoogleRecentChangesView
      brandId={brandId}
      currency={account.currency}
      history={history}
      now={new Date()}
      onOpenActivity={onOpenActivity}
      writes={writes}
    />
  );
}
