'use client';

// Reusable portfolio setup body: discover the account → server-side suggestions
// → create → enroll. Shared by the empty-state OptimizerOnboarding and the "Add
// portfolio" entry point in the populated views.
//
// Data paths (identical to what the MCP tools / optimizer ingest use — nothing
// lies to the user):
//  - account discovery: plugin_mcp.list_brand_ad_accounts (via useOptimizerAdAccounts)
//  - suggestions: optimizer-suggest edge fn, which groups the account's ad sets
//    (paid-media-metrics adset_snapshots scope) by objective.
//  - create: optimizer_create_portfolio RPC (raises 42501 if the ad account is
//    not this brand's — surfaced as a clean inline message).
//  - enroll: optimizer-enroll edge fn with the suggestion's adset_ids.

import type {
  AdSetSnapshot,
  ApplyMode,
  OptimizationModeDto,
  OptimizationObjective,
  PortfolioLevel,
  PortfolioSuggestion,
} from '@continuum/contracts';
import {
  getOptimizationMetricDefinition,
  suggestionToEnrollRequest,
  suggestionToPortfolioConfig,
} from '@continuum/contracts';
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  PlusIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PAID_SETUP_CONNECT_HREF } from '../../paid-setup-diagnostics';
import { BudgetHint, SetupAdvisor, TargetHint, useSetupAdvice } from '../advisor/SetupAdvisor';
import { currencySymbol, deriveEfficiency, formatCpa, formatCurrency, humanize } from '../format';
import { CampaignAdsetPicker } from '../picker/CampaignAdsetPicker';
import { buildCboCampaignSections } from '../picker/campaignGroups';
import { buildProjectedConversions } from '../preview/projectedConversion';
import { applyModeExplainer, applyModePill } from '../reportModel';
import {
  useOptimizerAccountSnapshots,
  useOptimizerAdAccounts,
  useOptimizerMutations,
  useOptimizerSuggestions,
} from '../useOptimizerData';
import { CboCampaigns } from './CboCampaigns';
import { ProjectedConversions } from './ProjectedConversions';
import { SignalReadinessCard } from './SignalReadinessCard';
import { SuggestionExplorer } from './SuggestionExplorer';
import {
  CONVERSION_OBJECTIVES,
  DEFAULT_MODE_BY_OBJECTIVE,
  MODES,
  OBJECTIVES,
} from './suggestionModel';

// Explains an empty suggestion list precisely (Phase C diagnostic reason), so the
// onboarding never shows a bare "no suggestions yet". In campaign mode the
// 'all_cbo' reason means "every campaign is ABO" (budget split at the ad-set level).
//
// `hasProjections` keeps the all-CBO case from dead-ending: when every ad set is held at the
// campaign level there ARE no ad-set budgets to pick, so pointing at the picker is a wall.
// With a projection available the copy hands off to it instead.
function suggestEmptyMessage(
  reason: string | null,
  level: PortfolioLevel,
  { hasProjections = false }: { hasProjections?: boolean } = {},
): string {
  switch (reason) {
    case 'all_cbo':
      if (level === 'campaign') {
        return "Every campaign here splits its budget at the ad-set level (ABO), so there's nothing to group at the campaign level. Optimize these as an ad-set portfolio instead.";
      }
      return hasProjections
        ? "Every active ad set here uses a campaign-level budget (CBO or lifetime), so there's nothing to group into a suggestion yet. Here's what each campaign would look like converted to ad-set budgets."
        : "Every active ad set here uses a campaign-level budget (CBO or lifetime), so there's nothing to group into a suggestion. Pick ad sets with their own daily budgets below.";
    case 'no_active':
      return 'No active ad sets found for this account yet. Once ad sets are live, suggestions will appear here.';
    case 'tracking_gaps':
      return 'Ad sets are spending but none has tracked conversions yet — set up conversion tracking, or create a portfolio manually below.';
    case 'not_permitted':
      return "This ad account isn't assigned to this brand, so the optimizer can't read its ad sets. Assign it in Settings → Integrations, then try again.";
    default:
      return "No grouped suggestions yet — the optimizer groups ad sets once this account's metrics are available. Create a portfolio manually below in the meantime.";
  }
}

