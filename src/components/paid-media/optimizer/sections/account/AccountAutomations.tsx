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
// in force, so until the first read lands the section says so rather than guessing 'recommend'
// and presenting the guess as a setting.

import type { PortfolioListItem } from '@continuum/contracts';
import { Button } from '@/components/ui/button';
import { ApplyModePill } from '../../ApplyModePill';
import { humanize } from '../../format';
import { pendingWorkCount } from '../../reportModel';
import {
  useAccountApprovals,
  useInsightApprovalMutations,
  useOptimizerAccountRead,
} from '../../useOptimizerData';
import { staleCount } from '../portfolioStaleness';
import { FamilyCeilings, FamilyCeilingsHeading } from './FamilyCeilings';

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
  // Autopilot that has missed a cycle runs nothing; the meta line says so beside "stopped".
  const stale = staleCount(autopilot);

  return (
    <div className="space-y-8">
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
        <section className="space-y-2">
          <FamilyCeilingsHeading />
          <p className="text-muted-foreground text-xs" data-testid="family-ceilings-pending">
            The controls appear once the first account read has landed.
          </p>
        </section>
      )}

      <section className="space-y-1" data-testid="portfolio-autonomy">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h3 className="font-semibold text-foreground text-sm">Per portfolio</h3>
          <span
            className="text-muted-foreground text-xs tabular-nums"
            data-testid="portfolio-autonomy-meta"
          >
            {autopilot.length} of {portfolios.length} on autopilot
            {stopped > 0 ? ` · ${stopped} stopped` : ''}
            {stale > 0 ? ` · ${stale} stale` : ''}
          </span>
        </div>
        <ul className="divide-y divide-border/60">
          {portfolios.map((portfolio) => (
            <li
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5"
              data-portfolio={portfolio.id}
              key={portfolio.id}
            >
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate font-medium text-foreground text-sm">{portfolio.name}</p>
                <p className="text-muted-foreground text-xs">{humanize(portfolio.objective)}</p>
              </div>
              <ApplyModePill
                applyMode={portfolio.apply_mode}
                autopilotPaused={portfolio.autopilot_paused}
                scopes={portfolio.autopilot_scopes ?? null}
              />
              <span className="text-muted-foreground text-xs tabular-nums">
                {waitingLine(portfolio)}
              </span>
              <Button
                className="ml-auto h-7 px-2 text-xs"
                onClick={() => onManagePortfolio(portfolio.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Manage
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
