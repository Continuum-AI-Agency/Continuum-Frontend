'use client';

// Automations — what this account is allowed to do on its own, on a tab of its own.
//
// Two halves. The account-level ceilings first: what each family of action may do across
// every portfolio here, which is the boundary every per-insight switch answers to. Then the
// portfolios themselves — which ones run on autopilot, which wait on a person, and a way into
// the one place that changes it. The tab shows autonomy at account level; it does not add a
// second place to write a portfolio's apply mode, because two writers of one setting is how a
// screen and a database come to disagree.
//
// The ceilings need the defaults the read was composed under to say which value is actually
// in force, so until the first read lands the panel says so rather than guessing 'recommend'
// and presenting the guess as a setting.

import type { PortfolioListItem } from '@continuum/contracts';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/ui/button';
import { ApplyModePill } from '../../ApplyModePill';
import { humanize } from '../../format';
import { pendingWorkCount } from '../../reportModel';
import {
  useAccountApprovals,
  useInsightApprovalMutations,
  useOptimizerAccountRead,
} from '../../useOptimizerData';
import { FamilyCeilings } from './FamilyCeilings';

export type AccountAutomationsProps = {
  brandId: string;
  /** The account the ceilings are for. Null while no account is selected. */
  adAccountId: string | null;
  portfolios: PortfolioListItem[];
  /** Opens the portfolio on its Manage section, where its own autonomy is written. */
  onManagePortfolio: (portfolioId: string) => void;
};

function waitingLine(portfolio: PortfolioListItem): string {
  const pending = pendingWorkCount(portfolio);
  if (pending === 0) return 'nothing waiting';
  return `${pending} waiting on a decision`;
}

export function AccountAutomations({
  brandId,
  adAccountId,
  portfolios,
  onManagePortfolio,
}: AccountAutomationsProps) {
  const accountRead = useOptimizerAccountRead(brandId, adAccountId);
  const approvalMaps = useAccountApprovals(brandId, adAccountId);
  const approvals = useInsightApprovalMutations(brandId, adAccountId);
  const defaults = accountRead.data?.read?.ceiling_defaults ?? null;
  const autopilot = portfolios.filter((portfolio) => portfolio.apply_mode === 'autopilot');
  const stopped = autopilot.filter((portfolio) => portfolio.autopilot_paused).length;

  return (
    <div className="space-y-3">
      {defaults && approvalMaps.data ? (
        <FamilyCeilings
          current={approvalMaps.data.families}
          defaults={defaults}
          error={
            approvals.setFamily.error instanceof Error ? approvals.setFamily.error.message : null
          }
          onSetFamily={(family, state) => approvals.setFamily.mutate({ family, state })}
        />
      ) : (
        <p
          className="rounded-lg border border-border/60 border-dashed bg-muted/10 px-4 py-3 text-muted-foreground text-xs"
          data-testid="family-ceilings-pending"
        >
          What this account may do on its own appears once the first account read has landed.
        </p>
      )}

      <section
        className="overflow-hidden rounded-lg border border-border/60 bg-card"
        data-testid="portfolio-autonomy"
      >
        <SectionHeader
          meta={
            <span className="text-3xs text-muted-foreground" data-testid="portfolio-autonomy-meta">
              {autopilot.length} of {portfolios.length} on autopilot
              {stopped > 0 ? ` · ${stopped} stopped` : ''}
            </span>
          }
          title="Per portfolio"
        />
        <ul className="divide-y divide-border/60">
          {portfolios.map((portfolio) => (
            <li
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5"
              data-portfolio={portfolio.id}
              key={portfolio.id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground text-xs">{portfolio.name}</p>
                <p className="text-3xs text-muted-foreground">
                  {humanize(portfolio.objective)} · {waitingLine(portfolio)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ApplyModePill
                  applyMode={portfolio.apply_mode}
                  autopilotPaused={portfolio.autopilot_paused}
                  scopes={portfolio.autopilot_scopes ?? null}
                />
                <Button
                  className="h-7 px-2 text-2xs"
                  onClick={() => onManagePortfolio(portfolio.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Manage
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