type PortfolioSetupProps = {
  brandId: string;
  adAccountId: string;
  currency?: string | null;
  // Called with the new portfolio id once it is created (and its ad sets enrolled).
  // The caller navigates to that portfolio's detail workspace so the user watches
  // the first cycle score instead of landing on an empty Overview.
  onCreated?: (portfolioId: string) => void;
  // The onboarding empty-state shows the account header; the in-tab "New
  // portfolio" expander suppresses it (the account is already in context there).
  showAccountHeader?: boolean;
};

// The objective/mode vocabulary shared with the SuggestionExplorer lives in
// ./suggestionModel — OBJECTIVES, MODES, DEFAULT_MODE_BY_OBJECTIVE, CONVERSION_OBJECTIVES.

// The single objective to read account-wide signal readiness against, before any
// portfolio exists: the KPI the plurality of ad sets already declare. Onboarding
// has no portfolio objective yet, so the account's own dominant currency is the
// honest lens — an account where most ad sets buy conversations should have its
// readiness scored on conversations, not a guessed purchase default.
function dominantAccountObjective(snapshots: AdSetSnapshot[]): OptimizationObjective {
  const counts = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (!snapshot.kpiField) continue;
    counts.set(snapshot.kpiField, (counts.get(snapshot.kpiField) ?? 0) + 1);
  }
  let best: OptimizationObjective = 'purchase';
  let bestCount = 0;
  for (const objective of OBJECTIVES) {
    const kpiField = getOptimizationMetricDefinition(objective).kpiField;
    const count = counts.get(kpiField) ?? 0;
    if (count > bestCount) {
      best = objective;
      bestCount = count;
    }
  }
  return best;
}

