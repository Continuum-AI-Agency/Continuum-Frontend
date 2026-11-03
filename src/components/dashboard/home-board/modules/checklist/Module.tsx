'use client';

// The expanded client checklist: each portfolio's open recommendations, read from its queue
// (optimizer-status, the read the Optimizer's Actions page makes), with two actions and no new
// write: export the list as a CSV written in the browser, and send the brand's existing
// Continuum Report email (SendContinuumReportDialog, used as is).

import { DownloadIcon, SendIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SendContinuumReportDialog } from '@/components/dashboard/SendContinuumReportDialog';
import { parseReport } from '@/components/paid-media/optimizer/reportModel';
import { useOptimizerPerformance } from '@/components/paid-media/optimizer/useOptimizerData';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import { bareAccountId } from '@/lib/paid-media/accountId';
import {
  type ChecklistItem,
  type ChecklistPortfolio,
  checklistCsv,
  checklistFileName,
  checklistItemsOf,
  EMAIL_NOTE,
} from './checklistModel';

type Answer = ChecklistItem[] | 'error';

/** The same items, word for word: a re-render that recomputed them changes nothing. */
function sameAnswer(a: Answer | undefined, b: Answer): boolean {
  return a === b || (a !== undefined && JSON.stringify(a) === JSON.stringify(b));
}

function downloadCsv(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function accountCurrencyOf(
  portfolio: ChecklistPortfolio['portfolio'],
  accounts: readonly HomeAdAccount[],
): string | null {
  if (!portfolio.ad_account_id) return null;
  const wanted = bareAccountId(portfolio.ad_account_id);
  return accounts.find((account) => bareAccountId(account.id) === wanted)?.currency ?? null;
}

function PortfolioItems({
  entry,
  accountCurrency,
  onAnswer,
}: {
  entry: ChecklistPortfolio;
  accountCurrency: string | null;
  onAnswer: (portfolioId: string, answer: Answer) => void;
}) {
  const performance = useOptimizerPerformance(entry.id);
  const answered = performance.isSuccess;
  const failed = performance.isError && !answered;
  const items = useMemo(
    () =>
      answered
        ? checklistItemsOf(
            parseReport(performance.data)?.recommendations ?? [],
            entry.portfolio,
            accountCurrency,
          )
        : null,
    [answered, performance.data, entry.portfolio, accountCurrency],
  );

  useEffect(() => {
    if (items) onAnswer(entry.id, items);
    else if (failed) onAnswer(entry.id, 'error');
  }, [items, failed, entry.id, onAnswer]);

  return (
    <section className="space-y-2">
      <h4 className="font-medium text-sm">{entry.name}</h4>
      {failed ? (
        <p className="text-muted-foreground text-xs" role="alert">
          This portfolio's recommendations could not be read.
        </p>
      ) : items == null ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nothing is open for the client right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li className="min-w-0 space-y-0.5" data-testid="home-checklist-item" key={item.id}>
              <p className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 text-xs">
                <span className="min-w-0 font-medium text-foreground">{item.title}</span>
                {item.impact ? (
                  <span className="shrink-0 text-muted-foreground tabular-nums">{item.impact}</span>
                ) : null}
              </p>
              {item.detail ? (
                <p className="text-muted-foreground text-xs leading-snug">{item.detail}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ChecklistModule({
  brandId,
  brandName,
  portfolios,
  adAccounts,
}: {
  brandId: string;
  brandName: string | null;
  portfolios: ChecklistPortfolio[];
  adAccounts: HomeAdAccount[];
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [emailOpen, setEmailOpen] = useState(false);
  const onAnswer = useCallback((portfolioId: string, answer: Answer) => {
    setAnswers((current) =>
      sameAnswer(current[portfolioId], answer) ? current : { ...current, [portfolioId]: answer },
    );
  }, []);

  const items = useMemo(() => {
    const all: ChecklistItem[] = [];
    for (const entry of portfolios) {
      const answer = answers[entry.id];
      if (answer == null || answer === 'error') return null;
      all.push(...answer);
    }
    return all;
  }, [answers, portfolios]);

  return (
    <div className="space-y-5" data-testid="home-checklist-module">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={items == null || items.length === 0}
          onClick={() => {
            if (items) downloadCsv(checklistCsv(items), checklistFileName(brandName, new Date()));
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <DownloadIcon aria-hidden="true" />
          Export checklist
        </Button>
        <Button onClick={() => setEmailOpen(true)} size="sm" type="button" variant="ghost">
          <SendIcon aria-hidden="true" />
          Send by email
        </Button>
      </div>
      <p className="text-muted-foreground text-xs leading-snug">{EMAIL_NOTE}</p>
      {portfolios.map((entry) => (
        <PortfolioItems
          accountCurrency={accountCurrencyOf(entry.portfolio, adAccounts)}
          entry={entry}
          key={entry.id}
          onAnswer={onAnswer}
        />
      ))}
      <SendContinuumReportDialog brandId={brandId} onOpenChange={setEmailOpen} open={emailOpen} />
    </div>
  );
}
