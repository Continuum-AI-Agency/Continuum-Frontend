'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Rocket, Save, Send } from 'lucide-react';
import React from 'react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { PAID_SCAFFOLD_TREE_QUERY_ROOT } from '@/components/paid-media/jaina/scaffold/usePaidScaffoldTree';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { buildHydratedCanvasGraph, type CanvasHydration } from '@/lib/campaign-canvas/hydrate';
import {
  buildScaffoldSaveRequest,
  CanvasSaveError,
  saveScaffoldVersion,
} from '@/lib/campaign-canvas/saveVersion';
import {
  fetchBrandScaffolds,
  fetchCanvasScaffoldRead,
  type ScaffoldSummary,
} from '@/lib/paid-media/jaina-activity-client';
import type { CanvasDeployRequest } from '../hooks/useDeployRequest';
import { graphFingerprint, useCampaignStore } from '../stores/useCampaignStore';

/**
 * The bar that turns the canvas from a sketchpad into an editor of the record.
 *
 * It picks one of the brand's scaffolds and loads it as the graph. From there:
 *   - SAVE writes the edited graph as a NEW scaffold version through the Backend's save route
 *     (the same compiler Jaina proposes through), then reloads exactly that version. Nothing is
 *     overwritten: every save is a version with its own content hash.
 *   - DEPLOY PAUSED opens the deploy approval for the version on screen — an operator action,
 *     no model turn — and the card lands in the Jaina panel, where a person approves or denies
 *     it. It is disabled while there are unsaved edits: what gets approved is always a version
 *     that exists, never the local graph.
 *   - PROPOSE VIA JAINA hands a draft to Jaina, for graphs that are not a record yet.
 */

/**
 * What stops Save and Deploy paused right now, each said in the words a person acts on. Pure,
 * so the rules are graded apart from the bar.
 */