export function PortfolioSetup({
  brandId,
  adAccountId,
  currency,
  onCreated,
  showAccountHeader = true,
}: PortfolioSetupProps) {
  // 'start' offers the fast path (a suggestion, one click). 'build' hands the whole container to
  // the two-pane builder. They are alternatives, so only one is on screen at a time.
  const [view, setView] = React.useState<'start' | 'build'>('start');

  const { data: accounts } = useOptimizerAdAccounts(brandId);
  const account = accounts.find((row) => row.account_id === adAccountId) ?? null;
  const resolvedCurrency = currency ?? account?.currency ?? null;

  // The Optimizer stays ad-set-level only — it never reallocates a campaign (CBO)
  // budget. CBO campaigns are surfaced separately (CboCampaigns) with a one-click
  // convert-to-ABO. `level` is pinned to 'adset'; the dormant campaign params in the
  // reads/picker/create stay harmless at their 'adset' default.
  const level: PortfolioLevel = 'adset';

  const suggestRead = useOptimizerSuggestions(brandId, adAccountId, level);
  const suggestions = suggestRead.data?.suggestions ?? [];
  const diagnostics = suggestRead.data?.diagnostics ?? null;
  const suggestReason = suggestRead.data?.reason ?? null;

  // Account snapshots power the client-side "what-if" preview (engine runs in the
  // browser). Absent when the metrics edge is unreachable — the preview simply
  // hides in that case.
  const { data: snapshots } = useOptimizerAccountSnapshots(brandId, adAccountId, level);

  // CBO campaigns (their ad sets held `unsupported_budget`) — surfaced as
  // not-yet-optimizable with a one-click convert-to-ABO preview.
  const cboSections = React.useMemo(() => buildCboCampaignSections(snapshots), [snapshots]);
  const cboSectionRef = React.useRef<HTMLDivElement>(null);

  // What each CBO campaign WOULD look like converted to ad-set budgets. Pure and cheap —
  // the engine preview behind each one is lazy (per card, on expand), so this costs nothing
  // until an operator asks. It is what keeps an all-CBO account from dead-ending here.
  const projectedConversions = React.useMemo(
    () => buildProjectedConversions(cboSections, snapshots, { currency: resolvedCurrency }),
    [cboSections, snapshots, resolvedCurrency],
  );

  // Account-wide signal readiness, read against the KPI most ad sets declare. Tells
  // the operator up front whether the account can be scored at all (young, untracked,
  // or wrong-currency ad sets) — the same reasons a first cycle raises nothing.
  const accountObjective = React.useMemo(() => dominantAccountObjective(snapshots), [snapshots]);

  const { create, enroll, run } = useOptimizerMutations(brandId, adAccountId);
  const [createdKeys, setCreatedKeys] = React.useState<Set<string>>(new Set());
  const [enrollFailedKeys, setEnrollFailedKeys] = React.useState<Set<string>>(new Set());
  // The suggestion currently being created AND enrolled. create.isPending alone
  // only covers the first of the two mutations, so the button re-enabled between
  // them and a second click would create a duplicate portfolio.
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  // Exactly one suggestion's explorer is open at a time — a full-width split pane
  // rendered below the compact card row, so an expanded suggestion never stretches a
  // grid cell and leaves its siblings blank.
  const [activeSuggestionName, setActiveSuggestionName] = React.useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  // The open suggestion and just its ad-set snapshots — resolved from the live list so a
  // suggestion that vanishes on refetch closes the explorer instead of dangling.
  const activeSuggestion =
    suggestions.find((suggestion) => suggestion.name === activeSuggestionName) ?? null;
  const activeGroupSnapshots = React.useMemo(() => {
    if (!activeSuggestion) return [];
    const groupIds = new Set(activeSuggestion.adset_ids);
    return snapshots.filter((snapshot) => groupIds.has(snapshot.id));
  }, [activeSuggestion, snapshots]);

  const createFromSuggestion = (
    suggestion: PortfolioSuggestion,
    override?: { objective: OptimizationObjective; mode: OptimizationModeDto },
  ) => {
    // Base config from the SHARED builder (@continuum/contracts) so onboarding and the
    // Jaina/MCP agents produce the identical portfolio config; the FE then pins `level`
    // (optimizer is ad-set-level here) and applies the optional objective/mode override.
    // Suggestion creates start in RECOMMEND: the optimizer scores nightly and proposes moves,
    // and nothing is written until a human approves it in the Action Log. Recommend never
    // auto-writes, so this is safe — and it means a fresh portfolio has actionable work
    // waiting instead of silently observing.
    const suggestedConfig = suggestionToPortfolioConfig(suggestion, { apply_mode: 'recommend' });
    // A target belongs to the objective that produced it. If an operator changes
    // that objective before creating, start without a target rather than silently
    // carrying (for example) a purchase CPA into an awareness CPM portfolio.
    const { cpa_target: suggestedTarget, ...configWithoutTarget } = suggestedConfig;
    const objectiveChanged = override?.objective && override.objective !== suggestion.objective;
    const config = {
      ...configWithoutTarget,
      ...(!objectiveChanged && suggestedTarget != null ? { cpa_target: suggestedTarget } : {}),
      level,
      apply_mode: 'recommend' as const,
      ...(override ? { objective: override.objective, mode: override.mode } : {}),
    };
    setPendingKey(suggestion.name);
    create.mutate(
      {
        brand_id: brandId,
        ad_account_id: adAccountId,
        config,
      },
      {
        onError: () => setPendingKey(null),
        onSuccess: ({ portfolio_id }) => {
          // A suggestion with no entities would create an INERT portfolio: the scheduler
          // claims it every cycle and skips with `no_adsets` forever, while the UI shows an
          // active portfolio that never scores. Surface it as a failed enroll (the state it
          // actually is) instead of navigating to an empty portfolio that looks created.
          if (suggestion.adset_ids.length === 0) {
            setPendingKey(null);
            setEnrollFailedKeys((prev) => new Set(prev).add(suggestion.name));
            return;
          }

          // Score the first cycle only AFTER enrollment lands (a cycle on 0 ad
          // sets is a no-op).
          enroll.mutate(suggestionToEnrollRequest(portfolio_id, suggestion), {
            onSuccess: () => {
              setPendingKey(null);
              setCreatedKeys((prev) => new Set(prev).add(suggestion.name));
              setEnrollFailedKeys((prev) => {
                const next = new Set(prev);
                next.delete(suggestion.name);
                return next;
              });
              run.mutate(portfolio_id);
              onCreated?.(portfolio_id);
            },
            // Deliberately does NOT navigate. Opening a portfolio with nothing
            // enrolled lands the user on "Scoring your first cycle…" that
            // resolves to "nothing to score" — the failure reads as a broken
            // optimizer instead of a retryable enroll. Stay put and say so.
            onError: () => {
              setPendingKey(null);
              setEnrollFailedKeys((prev) => new Set(prev).add(suggestion.name));
            },
          });
        },
      },
    );
  };

  // Two views, not three steps. Starting from a suggestion and building one by hand are
  // ALTERNATIVES — the old page rendered both at once, stacked, under a decorative "1 → 2 → 3"
  // list. Splitting them is what frees the builder to use the whole container instead of being
  // the third thing down a scroll.
  if (view === 'build') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <button
          type="button"
          onClick={() => setView('start')}
          className="flex w-fit shrink-0 items-center gap-1 rounded text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
          Back to suggestions
        </button>
        <PortfolioCreateForm
          brandId={brandId}
          adAccountId={adAccountId}
          currency={resolvedCurrency}
          level={level}
          onCreated={onCreated}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showAccountHeader ? (
        <AccountHeader
          name={account?.name ?? adAccountId}
          platform={account?.platform ?? null}
          status={account?.status ?? null}
          currency={resolvedCurrency}
        />
      ) : null}

      {diagnostics && diagnostics.trackingGaps > 0 ? (
        <TrackingGapBanner
          gaps={diagnostics.trackingGaps}
          spending={diagnostics.spending}
          samples={diagnostics.gapSamples}
        />
      ) : null}

      {/* The "nothing movable" verdict tells the reader to convert a campaign to
          ad-set budgets. That section is rendered below, often past several
          screens of suggestions, so the verdict shipped as advice with no way to
          act on it. */}
      <SignalReadinessCard
        action={
          cboSections.length > 0 ? (
            <Button
              className="h-6 px-2 text-xs"
              onClick={() =>
                cboSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              size="xs"
              type="button"
              variant="ghost"
            >
              Show {cboSections.length} CBO {cboSections.length === 1 ? 'campaign' : 'campaigns'}
            </Button>
          ) : null
        }
        objective={accountObjective}
        snapshots={snapshots}
      />

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          <h3 className="font-semibold text-sm tracking-tight">Start from a suggestion</h3>
          {suggestions.length > 0 ? (
            <span className="text-muted-foreground text-xs">
              grouped from this account&rsquo;s active ad sets
            </span>
          ) : null}
        </div>

        {suggestRead.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : suggestRead.isError ? (
          <p className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-warning text-xs">
            Suggestions are unavailable — the optimizer service is offline. You can still build a
            portfolio by hand.
          </p>
        ) : suggestions.length === 0 ? (
          <div className="space-y-2 rounded-lg border border-border/70 border-dashed bg-muted/10 px-4 py-3">
            <p className="text-muted-foreground text-xs">
              {suggestEmptyMessage(suggestReason, level, {
                hasProjections: projectedConversions.length > 0,
              })}
            </p>
            {suggestReason === 'not_permitted' ? (
              <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                <Link href={PAID_SETUP_CONNECT_HREF}>Manage assignments</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {/* Compact selector row: the cards stay small so an open suggestion never
                stretches a grid cell and leaves its siblings blank. Exploring one opens
                the full-width split pane below. */}
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {suggestions.map((suggestion) => {
                const groupIds = new Set(suggestion.adset_ids);
                const canExplore = snapshots.some((snapshot) => groupIds.has(snapshot.id));
                return (
                  <SuggestionRow
                    key={suggestion.name}
                    suggestion={suggestion}
                    currency={resolvedCurrency}
                    created={createdKeys.has(suggestion.name)}
                    enrollFailed={enrollFailedKeys.has(suggestion.name)}
                    busy={pendingKey === suggestion.name}
                    canExplore={canExplore}
                    active={activeSuggestionName === suggestion.name}
                    onToggleExplore={() =>
                      setActiveSuggestionName((prev) =>
                        prev === suggestion.name ? null : suggestion.name,
                      )
                    }
                    onCreate={(override) => createFromSuggestion(suggestion, override)}
                  />
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {activeSuggestion ? (
                <motion.div
                  key={activeSuggestion.name}
                  initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.28,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="overflow-hidden"
                >
                  <div className="pt-1">
                    <SuggestionExplorer
                      suggestion={activeSuggestion}
                      snapshots={activeGroupSnapshots}
                      currency={resolvedCurrency}
                      brandId={brandId}
                      accountId={adAccountId}
                      created={createdKeys.has(activeSuggestion.name)}
                      busy={pendingKey === activeSuggestion.name}
                      enrollFailed={enrollFailedKeys.has(activeSuggestion.name)}
                      onCreate={(override) => createFromSuggestion(activeSuggestion, override)}
                      onClose={() => setActiveSuggestionName(null)}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        )}

        {/* Projected suggestions sit WITH the real ones: on an all-CBO account they are the
            only suggestion available, and on a mixed account they are the next thing to
            evaluate after the groupable ad sets. Acting on one is still the convert below. */}
        {suggestRead.isLoading ? null : (
          <ProjectedConversions
            brandId={brandId}
            accountId={adAccountId}
            currency={resolvedCurrency}
            projections={projectedConversions}
          />
        )}
      </section>

      <div ref={cboSectionRef}>
        <CboCampaigns
          brandId={brandId}
          accountId={adAccountId}
          currency={resolvedCurrency}
          sections={cboSections}
          snapshots={snapshots}
        />
      </div>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/10 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm tracking-tight">Or build one by hand</h3>
          <p className="text-muted-foreground text-xs">
            Pick the ad sets yourself and set the budget and target.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => setView('build')}
        >
          <PlusIcon className="size-4" aria-hidden="true" />
          Build a portfolio
        </Button>
      </section>
    </div>
  );
}

function AccountHeader({
  name,
  platform,
  status,
  currency,
}: {
  name: string;
  platform: string | null;
  status: string | null;
  currency: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Optimizing account</p>
        <p className="truncate text-sm font-semibold tracking-tight">{name}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {platform ? (
          <Badge variant="outline" className="text-3xs">
            {humanize(platform)}
          </Badge>
        ) : null}
        {currency ? (
          <Badge variant="secondary" className="text-3xs">
            {currency}
          </Badge>
        ) : null}
        {status ? (
          <Badge
            variant={status.toLowerCase() === 'active' ? 'success' : 'outline'}
            className="text-3xs"
          >
            {humanize(status)}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function TrackingGapBanner({
  gaps,
  spending,
  samples,
}: {
  gaps: number;
  spending: number;
  samples: string[];
}) {
  return (
    <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <div>
        <p>
          <b>{gaps}</b> of {spending} spending ad sets have <b>0 tracked conversions</b> for their
          objective — check the pixel/conversion tracking before enrolling.
        </p>
        {samples.length > 0 ? (
          <p className="mt-1 font-mono text-2xs opacity-80">{samples.slice(0, 4).join(', ')}</p>
        ) : null}
      </div>
    </div>
  );
}

function SuggestionRow({
  suggestion,
  currency,
  created,
  busy,
  enrollFailed,
  canExplore,
  active,
  onToggleExplore,
  onCreate,
}: {
  suggestion: PortfolioSuggestion;
  currency: string | null;
  created: boolean;
  busy: boolean;
  /** The portfolio was created but its ad sets did not enroll. Surfaced HERE
   *  rather than by navigating to the new portfolio: an empty portfolio opens on
   *  a spinner and then reports "nothing to score", which reads as a broken
   *  optimizer instead of a failed enroll the user can simply retry. */
  enrollFailed: boolean;
  /** There are ad-set snapshots to explore (the explorer needs them). */
  canExplore: boolean;
  /** This suggestion's explorer is the one currently open below the row. */
  active: boolean;
  onToggleExplore: () => void;
  onCreate: (override: { objective: OptimizationObjective; mode: OptimizationModeDto }) => void;
}) {
  // The card commits with the server's inferred objective; the objective lever now
  // lives in the explorer, where an operator adjusts it beside the ad sets it scores.
  const objective = suggestion.objective;
  const mode = DEFAULT_MODE_BY_OBJECTIVE[objective];
  const metric = getOptimizationMetricDefinition(objective);
  const cpa = deriveEfficiency(
    suggestion.summary.spend14,
    suggestion.summary.conv14,
    metric.denominatorMultiplier,
  );
  // Nudge toward Traffic when a conversion objective has no tracked conversions — that
  // combination scores as pause-all / Low confidence and gives the user no value.
  const noConversions = CONVERSION_OBJECTIVES.has(objective) && suggestion.summary.conv14 === 0;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-colors',
        active ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border/70',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {suggestion.name}
            <Badge variant="teal" className="text-3xs">
              {humanize(mode)}
            </Badge>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {suggestion.summary.adsets} ad sets · {formatCurrency(suggestion.daily_total, currency)}
            /d
            {cpa != null ? ` · ${metric.costLabel} ${formatCpa(cpa, currency)}` : ''}
          </p>
          {/* Suggestion creates start in recommend (see createFromSuggestion): the optimizer
              proposes moves and nothing is written until you approve it in the Action Log. */}
          <p className="mt-1 text-2xs text-muted-foreground">
            Starts in Recommend — scores every night and proposes moves; nothing changes until you
            approve it.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canExplore ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              aria-expanded={active}
              onClick={onToggleExplore}
            >
              <ChevronDownIcon
                className={`size-3.5 transition-transform ${active ? 'rotate-180' : ''}`}
              />
              Explore ad sets
            </Button>
          ) : null}
          {created ? (
            <Badge variant="success" className="gap-1 text-3xs">
              <CheckCircle2Icon className="size-3" /> created
            </Badge>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 px-3 text-xs"
              disabled={busy}
              onClick={() => onCreate({ objective, mode })}
            >
              <PlusIcon className="size-3.5" />
              {busy ? 'Creating…' : 'Create'}
            </Button>
          )}
        </div>
      </div>
      {enrollFailed ? (
        <p className="px-4 pb-2 text-2xs text-warning" role="status">
          Portfolio created, but its ad sets didn&rsquo;t enroll. Press Create again to retry —
          nothing has been changed on Meta.
        </p>
      ) : null}
      {noConversions ? (
        <p className="px-4 pb-2 text-2xs text-warning">
          No conversions tracked in the last 14 days — a conversion objective will score as Low
          confidence. Consider <b>Traffic</b> for a decisive first cycle.
        </p>
      ) : null}
    </div>
  );
}

export function PortfolioCreateForm({
  brandId,
  adAccountId,
  currency,
  level = 'adset',
  onCreated,
}: {
  brandId: string;
  adAccountId: string;
  currency: string | null;
  level?: PortfolioLevel;
  onCreated?: (portfolioId: string) => void;
}) {
  const { create, enroll, run } = useOptimizerMutations(brandId, adAccountId);
  const snapshotsRead = useOptimizerAccountSnapshots(brandId, adAccountId, level);

  const [name, setName] = React.useState('');
  const [objective, setObjective] = React.useState<OptimizationObjective>('purchase');
  const [mode, setMode] = React.useState<OptimizationModeDto>('balanced');
  // Create-time autonomy: recommend (propose moves, human approves) is the default, or observe
  // (score only, no proposals). Autopilot requires guardrails and is armed only from Manage
  // after create. Recommend never auto-writes, so a new portfolio surfaces work to approve.
  const [applyMode, setApplyMode] = React.useState<ApplyMode>('recommend');
  const [dailyTotal, setDailyTotal] = React.useState('');
  const [cpaTarget, setCpaTarget] = React.useState('');
  const [selectedAdsetIds, setSelectedAdsetIds] = React.useState<string[]>([]);

  // Sum of the selected ad sets' current daily budgets — offered as the default
  // daily total when the operator hasn't typed one (they keep control).
  const selectedBudgetSum = React.useMemo(() => {
    const ids = new Set(selectedAdsetIds);
    return snapshotsRead.data
      .filter((snapshot) => ids.has(snapshot.id))
      .reduce((sum, snapshot) => sum + (snapshot.currentBudget ?? 0), 0);
  }, [snapshotsRead.data, selectedAdsetIds]);

  // What the engine will actually do with this selection, under this objective, at this budget
  // and target. Deterministic and recomputed on every change — it is the only place in the
  // product that holds BOTH the selection and the objective, which is what makes the
  // kpi_mismatch collision (an ad set that enrolls ELIGIBLE and yet frozen) knowable at all.
  const advice = useSetupAdvice({
    snapshots: snapshotsRead.data,
    selectedIds: selectedAdsetIds,
    objective,
    mode,
    dailyTotal,
    target: cpaTarget,
  });

  const typedDaily = Number.parseFloat(dailyTotal);
  const effectiveDaily =
    Number.isFinite(typedDaily) && typedDaily > 0 ? typedDaily : selectedBudgetSum;
  // A portfolio with no enrolled entities is INERT: the scheduler claims it every cycle and
  // skips with `no_adsets`, forever, while the UI shows an active portfolio that never
  // scores. Enrollment is what makes a portfolio real, so it is required to create one.
  const canSubmit = name.trim().length > 0 && effectiveDaily > 0 && selectedAdsetIds.length > 0;
  const busy = create.isPending || enroll.isPending;
  const metric = getOptimizationMetricDefinition(objective);

  const handleCreate = () => {
    if (!canSubmit) return;
    const cpaValue = Number.parseFloat(cpaTarget);
    create.mutate(
      {
        brand_id: brandId,
        ad_account_id: adAccountId,
        config: {
          name: name.trim(),
          objective,
          level,
          mode,
          apply_mode: applyMode,
          daily_total: effectiveDaily,
          // effectiveDaily is a snapshot of what the selected ad sets spend TODAY, not a
          // target anyone chose — so the portfolio must keep tracking the live sum. Pinning
          // it is what made balanced cycles claw budgets back to their create-day values.
          budget_source: 'observed',
          lookback_window: 'd14',
          ...(Number.isFinite(cpaValue) && cpaValue > 0
            ? { cpa_target: cpaValue / metric.denominatorMultiplier }
            : {}),
        },
      },
      {
        onSuccess: ({ portfolio_id }) => {
          // canSubmit guarantees a non-empty selection, so enroll always runs. On failure we
          // stay put with the error visible rather than navigating to an inert portfolio;
          // create is idempotent (unique name per account), so pressing Create again retries
          // the enroll against the same portfolio.
          const nameById = new Map(snapshotsRead.data.map((s) => [s.id, s.name]));
          const adset_names: Record<string, string> = {};
          for (const id of selectedAdsetIds) {
            const adsetName = nameById.get(id);
            if (adsetName && adsetName.trim().length > 0) adset_names[id] = adsetName;
          }
          enroll.mutate(
            {
              portfolio_id,
              adset_ids: selectedAdsetIds,
              ...(Object.keys(adset_names).length > 0 ? { adset_names } : {}),
            },
            {
              onSuccess: () => {
                run.mutate(portfolio_id);
                setName('');
                setDailyTotal('');
                setCpaTarget('');
                setSelectedAdsetIds([]);
                setApplyMode('recommend');
                onCreated?.(portfolio_id);
              },
            },
          );
        },
      },
    );
  };

  const symbol = currencySymbol(currency);
  const entityLabel = level === 'campaign' ? 'campaigns' : 'ad sets';

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0 rounded-lg py-0 shadow-none">
      <CardHeader className="shrink-0 border-b border-border/70 p-4">
        <CardTitle className="text-sm">Create a portfolio</CardTitle>
        <p className="text-xs text-muted-foreground">
          Pick the {entityLabel} to optimize together, and set a daily budget in{' '}
          {currency ?? 'the account currency'}.
        </p>
      </CardHeader>

      {/* Two panes: the selection on the left, and everything that DEPENDS on the selection on
          the right. They have to be on screen together — an advisor you scroll away from to
          reach the budget field is an advisor nobody reads. Below lg they stack, picker first. */}
      <CardContent className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-1.5">
          <Label>{level === 'campaign' ? 'Campaigns to enroll' : 'Ad sets to enroll'}</Label>
          <CampaignAdsetPicker
            snapshots={snapshotsRead.data}
            selectedAdsetIds={selectedAdsetIds}
            onChange={setSelectedAdsetIds}
            brandId={brandId}
            accountId={adAccountId}
            currency={currency}
            disabled={busy}
            isLoading={snapshotsRead.isLoading}
            isError={snapshotsRead.isError}
            mode={level}
            objective={objective}
            // The picker takes whatever height the pane has. It used to be capped at 60vh inside
            // a 672px column — the cap was doing the cramping, not the content.
            heightClassName="h-[22rem] lg:h-full lg:min-h-[24rem]"
          />
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <div className="space-y-1.5">
            <Label htmlFor="optimizer-portfolio-name">Name</Label>
            <Input
              id="optimizer-portfolio-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Prospecting · Purchases"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Objective</Label>
              <Select
                value={objective}
                onValueChange={(value) => setObjective(value as OptimizationObjective)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanize(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as OptimizationModeDto)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanize(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Autonomy gets its own row now. It used to share a 3-up grid with Budget and Target
              purely because the column was 672px wide — three unrelated controls jammed
              together, and its explainer had nowhere to go. */}
          <div className="space-y-1.5">
            <Label>Autonomy tier</Label>
            {/* Create offers observe (soak) and recommend (HITL). Autopilot needs guardrails
                and is armed only from Manage — the DB refuses unguarded autopilot. */}
            <Select value={applyMode} onValueChange={(value) => setApplyMode(value as ApplyMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['observe', 'recommend'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {applyModePill(value)?.label ?? humanize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-2xs text-muted-foreground">{applyModeExplainer(applyMode)}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="optimizer-daily-total">Daily budget ({symbol})</Label>
              <Input
                id="optimizer-daily-total"
                inputMode="decimal"
                value={dailyTotal}
                onChange={(event) => setDailyTotal(event.target.value)}
                placeholder={selectedBudgetSum > 0 ? String(Math.round(selectedBudgetSum)) : '4200'}
              />
              <BudgetHint
                advice={advice}
                currency={currency}
                disabled={busy}
                onUse={setDailyTotal}
              />
            </div>
            <div className="space-y-1.5">
              {/* NOT "(optional)". Blank does not mean "no target" — it means the engine's $50
                  default, which is the spend at which a zero-result ad set gets proposed for
                  pause. The advisor says so, loudly, right below. */}
              <Label htmlFor="optimizer-cpa-target">
                {metric.targetLabel} ({symbol})
              </Label>
              <Input
                id="optimizer-cpa-target"
                inputMode="decimal"
                value={cpaTarget}
                onChange={(event) => setCpaTarget(event.target.value)}
                placeholder={metric.costLabel === 'CPM' ? '12' : '40'}
              />
              <TargetHint
                advice={advice}
                currency={currency}
                disabled={busy}
                onUse={setCpaTarget}
              />
            </div>
          </div>

          <SetupAdvisor
            advice={advice}
            brandId={brandId}
            selectedIds={selectedAdsetIds}
            disabled={busy}
            onChangeSelection={setSelectedAdsetIds}
            onUseBudget={setDailyTotal}
            onUseTarget={setCpaTarget}
          />

          {create.isError || enroll.isError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {create.error instanceof Error
                ? create.error.message
                : enroll.error instanceof Error
                  ? `Portfolio created, but enrolling the ${entityLabel} failed — press Create again to retry, or add them from Manage.`
                  : 'Could not create the portfolio.'}
            </p>
          ) : null}

          <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-2 border-border/60 border-t bg-card pt-3">
            <p className="min-w-0 truncate text-2xs text-muted-foreground">
              {selectedAdsetIds.length > 0
                ? `${formatCurrency(selectedBudgetSum, currency)}/day current budget`
                : `Select at least one of the ${entityLabel}.`}
            </p>
            <Button
              type="button"
              className="shrink-0 gap-1.5"
              disabled={!canSubmit || busy}
              onClick={handleCreate}
            >
              <PlusIcon className="size-4" />
              {busy
                ? 'Creating…'
                : selectedAdsetIds.length > 0
                  ? `Create & enroll ${selectedAdsetIds.length}`
                  : 'Create portfolio'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
