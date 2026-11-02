'use client';

// The companion pane when one Jaina turn changes several campaigns: the portfolio band first;
// a tap on a row opens that campaign in Read or the Map — the same pieces every campaign view
// uses — with a breadcrumb back to the portfolio. Read-only, like the live change companion:
// each approval stays on its own chat card.

import { ChevronLeft } from 'lucide-react';
import * as React from 'react';
import type { PortfolioRow, PortfolioViewModel } from '@/lib/campaign-canvas/portfolio';
import type { VersionLine } from '@/lib/campaign-canvas/versions';
import { CanvasViewHint, CanvasViewToggle, useCanvasView } from '../lectura/CanvasViewToggle';
import { PlatformChip } from '../lectura/LecturaView';
import { CampaignModelBody, useVersionLine, VersionLineBar } from '../versions/VersionLine';
import { PortfolioBand } from './PortfolioBand';

export function PortfolioCompanion({
  portfolio,
  versionsByRow = {},
  initialRowId = null,
}: {
  portfolio: PortfolioViewModel;
  /** Each row's version line across the thread, by row id, when it has more than one. */
  versionsByRow?: Readonly<Record<string, VersionLine>>;
  initialRowId?: string | null;
}) {
  const [rowId, setRowId] = React.useState<string | null>(initialRowId);
  const row = portfolio.rows.find((entry) => entry.id === rowId) ?? null;
  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="portfolio-companion">
      {row ? (
        <PortfolioCampaign
          key={row.id}
          row={row}
          portfolio={portfolio}
          versions={versionsByRow[row.id] ?? null}
          onBack={() => setRowId(null)}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 text-[13px] text-muted-foreground">
            <span className="min-w-0">
              One proposal across several campaigns · approve each in chat
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <PortfolioBand portfolio={portfolio} onOpenRow={(entry) => setRowId(entry.id)} />
          </div>
        </>
      )}
    </div>
  );
}

function PortfolioCampaign({
  row,
  portfolio,
  versions,
  onBack,
}: {
  row: PortfolioRow;
  portfolio: PortfolioViewModel;
  versions: VersionLine | null;
  onBack: () => void;
}) {
  const { view, setView, isPhone, hint, dismissHint } = useCanvasView('proposed');
  const current =
    row.source.kind === 'live' ? (row.source.partIds.at(-1) ?? null) : row.source.versionId;
  const versionLine = useVersionLine(versions, current);
  const shown = versionLine.active ? versionLine.view : null;
  const model = shown?.model ?? row.model;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-[12rem] flex-1 items-center gap-1 text-[13px]"
          data-testid="portfolio-breadcrumb"
        >
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 font-medium text-primary-ink hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
            data-testid="portfolio-back"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            {portfolio.campaignCount} campaigns
          </button>
          <span aria-hidden className="text-muted-foreground">
            ›
          </span>
          <PlatformChip platform={row.platform} />
          <span className="min-w-0 truncate text-muted-foreground" title={row.name}>
            {row.name}
          </span>
        </nav>
        <CanvasViewToggle view={view} onChange={setView} mapDisabled={isPhone} />
        {hint ? (
          <div className="flex w-full justify-end">
            <CanvasViewHint hint={hint} onDismiss={dismissHint} />
          </div>
        ) : null}
        <VersionLineBar state={versionLine} />
      </div>
      <div className="min-h-0 flex-1">
        <CampaignModelBody
          model={model}
          view={view}
          drawKey={`${row.id}:${shown ? `${shown.version.id}:${shown.comparison ? 'c' : 'p'}` : 'row'}`}
          mapTestIdPrefix="portfolio-node-"
        />
      </div>
    </>
  );
}