export function recordBarBlockers(params: {
  hydration: CanvasHydration | null;
  isDirty: boolean;
  isSaving: boolean;
  deployInFlight: boolean;
}): { save: string | null; deploy: string | null } {
  const { hydration, isDirty, isSaving, deployInFlight } = params;
  if (!hydration) {
    return {
      save: 'Load a scaffold to save edits to it. A new graph goes through Propose via Jaina.',
      deploy: 'Load a scaffold to deploy it.',
    };
  }
  // A version proposed before typed plans cannot deploy — the Backend compiles from the plan —
  // but saving it, even unchanged, writes one. So Save stays enabled for exactly that case.
  const deployable = Boolean(hydration.plan) && Boolean(hydration.contentHash);
  return {
    save: isSaving ? 'Saving…' : !isDirty && deployable ? 'No unsaved edits.' : null,
    deploy: isSaving
      ? 'Wait for the save to finish.'
      : deployInFlight
        ? 'Opening the approval in the Jaina panel…'
        : isDirty
          ? 'Save your edits first — deploy approves a saved version, never unsaved changes.'
          : !deployable
            ? 'This version predates one-click deploy. Save it as a new version to deploy it.'
            : // Compile-time blockers are hashed into the version; the server refuses a deploy
              // on them by name, so the button says so before anyone clicks.
              (hydration.plan?.blockers[0]?.message ?? null),
  };
}

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
  onDeploy,
  deployInFlight = false,
  deployRefusal = null,
}: {
  brandId: string;
  /**
   * Set by a chat card's "Open on canvas" (via `?scaffold=`). Part of the list effect's deps
   * because the scaffold it names was usually proposed AFTER this list loaded.
   */
  requestedScaffoldId?: string | null;
  /** The ad account the chat should run against: the loaded scaffold owns it. */
  onAdAccountChange: (adAccountId: string | null) => void;
  /**
   * Omitted beside the Scale chat: there the canvas saves versions and the chat follows the
   * saved one, so re-proposing the graph through a turn has nothing left to do.
   */
  onPropose?: () => void;
  /** Opens the deploy gate for the loaded version in the canvas's Jaina panel. */
  onDeploy: (request: CanvasDeployRequest) => void;
  /** A Deploy paused is on its way to the panel; a second click must not open a second gate. */
  deployInFlight?: boolean;
  /** Why the last Deploy paused opened no gate, in the Backend's words. */
  deployRefusal?: string | null;
}) {
  const { show: toast } = useToast();
  const queryClient = useQueryClient();
  const hydration = useCampaignStore((store) => store.hydration);
  const reloadNonce = useCampaignStore((store) => store.reloadNonce);
  const isDirty = useCampaignStore((store) => store.isDirty);
  const nodeCount = useCampaignStore((store) => store.nodes.length);
  const loadHydratedGraph = useCampaignStore((store) => store.loadHydratedGraph);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveIssues, setSaveIssues] = React.useState<string[]>([]);

  const [scaffolds, setScaffolds] = React.useState<ScaffoldSummary[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [isLoadingGraph, setIsLoadingGraph] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadScaffold = React.useCallback(
    (scaffold: ScaffoldSummary) => {
      setSelectedId(scaffold.id);
      setIsLoadingGraph(true);
      setError(null);
      setSaveIssues([]);
      return fetchCanvasScaffoldRead({ brandId, scaffold })
        .then((read) => {
          loadHydratedGraph(buildHydratedCanvasGraph(read));
          onAdAccountChange(read.scaffold.adAccountId);
          return true;
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Could not load that proposal.');
          return false;
        })
        .finally(() => setIsLoadingGraph(false));
    },
    [brandId, loadHydratedGraph, onAdAccountChange],
  );

  /**
   * Save = serialize the graph as it stands, write it as a new version, reload exactly that
   * version. Editing is LOCKED for the whole flight: the reload replaces the graph, so an edit
   * made in between would vanish under a "Saved" toast. The fingerprint check proves the lock
   * held; if it ever did not, the canvas keeps the newer edits and says the save lacks them.
   */
  const handleSave = React.useCallback(async () => {
    const store = useCampaignStore.getState();
    const { nodes, edges, hydration: current } = store;
    const scaffold = scaffolds?.find((entry) => entry.id === current?.scaffoldId);
    if (!current || !scaffold || store.editLocked) return;
    const snapshot = graphFingerprint(nodes, edges);
    store.setEditLocked(true);
    setIsSaving(true);
    setSaveIssues([]);
    setError(null);
    try {
      const saved = await saveScaffoldVersion({
        scaffoldId: current.scaffoldId,
        body: buildScaffoldSaveRequest({ nodes, edges, hydration: current }),
      });
      const now = useCampaignStore.getState();
      if (graphFingerprint(now.nodes, now.edges) !== snapshot) {
        // The next save must build on the version just written, not on the one it replaced.
        useCampaignStore.setState({
          hydration: {
            ...current,
            versionId: saved.versionId,
            version: saved.version,
            contentHash: saved.contentHash,
            plan: saved.plan,
            lifecycle: 'proposed',
          },
        });
        toast({
          title: `Saved as v${saved.version} — without your latest edits`,
          description: 'They changed while the save ran and are still on the canvas. Save again.',
          variant: 'warning',
        });
        return;
      }
      // Reload EXACTLY the version the save wrote — the graph on screen must be the record.
      const next = { ...scaffold, currentVersionId: saved.versionId };
      setScaffolds((rows) => rows?.map((row) => (row.id === next.id ? next : row)) ?? rows);
      const reloaded = await loadScaffold(next);
      if (!reloaded) {
        setError(
          `Saved as v${saved.version}, but it could not be reloaded. Pick it from the list to continue.`,
        );
        return;
      }
      // The chat's card for this scaffold redraws from the saved rows. Not awaited: a slow
      // refetch must never hold the save's own spinner.
      void queryClient.invalidateQueries({ queryKey: [PAID_SCAFFOLD_TREE_QUERY_ROOT] });
      toast({
        title: `Saved as v${saved.version}`,
        description: 'A new version of this scaffold. Nothing reached Meta.',
        variant: 'success',
      });
    } catch (cause: unknown) {
      if (cause instanceof CanvasSaveError) {
        setError(cause.message);
        setSaveIssues(cause.issues);
      } else {
        setError(cause instanceof Error ? cause.message : 'Could not save this canvas.');
      }
    } finally {
      useCampaignStore.getState().setEditLocked(false);
      setIsSaving(false);
    }
  }, [loadScaffold, queryClient, scaffolds, toast]);

  // Jaina changed the scaffold on screen (attached a creative): show it. Once per request, and
  // never over unsaved edits — those are the person's, and a reload would erase them.
  const handledReloadRef = React.useRef(reloadNonce);
  React.useEffect(() => {
    if (handledReloadRef.current === reloadNonce) return;
    handledReloadRef.current = reloadNonce;
    const { hydration: current, isDirty: dirty, editLocked } = useCampaignStore.getState();
    const scaffold = scaffolds?.find((entry) => entry.id === current?.scaffoldId);
    if (!scaffold || dirty || editLocked) return;
    void loadScaffold(scaffold);
  }, [loadScaffold, reloadNonce, scaffolds]);

  const blockers = recordBarBlockers({ hydration, isDirty, isSaving, deployInFlight });
  const saveBlockedBecause = blockers.save;
  const deployBlockedBecause = blockers.deploy;

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
      className="pointer-events-auto flex max-w-[min(94vw,880px)] flex-wrap items-center gap-2 rounded-xl border bg-background/85 px-2.5 py-2 shadow-sm backdrop-blur-md"
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
              title="These edits are local until you save them as a new version."
            >
              <PillIndicator variant="warning" pulse={false} />
              Unsaved edits
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
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={Boolean(saveBlockedBecause)}
                  onClick={() => void handleSave()}
                  data-testid="canvas-save"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {isSaving ? 'Saving' : 'Save'}
                </Button>
              }
            />
            <TooltipContent side="bottom">
              {saveBlockedBecause ?? 'Saves these edits as a new version. Nothing reaches Meta.'}
            </TooltipContent>
          </Tooltip>

          {onPropose ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    // On a loaded record, Deploy is the primary action and Jaina the alternative.
                    variant={hydration ? 'ghost' : 'default'}
                    className="gap-1.5"
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
          ) : null}

          {hydration ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={Boolean(deployBlockedBecause)}
                    onClick={() =>
                      hydration.contentHash &&
                      onDeploy({
                        versionId: hydration.versionId,
                        contentHash: hydration.contentHash,
                        name: hydration.scaffoldName,
                        version: hydration.version,
                      })
                    }
                    data-testid="canvas-deploy-paused"
                  >
                    <Rocket className="h-3.5 w-3.5" />
                    Deploy paused
                  </Button>
                }
              />
              <TooltipContent side="bottom">
                {deployBlockedBecause ??
                  'Opens the approval to create this version on Meta, all paused. Going live is a separate unpause.'}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TooltipProvider>

      {hydration && !isDirty && (hydration.plan?.blockers.length ?? 0) > 0 ? (
        <ul
          className="w-full list-disc space-y-0.5 pl-5 text-muted-foreground text-xs"
          data-testid="canvas-deploy-blockers"
        >
          {hydration.plan?.blockers.map((blocker) => (
            <li key={`${blocker.code}:${blocker.path_key ?? ''}`} data-code={blocker.code}>
              {blocker.message}
            </li>
          ))}
        </ul>
      ) : null}

      {deployRefusal ? (
        <p
          className="w-full text-destructive text-xs"
          data-testid="canvas-deploy-refusal"
          role="alert"
        >
          {deployRefusal}
        </p>
      ) : null}

      {saveIssues.length > 0 ? (
        <ul
          className="w-full list-disc space-y-0.5 pl-5 text-destructive text-xs"
          data-testid="canvas-save-issues"
          role="alert"
        >
          {saveIssues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
