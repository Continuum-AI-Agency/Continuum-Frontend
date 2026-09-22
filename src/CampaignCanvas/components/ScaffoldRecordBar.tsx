'use client';

import { Loader2, Send } from 'lucide-react';
import React from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { buildHydratedCanvasGraph } from '@/lib/campaign-canvas/hydrate';
import {
  fetchBrandScaffolds,
  fetchCanvasScaffoldRead,
  type ScaffoldSummary,
} from '@/lib/paid-media/jaina-activity-client';
import { useCampaignStore } from '../stores/useCampaignStore';

/**
 * The bar that turns the canvas from a sketchpad into a view of the record.
 *
 * It picks one of the brand's scaffolds, loads it as the graph, and hands the only
 * forward action there is — "Propose via Jaina" — back to the page. It deliberately
 * does NOT offer a save: nothing in this app grants the browser a write to
 * `paid_scaffold_*`, so a save control would be a button that can only fail. What an
 * edit produces instead is the "Edited" pill, and the way to make an edit real is to
 * ask Jaina to propose it and approve the gate.
 */

const lifecycleTone = (lifecycle: string): 'success' | 'info' | 'warning' =>
  lifecycle === 'activated' || lifecycle === 'populated'
    ? 'success'
    : lifecycle === 'failed'
      ? 'warning'
      : 'info';

export function ScaffoldRecordBar({
  brandId,
  requestedScaffoldId = null,
  onAdAccountChange,
  onPropose,
}: {
  brandId: string;
  /**
   * Set by a chat card's "Open on canvas" (via `?scaffold=`). Part of the list effect's deps
   * because the scaffold it names was usually proposed AFTER this list loaded.
   */
  requestedScaffoldId?: string | null;
  /** The ad account the chat should run against: the loaded scaffold owns it. */
  onAdAccountChange: (adAccountId: string | null) => void;
  onPropose: () => void;
}) {
  const hydration = useCampaignStore((store) => store.hydration);
  const isDirty = useCampaignStore((store) => store.isDirty);
  const nodeCount = useCampaignStore((store) => store.nodes.length);
  const loadHydratedGraph = useCampaignStore((store) => store.loadHydratedGraph);

  const [scaffolds, setScaffolds] = React.useState<ScaffoldSummary[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [isLoadingGraph, setIsLoadingGraph] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadScaffold = React.useCallback(
    (scaffold: ScaffoldSummary) => {
      setSelectedId(scaffold.id);
      setIsLoadingGraph(true);
      setError(null);
      fetchCanvasScaffoldRead({ brandId, scaffold })
        .then((read) => {
          loadHydratedGraph(buildHydratedCanvasGraph(read));
          onAdAccountChange(read.scaffold.adAccountId);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Could not load that proposal.');
        })
        .finally(() => setIsLoadingGraph(false));
    },
    [brandId, loadHydratedGraph, onAdAccountChange],
  );

  React.useEffect(() => {
    let cancelled = false;
    setScaffolds(null);
    setSelectedId('');
    fetchBrandScaffolds({ brandId })
      .then((rows) => {
        if (cancelled) return;
        setScaffolds(rows);
        setError(null);
        const requested = rows.find((row) => row.id === requestedScaffoldId);
        if (requested) {
          loadScaffold(requested);
          return;
        }
        // Before anything is loaded the newest scaffold still names the account this
        // brand runs paid media on — which is what the chat needs to accept a turn.
        onAdAccountChange(rows[0]?.adAccountId ?? null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setScaffolds([]);
        setError(cause instanceof Error ? cause.message : 'Could not load this brand’s proposals.');
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, onAdAccountChange, requestedScaffoldId, loadScaffold]);

  const handleSelect = React.useCallback(
    (scaffoldId: string) => {
      const scaffold = scaffolds?.find((entry) => entry.id === scaffoldId);
      if (scaffold) loadScaffold(scaffold);
    },
    [loadScaffold, scaffolds],
  );

  const proposeBlockedBecause =
    nodeCount === 0 ? 'Load a proposal or add a node — there is nothing to propose yet.' : null;

  return (
    <div
      className="pointer-events-auto flex max-w-[min(92vw,720px)] flex-wrap items-center gap-2 rounded-xl border bg-background/85 px-2.5 py-2 shadow-sm backdrop-blur-md"
      data-testid="canvas-record-bar"
    >
      {scaffolds === null ? (
        <Skeleton className="h-9 w-[260px] rounded-md" />
      ) : scaffolds.length === 0 ? (
        <span className="px-1 text-muted-foreground text-xs" data-testid="canvas-record-empty">
          No proposals yet — ask Jaina to propose a campaign and it will appear here.
        </span>
      ) : (
        <Select value={selectedId} onValueChange={handleSelect}>
          <SelectTrigger className="w-[260px]" data-testid="canvas-scaffold-picker">
            {/* Without `items` the closed trigger renders the raw uuid, not the name. */}
            <SelectValue
              placeholder="Load a proposal…"
              items={Object.fromEntries(scaffolds.map((scaffold) => [scaffold.id, scaffold.name]))}
            />
          </SelectTrigger>
          <SelectContent>
            {scaffolds.map((scaffold) => (
              <SelectItem key={scaffold.id} value={scaffold.id}>
                {scaffold.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isLoadingGraph ? (
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading
        </span>
      ) : null}

      {hydration ? (
        <div className="flex items-center gap-1.5" data-testid="canvas-record-version">
          <Pill className="whitespace-nowrap">
            <PillIndicator variant={lifecycleTone(hydration.lifecycle)} pulse={false} />v
            {hydration.version} · {hydration.lifecycle}
          </Pill>
          {isDirty ? (
            <Pill
              className="whitespace-nowrap"
              data-testid="canvas-record-dirty"
              title="Edits on this canvas are local. Nothing here has been written — propose them via Jaina to make them real."
            >
              <PillIndicator variant="warning" pulse={false} />
              Edited, not saved
            </Pill>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <span className="text-destructive text-xs" data-testid="canvas-record-error" role="alert">
          {error}
        </span>
      ) : null}

      <TooltipProvider delay={180}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="sm"
                className="ml-auto gap-1.5"
                disabled={Boolean(proposeBlockedBecause)}
                onClick={onPropose}
                data-testid="canvas-propose-via-jaina"
              >
                <Send className="h-3.5 w-3.5" />
                Propose via Jaina
              </Button>
            }
          />
          <TooltipContent side="bottom">
            {proposeBlockedBecause ??
              'Sends this graph to Jaina. Building it on Meta still needs your approval.'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
