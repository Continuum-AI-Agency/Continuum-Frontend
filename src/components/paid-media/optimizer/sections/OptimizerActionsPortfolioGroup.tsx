'use client';

import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import { useTranslations as useBetaTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import type { CreativeOutputManifest } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { LocalizedUiError, useUiErrorMessage } from '@/i18n/errors';
import { formatDecimal } from '@/lib/format/decimal';
import { localizeOptimizationMetricDefinition } from '@/lib/paid-media/optimizationMetricPresentation';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

// One portfolio's UNIFIED actionable queue. The portfolio's performance report carries
// two kinds of work a human decides on: budget moves (cycle_items — held, approved, or a
// scored change not yet written) and recommendations (pause / fatigue). This surface reads
// both, lets the operator multi-select and approve them, and then EXECUTES the approved set
// through the real Meta write path — budget drains via optimizer-apply-approved, pauses via
// the audited optimizer-apply-adset-status drain. The app makes the Meta call; the user
// never opens Business Manager.
//
// Creative kinds (variate_creative / seed_experiment) are approvable: approving one opens a
// creative request — a tracked task, or a generation job when the portfolio has autogen on —
// and its brief renders inline from the recommendation's seed. pause_ad is still FOUND but not
// executable (no single-ad pause drain yet), so it renders read-only with a danger tooltip —
// never a button that lies about acting.
//
// Approve is optimistic (a spinner while in flight, rolled back on error); an APPLIED state
// is never assumed from a mutation — it is read back from the drain's per-item results and
// the refetch the mutations trigger.
//
// A platform_signal recommendation (Google, TikTok) the platform-cards read returned renders as
// its platform card, with the card's own control (the validate_only preview, then the write),
// never as a queue row: as a row it took the fatigue route, whose Approve only flips the status
// and runs no write. Without that read it stays a row, so nothing pending disappears.

import {
  type AccountCandidate,
  type AdSetSnapshot,
  type AdsetAd,
  type AudienceProposalRow,
  type ConvertCboResponse,
  type CreativeSwapJobRow,
  type CycleItemRow,
  GLOBAL_ANGLE_LABELS,
  type GlobalAngleId,
  getOptimizationMetricDefinition,
  type ParsedCycleRunReport,
  type PortfolioLevel,
  type PortfolioListItem,
  type RecommendationRow,
} from '@continuum/contracts';
import { ChevronDownIcon, ChevronRightIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { resolveAdsetName } from '../adsetName';
import { attributeTransfers, type TransferAttribution } from '../charts/chartData';
import { maxCiUpperBound } from '../charts/chartScale';
import { ReallocationStory } from '../charts/ReallocationStory';
import { defaultStoryLookback } from '../charts/reallocationStoryModel';
import { platformName } from '../entityNoun';
import { figureProps, formatCurrency } from '../format';
import { itemWritable, proposalsOnlyNote } from '../platformWrites';
import { portfolioCurrency } from '../portfolioCurrency';
import {
  actionRoute,
  applyModeExplainer,
  creativeBriefForRec,
  notImplementedMessage,
  parseReport,
  recommendationLabel,
  severityRank,
} from '../reportModel';
import * as typeScale from '../typeScale';
import {
  fetchAdsetAds,
  type PortfolioAudienceRow,
  useAdAccountCurrency,
  useApplyAdsetStatus,
  useApplyApproved,
  useAudienceProposalMutations,
  useConvertCbo,
  useCurrentMoves,
  useFlashCreativeMutations,
  useOptimizerAccountSnapshots,
  useOptimizerActions,
  useOptimizerAdsetAds,
  useOptimizerAudienceProposals,
  useOptimizerCreativeSwapJobs,
  useOptimizerEnrolledAdsets,
  useOptimizerMutations,
  useOptimizerPerformance,
  useOptimizerPortfolioAudiences,
} from '../useOptimizerData';
import { AudienceRecommendationCard } from './AudienceRecommendationCard';
import { AccountRead } from './account/AccountRead';
import {
  type AudienceActionHandlers,
  audienceCardView,
  carriedRecommendation,
  isAudienceRecommendation,
  type PortfolioAdsetSpec,
  portfolioSpecsFrom,
} from './audienceCardModel';
import { CostIntervalLine } from './CostIntervalLine';
import { CreativeRecommendationCard } from './CreativeRecommendationCard';
import { isCreativeRecommendation, standingChart, subjectAdId } from './creativeCardModel';
import { BudgetMoveQueueRow } from './crossPlatformMove/BudgetMoveQueueRow';
import { MoveDecisionCard } from './crossPlatformMove/MoveDecisionCard';
import { groupActionFeed } from './crossPlatformMove/moveDecisionModel';
import {
  isBudgetMoveRecommendation,
  moveWritesOffNote,
  type QueuedMove,
  readQueuedMove,
} from './crossPlatformMove/queuedMoveModel';
import { type ImplementTarget, implementTargets, predecessorAdIn } from './flashCreativesModel';
import { KindTag, type KindTone, kindTone, kindWord } from './kindTag';
import { OptimizerReadError } from './OptimizerReadError';
import { AppliedWriteRow, BudgetWritePreview } from './pages/actions/WritePreview';
import {
  autopilotNextRun,
  budgetWriteState,
  guardrailChecks,
} from './pages/actions/writePreviewModel';
import { cardActionsOf, cardRecommendationId } from './platformCards/platformCardActionModel';
import { portfolioPlatforms } from './platforms/platformTabsModel';
import { portfolioPlanPerDay } from './portfolioPlan';
import { isStale, rosterLine, rosterTone, staleLine } from './portfolioStaleness';
import { QueueTraySkeleton } from './QueueTraySkeleton';
import { RecEvidenceChart } from './RecEvidenceChart';
import { RecommendationInsight } from './RecommendationInsight';
import {
  asOfLine,
  daysSince,
  evidenceLine,
  formatSettingsValue,
  impactLabel,
  impactPerDay,
  type QueueSummaryGroup,
  queueHeadlineLine,
  queueSummary,
  type SettingsPatch,
  settingsFieldLabel,
  settingsPatchOf,
  triggerReason,
  withHonestCapBinding,
} from './recQueueModel';

/** A budget move needing a decision — held by autopilot, approved and awaiting the drain,
 *  or a scored change not yet written (recommend mode). */
export type BudgetQueueRow = {
  key: string;
  route: 'budget';
  adsetId: string;
  name: string | null;
  item: CycleItemRow;
  /** apply_status === 'approved_pending' — already approved, awaiting "Apply N budget moves". */
  approved: boolean;
};

/** A recommendation needing a decision. `route` is where an approval drains to:
 *  'pause' (audited Meta pause), 'creative' (a creative request — task or generation job),
 *  'fatigue' (renewal task), 'hidden' (found, not executable). */
export type RecQueueRow = {
  key: string;
  route: 'pause' | 'creative' | 'fatigue' | 'settings' | 'hidden';
  adsetId: string;
  name: string | null;
  rec: RecommendationRow;
  /** rec.status === 'approved' — a pause awaiting "Pause N ad sets". */
  approved: boolean;
  /** Why this proposal can no longer be approved (its ad set left the roster, or the whole
   *  roster left Meta). Shown in place of Approve; absent while it still stands. */
  blocked?: string | null;
};

export type QueueRow = BudgetQueueRow | RecQueueRow;

type EvidenceContext = {
  snapshotById: Map<string, AdSetSnapshot>;
  itemById: Map<string, CycleItemRow>;
  kpiField: string;
  denominatorMultiplier: number;
  maxCpa: number;
  brandId: string;
  adAccountId: string;
  /** The brand's creative swap jobs — the flash creatives a recommendation spawned. */
  swapJobs: readonly CreativeSwapJobRow[];
  /** Ask Creative+ for variants: picks the brand's best-fitting workflow, writes the
   *  prompts from the card's three lines and queues one job on the recommendation. */
  requestGeneration: (rec: RecommendationRow, name: string | null, ads: readonly AdsetAd[]) => void;
  generatingIds: ReadonlySet<string>;
  /** Why the last request for a row could not be placed (no workflow fits, RPC failed). */
  generateNotes: ReadonlyMap<string, string>;
  /** Put a finished variant beside the current ad of an ad set (this one or another). */
  implementCreative: (
    job: CreativeSwapJobRow,
    assetId: string,
    target: ImplementTarget,
    manifest: CreativeOutputManifest,
  ) => void;
  retryCreative: (job: CreativeSwapJobRow) => void;
  implementingKey: string | null;
  audiences: readonly PortfolioAudienceRow[];
  /** Every enrolled ad set's live targeting, for the audience card's "qué es nuevo". */
  portfolioSpecs: readonly PortfolioAdsetSpec[];
  currency: string | null;
  /** The objective's result, lower-cased, for the creative comparison chart. */
  resultWord: string;
  /** Audience proposals for the brand and the actions the audience card takes on them. */
  audienceProposals: readonly AudienceProposalRow[];
  audienceActions: {
    /** Ask Jaina for a proposal. `onDone` receives the id the RPC returned — the SAME row
     *  when a re-ask inside the hour was throttled — so the card can say so. */
    request: (recId: string, handlers?: AudienceActionHandlers) => void;
    /** Re-run the Meta write a failed row stopped at (optimizer_retry_audience_proposal). */
    retry: (proposalId: string, handlers?: AudienceActionHandlers) => void;
    approve: (
      input: {
        proposalId: string;
        budgetMinorUnits: number;
        activate: boolean;
        mode: 'replace' | 'add';
      },
      handlers?: AudienceActionHandlers,
    ) => void;
    cancel: (proposalId: string, handlers?: AudienceActionHandlers) => void;
    activate: (proposalId: string, handlers?: AudienceActionHandlers) => void;
    undo: (proposalId: string, handlers?: AudienceActionHandlers) => void;
    convertCbo: (campaignId: string, dryRun: boolean) => void;
  };
  audienceBusy: {
    requestingRecId: string | null;
    retryingId: string | null;
    approvingId: string | null;
    busyId: string | null;
    convertingCbo: boolean;
  };
  cboPreviewByCampaign: ReadonlyMap<string, ConvertCboResponse>;
};

/** The audience card's actions and their busy flags, as `useAudienceCardActions` hands them
 *  out — to this queue's rows and to the asked-for row that opens its proposal in place. */
export type AudienceCardActions = EvidenceContext['audienceActions'];
export type AudienceCardBusy = EvidenceContext['audienceBusy'];

type SettingsActions = {
  busy: boolean;
  apply: (rec: RecommendationRow, patch: SettingsPatch) => Promise<void>;
  decide: (rec: RecommendationRow, status: 'approved' | 'rejected') => void;
};

/** The checkbox's accessible name. It has to name the DECISION, not just the ad set: one
 *  cycle can queue a budget move AND a creative refresh on the same ad set, and labelling
 *  both "Select <ad set>" gave two different writes one indistinguishable name — a screen
 *  reader user could not tell which one they were authorizing. */
export function selectionLabel(row: QueueRow, uiTranslate?: ScaleCopy | number): string {
  if (typeof uiTranslate !== 'function') uiTranslate = undefined;
  const translate = uiTranslate ? createOptimizerDisplayTranslate(uiTranslate) : undefined;
  const subject = row.name ?? row.adsetId;
  if (row.route === 'budget')
    return uiTranslate
      ? uiTranslate('helper_845c926f0a7b', { v0: subject })
      : `Select budget move for ${subject}`;
  return uiTranslate
    ? uiTranslate('helper_f95dfd06c654', {
        v0: recommendationLabel(row.rec.kind, translate).label.toLowerCase(),
        v1: subject,
      })
    : `Select ${recommendationLabel(row.rec.kind, translate).label.toLowerCase()} for ${subject}`;
}

/** A row a human can select and approve. Approved rows (awaiting execute) and hidden
 *  ad-level rows are shown but never selectable. */
export function isSelectableRow(row: QueueRow): boolean {
  if (row.route === 'hidden') return false;
  // A settings row is applied from its own button — it writes a portfolio field, not an
  // ad set, so it never joins a batch approval.
  if (row.route === 'settings') return false;
  if (row.route === 'budget') return !row.approved;
  if (row.blocked) return false;
  // An audience recommendation is decided on its card (create the new ad set), never in a
  // batch approval that would only open a renewal task.
  if (isAudienceRecommendation(row.rec)) return false;
  return row.rec.status === 'pending';
}

/** Build ONE portfolio's unified queue from its parsed performance report. Pure and
 *  DOM-free so the ordering + inclusion rules are unit-tested without React. Ordering:
 *  work needing a decision first (budget moves, then recs by severity), approved-awaiting-
 *  execute next, and the hidden ad-level rows last. */
export function buildActionQueue(
  report: ParsedCycleRunReport | null,
  nameById?: Map<string, string> | null,
  carried: readonly RecommendationRow[] = [],
  /** Whether a budget move's platform may be written here (platformWrites.ts): a move nobody
   *  may write stays a proposal on the chart and never becomes an Approve row. */
  writable: (item: CycleItemRow) => boolean = () => true,
  /** Why a recommendation can no longer be approved, or null while it stands. */
  blockedNote: (rec: RecommendationRow) => string | null = () => null,
): QueueRow[] {
  if (!report && carried.length === 0) return [];
  const rows: QueueRow[] = [];

  for (const item of report?.latest_items ?? []) {
    const status = item.apply_status ?? null;
    const changed = (item.change_abs ?? 0) !== 0;
    // A held item (autopilot over-cap), an approved item (awaiting drain), or a scored move
    // not yet written (recommend mode) is actionable. Applied/failed/skipped rows live in Logs.
    const actionable =
      status === 'held' || status === 'approved_pending' || (status == null && changed);
    if (!actionable || !writable(item)) continue;
    rows.push({
      key: `budget:${item.adset_id}`,
      route: 'budget',
      adsetId: item.adset_id,
      name: resolveAdsetName(item, nameById),
      item,
      approved: status === 'approved_pending',
    });
  }

  for (const rec of report?.recommendations ?? []) {
    // A cross-platform move is its own row with its own three buttons (buildMoveQueue).
    if (isBudgetMoveRecommendation(rec)) continue;
    // Budget is never a recommendation route (budget moves are cycle_items), so the rec route
    // is one of pause | fatigue | hidden — narrow it so the row's union type is exact.
    const route = actionRoute(rec.kind);
    const recRoute: RecQueueRow['route'] = route === 'budget' ? 'fatigue' : route;
    // Pending recs need a decision; an APPROVED pause awaits its drain. Everything else
    // (rejected, applied, a hidden kind already approved) is not queue work.
    const relevant =
      rec.status === 'pending' || (recRoute === 'pause' && rec.status === 'approved');
    if (!relevant) continue;
    rows.push({
      key: `rec:${rec.id}`,
      route: recRoute,
      adsetId: rec.adset_id,
      name: resolveAdsetName(rec, nameById),
      rec,
      approved: rec.status === 'approved',
      blocked: rec.status === 'pending' ? blockedNote(rec) : null,
    });
  }

  // Recommendations an asked-for handoff points at that the report no longer lists (see
  // carriedRecommendation in ./audienceCardModel). "Open the audience proposal" resolves to
  // `rec:<id>` and lands HERE, so the row has to exist for as long as the row that opened it
  // does — otherwise the press switches tabs and focuses nothing. A rec the report does list
  // is not duplicated.
  const present = new Set(rows.map((row) => row.key));
  for (const rec of carried) {
    if (isBudgetMoveRecommendation(rec)) continue;
    const key = `rec:${rec.id}`;
    if (present.has(key)) continue;
    present.add(key);
    const route = actionRoute(rec.kind);
    rows.push({
      key,
      route: route === 'budget' ? 'fatigue' : route,
      adsetId: rec.adset_id,
      name: resolveAdsetName(rec, nameById),
      rec,
      approved: false,
    });
  }

  // Within a band, the money decides: two medium pauses are not equal when one drains
  // $500/day and the other $20/day.
  return rows.sort(
    (a, b) => queueRank(a) - queueRank(b) || rowImpactPerDay(b) - rowImpactPerDay(a),
  );
}

/**
 * Why a pause proposal can no longer be approved: its ad set left this portfolio (the same
 * note the withdrawn budget move carries), or the whole roster left Meta — a pause on an ad
 * set that is not there is a write with nothing to write to. Only pauses are blocked; the
 * other routes open tasks or briefs, which stay a person's call.
 */
export function pauseBlockedNote(
  rec: Pick<RecommendationRow, 'kind' | 'adset_id'>,
  portfolio: Pick<PortfolioListItem, 'roster_state' | 'withdrawn_reason' | 'platforms'>,
  movedNotes: ReadonlyMap<string, string>,
  uiTranslate?: ScaleCopy,
): string | null {
  if (actionRoute(rec.kind) !== 'pause') return null;
  // This row's Approve drains into the Meta ad-set writer, and the engine's pause rules also
  // fire on Google and TikTok entities: a portfolio with no Meta side cannot pause from here.
  const platforms = portfolio.platforms ?? [];
  if (platforms.length > 0 && !platforms.includes('meta')) {
    return uiTranslate
      ? uiTranslate('helper_54e0047b4194', {
          v0: platformName({ platform: platforms[0], level: null }),
        })
      : `Not available here: the Optimizer pauses only Meta ad sets. Pause this campaign in ${platformName({ platform: platforms[0], level: null })} if you agree.`;
  }
  const moved = movedNotes.get(rec.adset_id);
  if (moved)
    return uiTranslate ? uiTranslate('helper_f7805766154e', { v0: moved }) : `Withdrawn: ${moved}.`;
  if (
    portfolio.roster_state === 'absent' ||
    portfolio.withdrawn_reason === 'roster_absent' ||
    portfolio.withdrawn_reason === 'no_members'
  ) {
    return "Withdrawn: this portfolio's ad sets are no longer on Meta, so there is nothing to pause.";
  }
  return null;
}

/**
 * How many decisions the tray says are waiting — the same definition as the list read's
 * pending_recommendations + pending_budget_moves (reportModel.pendingWorkCount), so the
 * Overview, the Portfolios list and this header print one number.
 *
 * It used to be "the selectable visible rows", which left out a pending settings row (decided
 * from its own button, never selectable), an audience row, and anything the search or a
 * filter hid: the list said 9 and the tray said 8. Budget rows count whether held or already
 * approved and awaiting the drain (the list counts `approved_pending` too); a recommendation
 * counts while pending; an approved pause awaiting its drain is not a decision any more.
 */
export function queueWaitingCount(
  rows: readonly QueueRow[],
  moveRows: readonly MoveQueueRow[],
  platformCardCount: number,
): number {
  const queued = rows.filter((row) => row.route === 'budget' || row.rec.status === 'pending');
  const moves = moveRows.filter((row) => row.rec.status === 'pending');
  return queued.length + moves.length + platformCardCount;
}

/** A cross-platform move waiting on a person (pending) or on its write (approved). */
export type MoveQueueRow = {
  key: string;
  rec: RecommendationRow;
  move: QueuedMove;
};

/** The portfolio's cross-platform moves, biggest first. A row whose action does not parse
 *  against the contract is left out rather than shown with legs it cannot vouch for. */
export function buildMoveQueue(report: ParsedCycleRunReport | null): MoveQueueRow[] {
  const rows: MoveQueueRow[] = [];
  for (const rec of report?.recommendations ?? []) {
    if (rec.status !== 'pending' && rec.status !== 'approved') continue;
    const move = readQueuedMove(rec);
    if (move) rows.push({ key: `rec:${rec.id}`, rec, move });
  }
  return rows.sort(
    (a, b) =>
      Number(a.rec.status === 'approved') - Number(b.rec.status === 'approved') ||
      b.move.amountMinor - a.move.amountMinor,
  );
}

/** Who this ad set's budget came from, or went to. `direction` is from the row's point of
 *  view: a cut ad set FUNDS others, a raised one is FUNDED BY them. */
export type Counterparty = {
  adsetId: string;
  name: string | null;
  amount: number;
};

/** Attribution → per-ad-set counterparty lists, largest first. Slivers under a dollar are
 *  dropped here rather than in the pure function, which stays exact so its sums test cleanly. */
export function buildCounterparties(
  attribution: TransferAttribution,
  nameById?: Map<string, string> | null,
): Map<string, { direction: 'funds' | 'fundedBy'; parties: Counterparty[] }> {
  const byAdset = new Map<string, { direction: 'funds' | 'fundedBy'; parties: Counterparty[] }>();
  const name = (id: string) => resolveAdsetName({ adset_id: id }, nameById);

  for (const transfer of attribution.transfers) {
    if (transfer.amount < 1) continue;
    const donor = byAdset.get(transfer.fromAdsetId) ?? {
      direction: 'funds' as const,
      parties: [],
    };
    donor.parties.push({
      adsetId: transfer.toAdsetId,
      name: name(transfer.toAdsetId),
      amount: transfer.amount,
    });
    byAdset.set(transfer.fromAdsetId, donor);

    const recipient = byAdset.get(transfer.toAdsetId) ?? {
      direction: 'fundedBy' as const,
      parties: [],
    };
    recipient.parties.push({
      adsetId: transfer.fromAdsetId,
      name: name(transfer.fromAdsetId),
      amount: transfer.amount,
    });
    byAdset.set(transfer.toAdsetId, recipient);
  }

  for (const entry of byAdset.values()) entry.parties.sort((a, b) => b.amount - a.amount);
  return byAdset;
}

const FOCUS_PIN_INTERVAL_MS = 200;
const FOCUS_PIN_DURATION_MS = 3_000;
/** How long a focus key may go unmatched before the queue says so out loud. */
const FOCUS_MISSING_DELAY_MS = 3_000;
const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Bring a row into view and keep it there while the panel settles.
 *
 * The panels above this queue (the ask cards, the day's read) may still be loading when the
 * row is first brought into view, and each one that lands pushes the row back out of it — a
 * smooth scroll started on mount is cancelled by that very relayout. So after the first
 * smooth scroll the row is re-centred whenever it has left the panel's visible box, for a
 * few seconds at most, and never past the person's own first scroll, which is theirs to keep.
 * Returns the stop function.
 */
function pinRowInView(rowKey: string): () => void {
  const node = () =>
    document.querySelector<HTMLElement>(`[data-row-key="${selectorValue(rowKey)}"]`);
  const frame = requestAnimationFrame(() =>
    node()?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
  );
  const stop = () => {
    cancelAnimationFrame(frame);
    clearInterval(pin);
    clearTimeout(release);
    for (const event of USER_SCROLL_EVENTS) window.removeEventListener(event, stop);
  };
  const pin = setInterval(() => {
    const row = node();
    if (row && !isInScrollView(row)) row.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, FOCUS_PIN_INTERVAL_MS);
  const release = setTimeout(stop, FOCUS_PIN_DURATION_MS);
  for (const event of USER_SCROLL_EVENTS) window.addEventListener(event, stop, { passive: true });
  return stop;
}

/** Whether a row's top edge sits inside the visible box of the panel that scrolls it — the
 *  tab panel when the queue is inside one, else the window. The row is aligned to the top
 *  (`block: 'start'`, with the `scroll-mt-2` on the row as its margin) rather than centred:
 *  an expanded card is often taller than the panel, and centring it hides the headline. */
function isInScrollView(node: HTMLElement): boolean {
  const box = node.getBoundingClientRect();
  const panel = node.closest<HTMLElement>('[role="tabpanel"]');
  const frame = panel
    ? panel.getBoundingClientRect()
    : {
        top: 0,
        bottom: window.innerHeight || document.documentElement.clientHeight,
      };
  return box.top >= frame.top - 1 && box.top < frame.bottom;
}

/** A row key inside an attribute selector. `CSS.escape` where the platform has it; the
 *  quote-and-backslash escape otherwise (happy-dom in tests has no `CSS`). */
function selectorValue(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

/** Sort key: needs-decision first, approved-awaiting-execute next, hidden last; within the
 *  needs-decision band, higher-severity recs rise. */
function rowImpactPerDay(row: QueueRow): number {
  return row.route === 'budget' ? 0 : impactPerDay(row.rec);
}

function queueRank(row: QueueRow): number {
  if (row.route === 'hidden') return 300;
  if (row.approved) return 200;
  if (row.route === 'budget') return 10;
  return 100 - severityRank(row.rec.severity);
}

type OptimizerActionsPortfolioGroupProps = {
  brandId: string;
  adAccountId: string;
  portfolio: PortfolioListItem;
  /** A row the hero asked to land on: filters clear, the row expands and scrolls into view. */
  focusRowKey?: string | null;
  onFocusRowConsumed?: () => void;
  /** Recommendations the portfolio's asked-for handoffs point at. One the report no longer
   *  lists is carried into the queue from its audience proposal (see buildActionQueue). */
  askedRecommendationIds?: readonly string[];
  /** After this long with a `focusRowKey` no row matches, the queue prints a note instead of
   *  staying silent. The default is the real wait; tests shorten it. */
  focusMissingDelayMs?: number;
  /** What leads the header line before the portfolio's name — the Actions tab puts the
   *  portfolio's platform chips there; the portfolio page, which already names them, nothing. */
  headerLead?: React.ReactNode;
  /** This portfolio's pending platform cards (optimizer_get_platform_cards). Each replaces its
   *  recommendation's queue row and counts in the header like one. */
  platformCards?: readonly AccountCandidate[];
};

const NO_PLATFORM_CARDS: readonly AccountCandidate[] = [];
const NO_PORTFOLIO_NAMES: ReadonlyMap<string, string> = new Map();

/**
 * The audience card's actions, wired once to the brand's proposal mutations and the CBO
 * conversion, with the busy flags each button reads. The queue rows use it through the
 * evidence context; the asked-for row that opens its proposal in place uses it directly,
 * so both surfaces press the same RPCs and never wire a second copy of the same request.
 * `noteFor` receives the recommendation id and the message when a request fails.
 */
function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useAudienceCardActions(
  brandId: string,
  adAccountId: string,
  noteFor: (recId: string, message: string) => void,
): {
  actions: AudienceCardActions;
  busy: AudienceCardBusy;
  cboPreviewByCampaign: ReadonlyMap<string, ConvertCboResponse>;
} {
  const formatUiError = useUiErrorMessage();
  const audienceMutations = useAudienceProposalMutations(brandId);
  const convertCboMutation = useConvertCbo(brandId);
  const [cboPreviewByCampaign, setCboPreviewByCampaign] = React.useState<
    ReadonlyMap<string, ConvertCboResponse>
  >(new Map());
  const [requestingRecId, setRequestingRecId] = React.useState<string | null>(null);
  const [retryingId, setRetryingId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const actions = React.useMemo<AudienceCardActions>(
    () => ({
      request: (recId, handlers) => {
        setRequestingRecId(recId);
        audienceMutations.request.mutate(recId, {
          onSuccess: (proposalId) => handlers?.onDone?.(proposalId),
          onError: (error) => {
            const message = formatUiError(error);
            noteFor(recId, message);
            handlers?.onError?.(message);
          },
          onSettled: () => setRequestingRecId(null),
        });
      },
      retry: (proposalId, handlers) => {
        setRetryingId(proposalId);
        audienceMutations.retry.mutate(proposalId, {
          onSuccess: () => handlers?.onDone?.(proposalId),
          onError: (error) =>
            handlers?.onError?.(
              error instanceof Error ? error.message : 'Could not retry in Meta.',
            ),
          onSettled: () => setRetryingId(null),
        });
      },
      // A refused write reaches the card that pressed it (handlers.onError). These four
      // used to settle silently, so a refusal read as a button that did nothing.
      approve: (input, handlers) => {
        setBusyId(input.proposalId);
        audienceMutations.approve.mutate(input, {
          onError: (error) => handlers?.onError?.(errorText(error, 'Could not create the ad set.')),
          onSettled: () => setBusyId(null),
        });
      },
      cancel: (proposalId, handlers) => {
        setBusyId(proposalId);
        audienceMutations.cancel.mutate(proposalId, {
          onError: (error) => handlers?.onError?.(errorText(error, 'Could not discard it.')),
          onSettled: () => setBusyId(null),
        });
      },
      activate: (proposalId, handlers) => {
        setBusyId(proposalId);
        audienceMutations.activate.mutate(proposalId, {
          onError: (error) => handlers?.onError?.(errorText(error, 'Could not switch it on.')),
          onSettled: () => setBusyId(null),
        });
      },
      undo: (proposalId, handlers) => {
        setBusyId(proposalId);
        audienceMutations.undo.mutate(proposalId, {
          onError: (error) => handlers?.onError?.(errorText(error, 'Could not undo it.')),
          onSettled: () => setBusyId(null),
        });
      },
      convertCbo: (campaignId, dryRun) => {
        convertCboMutation.mutate(
          { brandId, accountId: adAccountId, campaignId, dryRun },
          {
            onSuccess: (data: ConvertCboResponse | null) => {
              if (data) setCboPreviewByCampaign((prev) => new Map(prev).set(campaignId, data));
            },
          },
        );
      },
    }),
    [adAccountId, audienceMutations, brandId, convertCboMutation, noteFor, formatUiError],
  );
  const approving = audienceMutations.approve.isPending;
  const convertingCbo = convertCboMutation.isPending;
  return React.useMemo(
    () => ({
      actions,
      busy: {
        requestingRecId,
        retryingId,
        approvingId: approving ? busyId : null,
        busyId,
        convertingCbo,
      },
      cboPreviewByCampaign,
    }),
    [actions, requestingRecId, retryingId, approving, busyId, convertingCbo, cboPreviewByCampaign],
  );
}

export function OptimizerActionsPortfolioGroup({
  brandId,
  adAccountId,
  portfolio,
  focusRowKey = null,
  onFocusRowConsumed,
  askedRecommendationIds,
  focusMissingDelayMs = FOCUS_MISSING_DELAY_MS,
  headerLead = null,
  platformCards = NO_PLATFORM_CARDS,
}: OptimizerActionsPortfolioGroupProps) {
  const betaUiText = useBetaTranslations('scale');

  const formatUiError = useUiErrorMessage();
  const uiLocale = useLocale();

  const uiText = useTranslations('scale');
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const performanceQuery = useOptimizerPerformance(portfolio.id);
  const enrolledQuery = useOptimizerEnrolledAdsets(portfolio.id);
  // The account snapshots price each ad set for the story chart (shared cache with the
  // detail workspace, so opening the queue after the dashboard costs no second read).
  const snapshotsQuery = useOptimizerAccountSnapshots(
    brandId,
    adAccountId,
    (portfolio.level as PortfolioLevel) ?? 'adset',
  );
  const { setStatus, setStatuses, requestApplyItems, update } = useOptimizerMutations(
    brandId,
    adAccountId,
  );
  // A settings row writes one portfolio field, then records the decision on the row.
  // Both mutations already exist; this only pairs them for the row's own button.
  const settingsActions = React.useMemo<SettingsActions>(
    () => ({
      busy: update.isPending || setStatus.isPending,
      apply: async (rec, patch) => {
        await update.mutateAsync({
          portfolio_id: portfolio.id,
          patch: { [patch.field]: patch.to },
        });
        await setStatus.mutateAsync({
          recommendation_id: rec.id,
          status: 'applied',
        });
      },
      decide: (rec, status) => setStatus.mutate({ recommendation_id: rec.id, status }),
    }),
    [update, setStatus, portfolio.id],
  );
  const applyApproved = useApplyApproved();
  const applyAdsetStatus = useApplyAdsetStatus();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [approving, setApproving] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [routeFilters, setRouteFilters] = React.useState<Set<QueueRow['route']>>(new Set());
  const [executeNote, setExecuteNote] = React.useState<string | null>(null);
  const [failedAdsets, setFailedAdsets] = React.useState<Set<string>>(new Set());
  const [confirm, setConfirm] = React.useState<null | 'budget' | 'pause'>(null);

  const report = parseReport(performanceQuery.data);
  const cardActions = React.useMemo(() => cardActionsOf(platformCards), [platformCards]);
  // The recommendations still decided as rows: every one the cards above do not stand for.
  const queueRecs = React.useMemo(() => {
    const shownAsCards = new Set(platformCards.map(cardRecommendationId));
    const items = report?.latest_items ?? [];
    return (report?.recommendations ?? [])
      .filter((rec) => !shownAsCards.has(rec.id))
      .map((rec) => withHonestCapBinding(rec, items, optimizerText, uiLocale));
  }, [platformCards, report?.recommendations, report?.latest_items, optimizerText, uiLocale]);
  // A withdrawn cycle's moves, and a move whose ad set left this portfolio, are never queue
  // work: the budget rows come from the moves that still stand, so the rows agree with the
  // list read's pending_budget_moves. The story below still shows them, as history.
  const moves = useCurrentMoves(portfolio, brandId, adAccountId, report?.latest_items ?? []);
  const nameById = React.useMemo(
    () => new Map(enrolledQuery.data.map((row) => [row.adset_id, row.adset_name ?? ''])),
    [enrolledQuery.data],
  );
  const audienceProposalsQuery = useOptimizerAudienceProposals(brandId);
  // The recommendations the asked-for rows hand off to that the report does not carry any
  // more, rebuilt from the proposal each one opened. Empty unless the workspace named some.
  const carriedRecs = React.useMemo(() => {
    if (!askedRecommendationIds || askedRecommendationIds.length === 0) return [];
    const wanted = new Set(askedRecommendationIds);
    const listed = new Set((report?.recommendations ?? []).map((rec) => rec.id));
    const out: RecommendationRow[] = [];
    for (const proposal of audienceProposalsQuery.data) {
      const id = proposal.recommendation_id;
      if (!id || !wanted.has(id) || listed.has(id)) continue;
      const rec = carriedRecommendation(proposal, nameById.get(proposal.adset_id) ?? null);
      if (rec) out.push(rec);
    }
    return out;
  }, [askedRecommendationIds, audienceProposalsQuery.data, nameById, report?.recommendations]);
  const rows = React.useMemo(
    () =>
      buildActionQueue(
        report && {
          ...report,
          latest_items: moves.current,
          recommendations: queueRecs,
        },
        nameById,
        carriedRecs,
        (item) => itemWritable(portfolio, item),
        (rec) => pauseBlockedNote(rec, portfolio, moves.notes, uiText),
      ),
    [report, moves.current, moves.notes, nameById, carriedRecs, queueRecs, portfolio, uiText],
  );
  const proposalsOnly = proposalsOnlyNote(portfolio, moves.current, uiText);
  const moveRows = React.useMemo(() => buildMoveQueue(report), [report]);
  // A move is approved by writing it (BudgetMoveQueueRow's dry run → confirm); dismissing it is
  // the one decision recorded here.
  const [dismissingMove, setDismissingMove] = React.useState<string | null>(null);
  const dismissMove = (rec: RecommendationRow) => {
    setDismissingMove(rec.id);
    setStatus.mutate(
      { recommendation_id: rec.id, status: 'rejected' },
      { onSettled: () => setDismissingMove(null) },
    );
  };
  // A recommendation row's own Dismiss: the same rejected decision a move row records.
  const [dismissing, setDismissing] = React.useState<string | null>(null);
  const dismissRec = (row: RecQueueRow) => {
    setDismissing(row.key);
    setStatus.mutate(
      { recommendation_id: row.rec.id, status: 'rejected' },
      { onSettled: () => setDismissing(null) },
    );
  };
  // A CTA's row, in two steps. First, the moment the key arrives: clear whatever narrows the
  // list and open the row. Then — only once the row is actually in the queue and painted —
  // bring it into view and hand the key back. Consuming before the row exists (the queue may
  // still be reading) is how a press used to expand nothing: the key was cleared on a timer
  // while the list was still empty. The second step keys on a boolean, not on `rows`, so a
  // re-derived row list never re-runs the reset.
  React.useEffect(() => {
    if (!focusRowKey) return;
    setSearch('');
    setRouteFilters(new Set());
    setExpanded(focusRowKey);
  }, [focusRowKey]);
  const focusRowPresent =
    focusRowKey != null &&
    (rows.some((row) => row.key === focusRowKey) ||
      moveRows.some((row) => row.key === focusRowKey));
  // A key with no row for a while is a pressed button that did nothing, and silence there is
  // the dead end the read rows exist to close, wearing another hat. After the delay the queue
  // says so in words, and keeps saying it until the row arrives (a build's row lands with the
  // next fetch of the report) or the key is dropped.
  const [focusMissing, setFocusMissing] = React.useState(false);
  React.useEffect(() => {
    if (!focusRowKey || focusRowPresent) {
      setFocusMissing(false);
      return;
    }
    const timer = setTimeout(() => setFocusMissing(true), focusMissingDelayMs);
    return () => clearTimeout(timer);
  }, [focusRowKey, focusRowPresent, focusMissingDelayMs]);
  // The pin outlives the key on purpose: handing the key back re-runs this effect with null,
  // and a pin tied to the effect's cleanup died there — right after a first smooth scroll
  // that the still-loading panels above had already cancelled.
  const pinRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => pinRef.current?.(), []);
  React.useEffect(() => {
    if (!focusRowKey || !focusRowPresent) return;
    pinRef.current?.();
    pinRef.current = pinRowInView(focusRowKey);
    const frame = requestAnimationFrame(() => onFocusRowConsumed?.());
    return () => cancelAnimationFrame(frame);
  }, [focusRowKey, focusRowPresent, onFocusRowConsumed]);

  const runId = (report?.latest_run as { id?: string } | null)?.id ?? null;
  const asOf = asOfLine(
    (report?.latest_run as { cycle_ts?: string } | null)?.cycle_ts ?? null,
    portfolio.next_realloc_at ?? null,
    isStale(portfolio),
    optimizerText,
    uiLocale,
  );
  const unwell =
    staleLine(portfolio, uiText) !== null || rosterLine(portfolio, uiText, uiLocale) !== null;
  const summary = React.useMemo(
    () => queueSummary(queueRecs, optimizerText),
    [queueRecs, optimizerText],
  );
  // Observe hard-halts every Meta write; approving/executing is disabled and the reason shown.
  const writesBlocked = portfolio.apply_mode === 'observe';

  const visibleRows = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (routeFilters.size > 0 && !routeFilters.has(row.route)) return false;
      if (!term) return true;
      return rowSearchText(row).includes(term);
    });
  }, [rows, routeFilters, search]);

  const selectableVisible = visibleRows.filter(isSelectableRow);
  const rowByKey = React.useMemo(() => new Map(rows.map((row) => [row.key, row])), [rows]);

  // The search scopes everything under it, not the item rows alone: the budget moves are searched
  // the same way, and the blocks that describe the whole queue (the reallocation story, the
  // platform cards) step aside while a query narrows it — a query that matched nothing left them
  // on screen and shrank the list without a word (PP-DT-C-actions-search-leaves-budget-table-and-counts).
  const searchTerm = search.trim();
  const searching = searchTerm.length > 0;
  const visibleMoveRows = React.useMemo(() => {
    const term = searchTerm.toLowerCase();
    return term ? moveRows.filter((row) => moveSearchText(row).includes(term)) : moveRows;
  }, [moveRows, searchTerm]);
  const shownCount = visibleRows.length + visibleMoveRows.length;

  const approvedBudgetCount = rows.filter((row) => row.route === 'budget' && row.approved).length;
  const approvedPauseCount = rows.filter((row) => row.route === 'pause' && row.approved).length;

  // Attribution runs over the FULL allocation vector, not the queue rows: in autopilot only
  // the over-cap items are 'held' and the rest are filtered out of the queue, but the whole
  // vector is the only correct pro-rata denominator. So a held raise can legitimately read
  // "funded by Cold Lookalike" where Cold Lookalike is not itself in the queue.
  const attribution = React.useMemo(
    () => attributeTransfers(report?.latest_items ?? []),
    [report?.latest_items],
  );
  // Attribution knows only ad set IDs, so naming has to go through a map. cycle_items carry
  // the authoritative adset_name (the performance RPC's join) and the enrolled roster is the
  // fallback — same precedence resolveAdsetName documents, just flattened into one map.
  const transferNameById = React.useMemo(() => {
    const merged = new Map(nameById);
    for (const item of report?.latest_items ?? []) {
      const name = item.adset_name?.trim();
      if (name) merged.set(item.adset_id, name);
    }
    return merged;
  }, [nameById, report?.latest_items]);
  const counterpartyById = React.useMemo(
    () => buildCounterparties(attribution, transferNameById),
    [attribution, transferNameById],
  );
  const snapshotById = React.useMemo(
    () => new Map(snapshotsQuery.data.map((snapshot) => [snapshot.id, snapshot])),
    [snapshotsQuery.data],
  );
  const metric = localizeOptimizationMetricDefinition(
    getOptimizationMetricDefinition(portfolio.objective),
    optimizerText,
  );
  const targetDisplay =
    portfolio.cpa_target != null && portfolio.cpa_target > 0
      ? portfolio.cpa_target * metric.denominatorMultiplier
      : null;
  const hasBudgetRows = rows.some((row) => row.route === 'budget');

  // What the inline evidence chart draws from: the ad set's snapshot windows and its
  // cycle row (the CI on pause triggers), plus the scale the CI bars share.
  const itemById = React.useMemo(
    () => new Map((report?.latest_items ?? []).map((item) => [item.adset_id, item])),
    [report?.latest_items],
  );
  const maxCpa = React.useMemo(
    () => maxCiUpperBound(report?.latest_items ?? [], metric.denominatorMultiplier),
    [report?.latest_items, metric.denominatorMultiplier],
  );
  const swapJobsQuery = useOptimizerCreativeSwapJobs(brandId);
  const audiencesQuery = useOptimizerPortfolioAudiences(portfolio.id);
  const flash = useFlashCreativeMutations(brandId);
  const [generatingIds, setGeneratingIds] = React.useState<ReadonlySet<string>>(new Set());
  const [generateNotes, setGenerateNotes] = React.useState<ReadonlyMap<string, string>>(new Map());
  const [implementingKey, setImplementingKey] = React.useState<string | null>(null);
  // The portfolio names its own money: a Google portfolio listed beside the selected Meta account
  // is in its Google customer's currency, which only the portfolio carries (the customer's asset
  // row has none). Its own account's code is the fallback.
  const accountCurrency = useAdAccountCurrency(brandId, portfolio.ad_account_id ?? adAccountId);
  const currency = portfolioCurrency(portfolio, accountCurrency);
  const noteFor = React.useCallback((recId: string, note: string | null) => {
    setGenerateNotes((prev) => {
      const next = new Map(prev);
      if (note) next.set(recId, note);
      else next.delete(recId);
      return next;
    });
  }, []);
  const requestGeneration = React.useCallback(
    (rec: RecommendationRow, _name: string | null, _ads: readonly AdsetAd[]) => {
      setGeneratingIds((prev) => new Set(prev).add(rec.id));
      noteFor(rec.id, null);
      flash.generate
        .mutateAsync(rec.id)
        .catch((error: unknown) => {
          noteFor(rec.id, formatUiError(error));
        })
        .finally(() => {
          setGeneratingIds((prev) => {
            const next = new Set(prev);
            next.delete(rec.id);
            return next;
          });
          void swapJobsQuery.refetch();
        });
    },
    [flash.generate, noteFor, swapJobsQuery, formatUiError],
  );
  const implementCreative = React.useCallback(
    (
      job: CreativeSwapJobRow,
      assetId: string,
      target: ImplementTarget,
      manifest: CreativeOutputManifest,
    ) => {
      const key = `${job.id}:${assetId}`;
      setImplementingKey(key);
      const run = async () => {
        let predecessorAdId: string | null = job.ad_id ?? null;
        if (target.adsetId !== job.adset_id) {
          const ads = await fetchAdsetAds(brandId, adAccountId, target.adsetId);
          predecessorAdId = predecessorAdIn(ads)?.id ?? null;
          if (!predecessorAdId) {
            throw new LocalizedUiError(uiText('queueNoPredecessor', { name: target.name }));
          }
        }
        await flash.implement.mutateAsync({
          jobId: job.id,
          assetId,
          manifest,
          targetAdsetId: target.adsetId,
          predecessorAdId,
        });
      };
      run()
        .catch((error: unknown) => {
          noteFor(job.recommendation_id ?? job.id, formatUiError(error));
        })
        .finally(() => {
          setImplementingKey((current) => (current === key ? null : current));
          void swapJobsQuery.refetch();
        });
    },
    [adAccountId, brandId, flash.implement, noteFor, swapJobsQuery, formatUiError, uiText],
  );
  const retryCreative = React.useCallback(
    (job: CreativeSwapJobRow) => {
      flash.retry.mutate(job.id, {
        onError: (error) => noteFor(job.recommendation_id ?? job.id, formatUiError(error)),
      });
    },
    [flash.retry, noteFor, formatUiError],
  );
  const audienceCard = useAudienceCardActions(brandId, adAccountId, noteFor);
  const portfolioSpecs = React.useMemo(
    () =>
      portfolioSpecsFrom(
        snapshotsQuery.targeting,
        (adsetId) => snapshotById.get(adsetId)?.name ?? null,
      ),
    [snapshotsQuery.targeting, snapshotById],
  );
  const evidenceContext = React.useMemo<EvidenceContext>(
    () => ({
      snapshotById,
      itemById,
      kpiField: metric.kpiField,
      denominatorMultiplier: metric.denominatorMultiplier,
      maxCpa,
      brandId,
      adAccountId,
      swapJobs: swapJobsQuery.data,
      requestGeneration,
      generatingIds,
      generateNotes,
      implementCreative,
      retryCreative,
      implementingKey,
      audiences: audiencesQuery.data,
      portfolioSpecs,
      currency,
      resultWord: metric.resultLabel.toLowerCase(),
      audienceProposals: audienceProposalsQuery.data,
      audienceActions: audienceCard.actions,
      audienceBusy: audienceCard.busy,
      cboPreviewByCampaign: audienceCard.cboPreviewByCampaign,
    }),
    [
      snapshotById,
      itemById,
      metric.kpiField,
      metric.denominatorMultiplier,
      maxCpa,
      brandId,
      adAccountId,
      swapJobsQuery.data,
      requestGeneration,
      generatingIds,
      generateNotes,
      implementCreative,
      retryCreative,
      implementingKey,
      audiencesQuery.data,
      portfolioSpecs,
      currency,
      metric.resultLabel,
      audienceProposalsQuery.data,
      audienceCard,
    ],
  );

  const selectableBudgetRows = rows.filter((row) => row.route === 'budget' && isSelectableRow(row));
  const budgetGroupSelected =
    selectableBudgetRows.length > 0 && selectableBudgetRows.every((row) => selected.has(row.key));
  // What approving exactly the current selection does to total daily spend. Raw change_abs
  // sum — no filtering — because that is literally the question. Selecting a conserved set
  // reads flat; selecting only the raise reads +$15/day.
  const selectedBudgetRows = rows.filter(
    (row): row is BudgetQueueRow => row.route === 'budget' && selected.has(row.key),
  );
  const selectionNetDelta =
    selectedBudgetRows.length === 0
      ? null
      : selectedBudgetRows.reduce((sum, row) => sum + (row.item.change_abs ?? 0), 0);

  if (performanceQuery.isLoading) return <QueueTraySkeleton portfolio={portfolio} />;
  // A failed read used to fall through to rows.length === 0 and return null, so the whole
  // group disappeared from a queue that had just counted this portfolio as having work.
  // Name it instead — the count and the list must never disagree in silence.
  if (performanceQuery.isError) {
    return (
      <OptimizerReadError
        error={performanceQuery.error}
        onRetry={() => void performanceQuery.refetch()}
        subject={uiText('optimizerLoadSubject', {
          kind: 'actions',
          name: portfolio.name,
        })}
      />
    );
  }
  if (rows.length === 0 && moveRows.length === 0 && platformCards.length === 0) return null;

  const clearTransient = () => {
    setSelected(new Set());
    setApproving(new Set());
  };

  const runApprove = (keys: string[]) => {
    if (writesBlocked || keys.length === 0) return;
    const rowsToApprove = keys
      .map((key) => rowByKey.get(key))
      .filter((row): row is QueueRow => Boolean(row) && isSelectableRow(row as QueueRow));

    const budgetIds = rowsToApprove
      .filter((row): row is BudgetQueueRow => row.route === 'budget')
      .map((row) => row.adsetId);
    const pauseIds = rowsToApprove
      .filter((row): row is RecQueueRow => row.route === 'pause')
      .map((row) => row.rec.id);
    // Fatigue and creative approvals both open a tracked task server-side (the fan-out RPC
    // decides task-vs-generation-job from the portfolio's autogen config); the FE flips the
    // status the same way for both and lets the backend route.
    const taskRecs = rowsToApprove.filter(
      (row): row is RecQueueRow => row.route === 'fatigue' || row.route === 'creative',
    );

    setExecuteNote(null);
    setApproving(new Set(rowsToApprove.map((row) => row.key)));

    const onDone = () => setApproving(new Set());
    const onFail = (label: string) => (err: unknown) => {
      setApproving(new Set());
      setExecuteNote(formatUiError(err));
    };

    if (budgetIds.length > 0 && runId) {
      requestApplyItems.mutate(
        { run_id: runId, adset_ids: budgetIds },
        { onError: onFail('budget moves'), onSettled: onDone },
      );
    }
    if (pauseIds.length > 0) {
      setStatuses.mutate(
        { rec_ids: pauseIds, status: 'approved' },
        { onError: onFail('pauses'), onSettled: onDone },
      );
    }
    // Creative + fatigue approvals open a request one at a time — the single-rec path. Route
    // is left unset so the backend follows the portfolio's autogen config.
    for (const row of taskRecs) {
      setStatus.mutate(
        { recommendation_id: row.rec.id, status: 'approved' },
        { onError: onFail('creative requests'), onSettled: onDone },
      );
    }
    setSelected(new Set());
  };

  const applyBudgets = () => {
    setConfirm(null);
    setExecuteNote(null);
    setFailedAdsets(new Set());
    applyApproved.mutate(
      {
        portfolio_id: portfolio.id,
        brandId,
        accountId: adAccountId,
        run_id: runId ?? undefined,
        dryRun: false,
      },
      {
        onSuccess: (data) => {
          if (!data?.ok) {
            setExecuteNote(applyFailureNote(data?.reason, data?.error, 'budget moves', uiText));
            return;
          }
          recordFailures(data.results ?? [], setFailedAdsets);
          setExecuteNote(applySummary('Applied', data.applied, data.failed, data.deduped, uiText));
        },
        onError: (err) => setExecuteNote(formatUiError(err)),
      },
    );
  };

  const pauseAdsets = () => {
    setConfirm(null);
    setExecuteNote(null);
    setFailedAdsets(new Set());
    applyAdsetStatus.mutate(
      {
        portfolio_id: portfolio.id,
        brandId,
        accountId: adAccountId,
        dryRun: false,
      },
      {
        onSuccess: (data) => {
          if (!data?.ok) {
            setExecuteNote(applyFailureNote(data?.reason, data?.error, 'pauses', uiText));
            return;
          }
          recordFailures(data.results ?? [], setFailedAdsets);
          setExecuteNote(applySummary('Paused', data.applied, data.failed, data.deduped, uiText));
        },
        onError: (err) => setExecuteNote(formatUiError(err)),
      },
    );
  };

  const allSelected =
    selectableVisible.length > 0 && selectableVisible.every((row) => selected.has(row.key));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableVisible.map((row) => row.key)));
    }
  };

  const toggleBudgetGroup = () => {
    if (writesBlocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of selectableBudgetRows) {
        if (budgetGroupSelected) next.delete(row.key);
        else next.add(row.key);
      }
      return next;
    });
  };

  const toggleRow = (row: QueueRow) => {
    if (!isSelectableRow(row) || writesBlocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });
  };

  const busyApprove = requestApplyItems.isPending || setStatuses.isPending || setStatus.isPending;

  const waitingCount = queueWaitingCount(rows, moveRows, platformCards.length);
  const sentence = queueSentence(waitingCount, summary, currency, uiText, uiLocale);

  // The change preview (G12): the cycle's budget moves before → after, the guardrails they are
  // held to, and the one action their state allows, on the queue's own approve and apply paths.
  const budgetRows = rows.filter((row): row is BudgetQueueRow => row.route === 'budget');
  const writeState = budgetWriteState(
    budgetRows.map((row) => ({ key: row.key, approved: row.approved })),
  );
  const writeChecks = guardrailChecks({
    portfolio,
    moves: budgetRows.map((row) => row.item),
    currency,
  });

  return (
    <section className="@container space-y-3" data-testid="queue-tray">
      {/* The tray's one header line: whose queue, how much is waiting, how current it is. */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {headerLead}
            <h3 className="font-semibold text-base tracking-tight">{portfolio.name}</h3>
            <span className="font-mono font-semibold text-primary-ink text-sm tabular-nums">
              {waitingCount.toLocaleString(uiLocale)}
              <span className="sr-only"> {uiText('waiting_80cfa3e')}</span>
            </span>
          </div>
          {/* Is this queue current? One line, before anything in it is read. Every pending
              row belongs to the latest cycle (older ones are superseded server-side), so the
              cycle's time IS the queue's time. A queue whose portfolio missed a cycle, or
              whose roster left Meta, says so on the same line — quietly, in words. */}
          {asOf || unwell ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
              {asOf ? <span>{asOf}</span> : null}
              {unwell ? <QueueStaleness portfolio={portfolio} /> : null}
            </p>
          ) : null}
        </div>
        <Input
          aria-label={uiText('template_2ab418c2b5f6', { v0: portfolio.name })}
          className="h-8 w-full max-w-72 text-sm @lg:w-72"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={uiText('search_name_id_kind_reason_d96b57c')}
          value={search}
        />
      </header>

      {/* What is in the queue, by reason, biggest money first — one sentence a reader takes
          in before ten rows that each say "Pause ad set". */}
      {sentence ? (
        <p className="text-foreground text-sm leading-relaxed" data-testid="queue-summary">
          {sentence.map((part, index) =>
            part.figure ? (
              <span
                className="font-mono tabular-nums"
                // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed sentence, never reordered
                key={index}
                {...(part.figureKey ? figureProps(part.figureKey, part.raw ?? null, currency) : {})}
              >
                {part.text}
              </span>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed sentence, never reordered
              <React.Fragment key={index}>{part.text}</React.Fragment>
            ),
          )}
        </p>
      ) : null}

      {searching ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="queue-search-status"
          role="status"
        >
          {shownCount === 0
            ? betaUiText('beta_cb036ac158c4', { value0: String(searchTerm) })
            : `${shownCount} ${shownCount === 1 ? 'action matches' : 'actions match'} “${searchTerm}”.`}
        </p>
      ) : null}

      <QueueToolbar
        activeFilters={routeFilters}
        allSelected={allSelected}
        applyApprovedPending={applyApproved.isPending}
        applyBudgetCount={approvedBudgetCount}
        approvedPauseCount={approvedPauseCount}
        busyApprove={busyApprove}
        hasSelection={selected.size > 0}
        onApproveAll={() => runApprove(selectableVisible.map((row) => row.key))}
        onExecuteBudgets={() => setConfirm('budget')}
        onExecutePauses={() => setConfirm('pause')}
        onToggleFilter={(route) =>
          setRouteFilters((prev) => {
            const next = new Set(prev);
            if (next.has(route)) next.delete(route);
            else next.add(route);
            return next;
          })
        }
        onToggleSelectAll={toggleSelectAll}
        pausePending={applyAdsetStatus.isPending}
        selectableCount={selectableVisible.length}
        writesBlocked={writesBlocked}
      />

      {writesBlocked ? (
        <p className="text-warning text-xs">
          {applyModeExplainer(portfolio.apply_mode, undefined, optimizerText, uiLocale)}
        </p>
      ) : null}

      {proposalsOnly ? (
        <p className="text-muted-foreground text-xs" data-testid="queue-proposals-only">
          {proposalsOnly}
        </p>
      ) : null}

      {executeNote ? (
        <p className="text-muted-foreground text-xs" role="status">
          {executeNote}
        </p>
      ) : null}

      {!searching ? (
        <BudgetWritePreview
          autopilotRun={autopilotNextRun(portfolio, writeChecks)}
          blockedReason={writesBlocked ? 'Observe mode writes nothing.' : null}
          busy={busyApprove || applyApproved.isPending}
          checks={writeChecks}
          currency={currency}
          moves={budgetRows.map((row) => ({
            key: row.key,
            entityId: row.adsetId,
            name: row.name,
            before: row.item.current_budget,
            after: row.item.final_budget,
          }))}
          onApply={() => setConfirm('budget')}
          onApprove={runApprove}
          platforms={portfolioPlatforms(portfolio.platforms)}
          state={writeState}
          writesBlocked={writesBlocked}
        />
      ) : null}

      {/* Why the money is moving, before the list of moves: every ad set's cost per result
          against the target beside its budget going from now to proposed. */}
      {!searching && (hasBudgetRows || moves.line || moves.notes.size > 0) && report ? (
        <ReallocationStory
          className="border-border/60 border-t pt-3"
          currency={currency}
          defaultLookback={defaultStoryLookback(portfolio.lookback_window)}
          items={report.latest_items}
          metric={metric}
          nameById={transferNameById}
          snapshotById={snapshotById}
          target={targetDisplay}
          withdrawn={moves.line}
          withdrawnNotes={moves.notes}
        />
      ) : null}

      {focusMissing ? (
        <p className="text-foreground text-sm" data-testid="queue-focus-missing" role="status">
          {uiText('the_row_that_button_points_at_isn_t_in_the_qu_41161a5')}
        </p>
      ) : null}
      {/* Cross-platform moves lead the queue: the biggest decision, and the one a person
          should take even when autopilot could (decision 18). */}
      {visibleMoveRows.length > 0 ? (
        <ul
          className="divide-y divide-border/60 border-border/60 border-t"
          data-testid="budget-move-queue"
        >
          {visibleMoveRows.map(({ key, rec, move }) => (
            <BudgetMoveQueueRow
              busy={dismissingMove === rec.id}
              key={key}
              move={move}
              onApplied={() =>
                setStatus.mutate({
                  recommendation_id: rec.id,
                  status: 'approved',
                })
              }
              onDismiss={() => dismissMove(rec)}
              portfolioId={portfolio.id}
              rec={rec}
              writesBlocked={writesBlocked}
              writesOffNote={moveWritesOffNote(portfolio, move, uiText)}
            />
          ))}
        </ul>
      ) : null}
      {!searching && platformCards.length > 0 ? (
        <div data-testid="queue-platform-cards">
          <AccountRead
            candidates={[...platformCards]}
            cardActions={cardActions}
            currency={currency}
            dailySpend={portfolioPlanPerDay(portfolio)}
            portfolioNames={NO_PORTFOLIO_NAMES}
          />
        </div>
      ) : null}
      <ul className="divide-y divide-border/60 border-border/60 border-y" data-testid="queue-rows">
        {visibleRows.map((row, index) => (
          <React.Fragment key={row.key}>
            {/* The budget rows already sort into one contiguous block (queueRank gives them
                all 10, and Array.sort is stable), so the header goes in front of the first
                one rather than restructuring the queue. Gated on there being a real transfer
                to describe — a cycle that only raises has no donor and nothing to group. */}
            {attribution.transfers.length > 0 &&
            row.route === 'budget' &&
            visibleRows[index - 1]?.route !== 'budget' ? (
              <BudgetTransferHeader
                allSelected={budgetGroupSelected}
                attribution={attribution}
                currency={currency}
                mode={report?.latest_run?.mode ?? null}
                nameById={transferNameById}
                onToggleGroup={toggleBudgetGroup}
                writesBlocked={writesBlocked}
              />
            ) : null}
            <QueueRowView
              approving={approving.has(row.key)}
              brandId={brandId}
              busyDecision={busyApprove || dismissing === row.key}
              counterparty={
                row.route === 'budget' ? (counterpartyById.get(row.adsetId) ?? null) : null
              }
              currency={currency}
              evidence={evidenceContext}
              expanded={expanded === row.key}
              failed={failedAdsets.has(row.adsetId)}
              onApprove={() => runApprove([row.key])}
              onDismiss={row.route === 'budget' ? undefined : () => dismissRec(row)}
              onToggleExpand={() => setExpanded(expanded === row.key ? null : row.key)}
              onToggleSelect={() => toggleRow(row)}
              row={row}
              selected={selected.has(row.key)}
              settingsActions={settingsActions}
              timeZone={snapshotsQuery.timezone}
              writesBlocked={writesBlocked}
            />
          </React.Fragment>
        ))}
      </ul>

      {/* The selection's decision, pinned to the bottom of the panel while something is
          selected — the one dark surface on the tray, because it is the one that writes. */}
      {selected.size > 0 ? (
        <SelectionBar
          busy={busyApprove}
          currency={currency}
          onApproveAll={() => runApprove(selectableVisible.map((row) => row.key))}
          onApproveSelected={() => runApprove([...selected])}
          selectableCount={selectableVisible.length}
          selectedCount={selected.size}
          selectionNetDelta={selectionNetDelta}
          writesBlocked={writesBlocked}
        />
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'pause'
                ? uiText('template_4efde4ae716c', { count: approvedPauseCount })
                : uiText('template_bffe6fcb5212', {
                    count: approvedBudgetCount,
                  })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'pause'
                ? uiText('pausing_stops_these_ad_sets_from_spending_imm_ecaa4d0')
                : uiText('this_writes_the_approved_daily_budgets_to_met_af9b0e7')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm === 'pause' ? pauseAdsets : applyBudgets}>
              {confirm === 'pause'
                ? uiText('pause_ad_sets_fd742e8')
                : uiText('apply_budget_moves_0402dd0')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PortfolioRecentActions
        brandId={brandId}
        currency={currency}
        entityNames={transferNameById}
        portfolioId={portfolio.id}
      />

      {/* Nothing above clears selection on refetch — a mutation's invalidate rebuilds the rows,
          and a stale key would silently point at nothing. */}
      <SelectionSweeper
        keys={rows.map((row) => row.key)}
        selected={selected}
        onSweep={clearTransient}
      />
    </section>
  );
}

/** How many recent ad-account writes this portfolio shows inline. Enough to undo the move
 *  you just made without leaving the queue; the whole trail is in Activity → Actions. */
const RECENT_ACTION_LIMIT = 5;

/**
 * The undo strip: this portfolio's most recent ad-account writes, each with one-click revert.
 *
 * Approving a change and undoing it used to live in two different places — the queue applied,
 * and the confirm dialog told you to go find the activity log if you changed your mind. The
 * write and its undo belong to the same moment, so the writes land here, under the queue that
 * made them.
 *
 * Eligibility is the RPC's `reversible`, never a guess from the row's shape: TRUE only for a
 * write that recorded a real prior value to restore. A row already undone says so instead of
 * offering the button twice. Settings and decisions are excluded outright — undoing a config
 * change is not one write against Meta, and a button that pretends otherwise is how one click
 * becomes an outage.
 */
function PortfolioRecentActions({
  brandId,
  portfolioId,
  currency,
  entityNames,
}: {
  brandId: string;
  portfolioId: string;
  currency: string | null;
  /** Ad-set id → name, so a recent write names what it touched instead of printing its id. */
  entityNames: ReadonlyMap<string, string>;
}) {
  const uiText = useTranslations('scale');
  const actionsQuery = useOptimizerActions(brandId);
  // A failed or empty action read must not push an error into the queue — the queue's own work
  // is unaffected by it. The full feed reports its own outage in Activity → Actions.
  // Grouped before the cut, so a move's legs never split across the limit.
  const recent = groupActionFeed(
    actionsQuery.data.filter((row) => row.portfolio_id === portfolioId && row.family === 'money'),
  ).slice(0, RECENT_ACTION_LIMIT);

  if (recent.length === 0) return null;

  return (
    <div className="space-y-1 pt-2">
      <p className={`${typeScale.label} font-semibold text-muted-foreground`}>
        {uiText('recently_applied_3dd70a2')}
      </p>
      <ul className="divide-y divide-border/60">
        {recent.map((item) =>
          item.kind === 'move' ? (
            <MoveDecisionCard
              className="space-y-2 rounded-none border-0 bg-transparent px-0 py-3"
              currency={currency}
              key={item.key}
              move={item.move}
            />
          ) : (
            <AppliedWriteRow
              brandId={brandId}
              currency={currency}
              entityNames={entityNames}
              key={item.row.id}
              row={item.row}
            />
          ),
        )}
      </ul>
    </div>
  );
}

/** After a refetch rebuilds the queue, drop any selection/approving key that no longer maps to
 *  a row so a completed approve never leaves a phantom selection behind. */
function SelectionSweeper({
  keys,
  selected,
  onSweep,
}: {
  keys: string[];
  selected: Set<string>;
  onSweep: () => void;
}) {
  const keySet = React.useMemo(() => new Set(keys), [keys]);
  React.useEffect(() => {
    for (const key of selected) {
      if (!keySet.has(key)) {
        onSweep();
        return;
      }
    }
  }, [keySet, selected, onSweep]);
  return null;
}

/** A budget move as the search reads it: what it is, and the names and ids on its legs. */
function moveSearchText(row: MoveQueueRow): string {
  return [row.rec.kind, row.rec.reason ?? '', 'budget move', JSON.stringify(row.move)]
    .join(' ')
    .toLowerCase();
}

function rowSearchText(row: QueueRow): string {
  const parts = [row.name ?? '', row.adsetId, row.route];
  if (row.route === 'budget') {
    parts.push('budget', 'reallocation');
  } else {
    parts.push(row.rec.kind, row.rec.reason ?? '', row.rec.severity ?? '', row.rec.trigger);
  }
  return parts.join(' ').toLowerCase();
}

function applySummary(
  verb: string,
  applied?: number,
  failed?: number,
  deduped?: number,
  uiTranslate?: ScaleCopy,
): string {
  if (uiTranslate)
    return uiTranslate('queueApplyResult', {
      verb: verb === 'Paused' ? 'pause' : 'apply',
      applied: applied ?? 0,
      failed: failed ?? 0,
      deduped: deduped ?? 0,
      hasFailed: failed ? 'yes' : 'no',
      hasDeduped: deduped ? 'yes' : 'no',
      already: 'done',
    });
  return (
    `${verb} ${applied ?? 0}` +
    (failed ? ` · ${failed} failed` : '') +
    (deduped ? ` · ${deduped} already done` : '')
  );
}

function applyFailureNote(
  reason: string | undefined,
  error: string | undefined,
  label: string,
  uiTranslate?: ScaleCopy,
): string {
  if (reason === 'observe_mode')
    return uiTranslate
      ? uiTranslate('observe_mode_blocks_meta_writes_1a47680')
      : 'Observe mode blocks Meta writes.';
  if (uiTranslate)
    return reason === 'stale_run' ? uiTranslate('queueNewCycle') : uiTranslate('queueApplyFailed');
  return error?.trim() || reason || `Applying ${label} failed.`;
}

function recordFailures(
  results: { adsetId: string; ok: boolean }[],
  set: React.Dispatch<React.SetStateAction<Set<string>>>,
): void {
  const failed = results.filter((result) => !result.ok).map((result) => result.adsetId);
  if (failed.length > 0) set(new Set(failed));
}

/** One run of the queue's summary sentence: words, or a figure printed in mono. A figure that
 *  is money carries its provenance key so the figure oracle can trace it. */
export type QueueSentencePart = {
  text: string;
  figure?: boolean;
  figureKey?: string;
  raw?: number;
};

/**
 * The queue in one sentence, biggest money first:
 *   "9 waiting on a decision: 3 refresh creative (creative fatigue), 224 MXN/day at stake;
 *    4 not being delivered (paused or removed on Meta)."
 * Null when nothing waits. A queue with a single reason says only how many wait — the rows
 * below already name that reason, and a sentence repeating it is the pill row it replaces.
 */
export function queueSentence(
  waiting: number,
  groups: readonly QueueSummaryGroup[],
  currency: string | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): QueueSentencePart[] | null {
  if (waiting <= 0) return null;
  if (uiTranslate) {
    let prefix = '\uFFF0queue';
    const source = groups.map((group) => group.label).join(' ');
    while (source.includes(prefix)) prefix += '_';
    const slots = new Map<string, QueueSentencePart>();
    const slot = (part: QueueSentencePart) => {
      const marker = `${prefix}${slots.size}\uFFF1`;
      slots.set(marker, part);
      return marker;
    };
    const details =
      groups.length <= 1
        ? ''
        : groups
            .map((group) =>
              uiTranslate('queueSentenceGroup', {
                count: slot({
                  text: group.count.toLocaleString(uiLocale),
                  figure: true,
                }),
                label: group.label.toLocaleLowerCase(uiLocale),
                reason: triggerReason(group.trigger, createOptimizerDisplayTranslate(uiTranslate)),
                hasImpact: group.impactPerDay > 0 ? 'yes' : 'no',
                impact:
                  group.impactPerDay > 0
                    ? slot({
                        text: uiTranslate('helper_34dd8b60efe4', {
                          v0: formatCurrency(group.impactPerDay, currency, uiLocale),
                        }),
                        figure: true,
                        figureKey: `queue.summary.${group.kind}:${group.trigger}.impact`,
                        raw: group.impactPerDay,
                      })
                    : '',
              }),
            )
            .join('; ');
    const message = uiTranslate('queueSentence', {
      count: slot({ text: waiting.toLocaleString(uiLocale), figure: true }),
      hasGroups: groups.length > 1 ? 'yes' : 'no',
      details,
    });
    return message
      .split(new RegExp(`(${prefix}\\d+\uFFF1)`, 'g'))
      .filter(Boolean)
      .map((text) => slots.get(text) ?? { text });
  }

  const parts: QueueSentencePart[] = [
    { text: String(waiting), figure: true },
    { text: ' waiting on a decision' },
  ];
  if (groups.length <= 1) {
    parts.push({ text: '.' });
    return parts;
  }
  parts.push({ text: ': ' });
  groups.forEach((group, index) => {
    if (index > 0) parts.push({ text: '; ' });
    parts.push({ text: String(group.count), figure: true });
    parts.push({
      text: ` ${group.label.toLowerCase()} (${triggerReason(group.trigger)})`,
    });
    if (group.impactPerDay > 0) {
      parts.push({ text: ', ' });
      parts.push({
        text: `${formatCurrency(group.impactPerDay, currency, uiLocale)}/day`,
        figure: true,
        figureKey: `queue.summary.${group.kind}:${group.trigger}.impact`,
        raw: group.impactPerDay,
      });
      parts.push({ text: ' at stake' });
    }
  });
  parts.push({ text: '.' });
  return parts;
}

/**
 * The structured line under a recommendation row's title, in words a person reads.
 *
 * The trigger's own headline leads when it declared one — the same figure, in the same words,
 * that the account card prints. A delivery finding is said as what it is ("Not active since
 * Oct 9 · 1 day"): its raw evidence is engine vocabulary — metric `days_absent`, a comparator
 * carrying an ISO date — and printing it verbatim put "days_absent 1 not ACTIVE on Meta since
 * 2026-10-09" in front of the user. Everything else falls back to the shared evidence line.
 */
export function recRowLine(
  rec: RecommendationRow,
  currency: string | null,
  now: Date = new Date(),
  timeZone?: string,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string | null {
  const headline = queueHeadlineLine(rec, currency, uiLocale);
  if (headline) return headline;
  const evidence = rec.evidence;
  if (evidence?.metric === 'days_absent') {
    // The count is today's distance from the day the row names, not the engine's figure frozen
    // at cycle time — that one floored a mid-day timestamp against the cycle's midnight and
    // printed "-1 days" (see recQueueModel.daysSince). The engine's structured day when the row
    // carries it; the comparator's date only on rows written before it did.
    const since =
      evidence.missingSinceDay ?? /(\d{4}-\d{2}-\d{2})/.exec(evidence.comparator)?.[1] ?? null;
    const sinceAt = since ? Date.parse(`${since}T12:00:00Z`) : Number.NaN;
    const days = Number.isNaN(sinceAt)
      ? Math.max(0, Math.round(evidence.value))
      : (daysSince(since as string, now, timeZone) ?? Math.max(0, Math.round(evidence.value)));
    if (uiTranslate)
      return uiTranslate('queueInactive', {
        hasDate: Number.isNaN(sinceAt) ? 'no' : 'yes',
        date: Number.isNaN(sinceAt)
          ? ''
          : new Intl.DateTimeFormat(uiLocale, {
              month: 'short',
              day: 'numeric',
              timeZone,
            }).format(new Date(sinceAt)),
        days,
      });
    const span = `${days} day${days === 1 ? '' : 's'}`;
    return Number.isNaN(sinceAt)
      ? `Not active for ${span}`
      : `Not active since ${SINCE_DAY.format(new Date(sinceAt))} · ${span}`;
  }
  return evidenceLine(
    evidence,
    currency,
    uiTranslate ? createOptimizerDisplayTranslate(uiTranslate) : undefined,
    uiLocale,
  );
}

const SINCE_DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const STALE_HINT =
  'The scheduler keeps claiming this portfolio, but no cycle has landed on it in at least two intervals.';
const ROSTER_HINT = 'These enrolled ad sets are no longer on Meta, so no cycle can score them.';

/** The staleness of the queue, said quietly on the as-of line: a coloured dot and the words. */
function QueueStaleness({ portfolio }: { portfolio: PortfolioListItem }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const stale = staleLine(portfolio, uiText);
  const roster = rosterLine(portfolio, uiText, uiLocale);
  const tone = rosterTone(portfolio);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2" data-testid="queue-staleness">
      {stale ? (
        <span className="inline-flex items-center gap-1.5" title={uiText('portfolioStaleHint')}>
          <span aria-hidden className="size-1.5 rounded-full bg-warning" />
          <span data-testid="stale-chip">{stale}</span>
        </span>
      ) : null}
      {roster && tone ? (
        <span className="inline-flex items-center gap-1.5" title={uiText('portfolioRosterHint')}>
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              tone === 'danger' ? 'bg-destructive' : 'bg-warning',
            )}
          />
          <span data-testid="roster-chip">{roster}</span>
        </span>
      ) : null}
    </span>
  );
}

/** The filter line: select-all, the kinds as quiet segmented text, and — on the right — the
 *  execute steps an approval leads to. "Approve all" sits here only while nothing is selected;
 *  once something is, the selection bar carries both approvals. */
function QueueToolbar({
  activeFilters,
  allSelected,
  applyApprovedPending,
  applyBudgetCount,
  approvedPauseCount,
  busyApprove,
  hasSelection,
  onApproveAll,
  onExecuteBudgets,
  onExecutePauses,
  onToggleFilter,
  onToggleSelectAll,
  pausePending,
  selectableCount,
  writesBlocked,
}: {
  activeFilters: Set<QueueRow['route']>;
  allSelected: boolean;
  applyApprovedPending: boolean;
  applyBudgetCount: number;
  approvedPauseCount: number;
  busyApprove: boolean;
  hasSelection: boolean;
  onApproveAll: () => void;
  onExecuteBudgets: () => void;
  onExecutePauses: () => void;
  onToggleFilter: (route: QueueRow['route']) => void;
  onToggleSelectAll: () => void;
  pausePending: boolean;
  selectableCount: number;
  writesBlocked: boolean;
}) {
  const uiText = useTranslations('scale');
  const ROUTE_FILTERS: { route: QueueRow['route']; label: string }[] = useMemo(
    () => [
      { route: 'budget', label: uiText('budget_1c6225e') },
      { route: 'pause', label: uiText('pause_858e4ba') },
      { route: 'creative', label: uiText('creative_2c7e633') },
      { route: 'fatigue', label: 'Fatigue' },
      { route: 'settings', label: uiText('settings_74a883a') },
      { route: 'hidden', label: 'Ad-level' },
    ],
    [uiText],
  );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="flex items-center gap-2 text-muted-foreground text-xs">
        {uiText.rich('sentence_f385f63ccfcc', {
          v0: () => (
            <Checkbox
              aria-label={uiText('select_all_actionable_0392d22')}
              checked={allSelected}
              disabled={writesBlocked || selectableCount === 0}
              onCheckedChange={onToggleSelectAll}
            />
          ),
        })}
      </span>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ROUTE_FILTERS.map((option) => (
          <button
            key={option.route}
            aria-pressed={activeFilters.has(option.route)}
            className={cn(
              'hit-area text-xs transition-colors',
              activeFilters.has(option.route)
                ? 'font-semibold text-foreground underline decoration-2 underline-offset-[6px]'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onToggleFilter(option.route)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {hasSelection ? null : (
          <Button
            className="h-8 px-3 text-xs"
            disabled={writesBlocked || selectableCount === 0 || busyApprove}
            onClick={onApproveAll}
            size="sm"
            type="button"
            variant="ghost"
          >
            {uiText('approve_all_ae067b6')}
          </Button>
        )}
        {applyBudgetCount > 0 ? (
          <Button
            className="h-8 px-4 text-sm"
            disabled={writesBlocked || applyApprovedPending}
            onClick={onExecuteBudgets}
            size="sm"
            type="button"
          >
            {uiText.rich('sentence_80045f771fa9', {
              icon: () =>
                applyApprovedPending ? (
                  <Loader2Icon className="mr-1 size-3.5 animate-spin" />
                ) : null,
              count: applyBudgetCount,
            })}
          </Button>
        ) : null}
        {approvedPauseCount > 0 ? (
          <Button
            className="h-8 px-4 text-sm"
            disabled={writesBlocked || pausePending}
            onClick={onExecutePauses}
            size="sm"
            type="button"
            variant="destructive"
          >
            {uiText.rich('sentence_78447c88868c', {
              icon: () =>
                pausePending ? <Loader2Icon className="mr-1 size-3.5 animate-spin" /> : null,
              count: approvedPauseCount,
            })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** The dark bar that holds the selection's decision, pinned to the bottom of the scrolling
 *  panel. A cycle's budget moves are conserved as a set, so approving a strict subset moves
 *  total spend: the bar sums the selection and says by how much rather than warning
 *  abstractly. */
function SelectionBar({
  busy,
  currency,
  onApproveAll,
  onApproveSelected,
  selectableCount,
  selectedCount,
  selectionNetDelta,
  writesBlocked,
}: {
  busy: boolean;
  currency: string | null;
  onApproveAll: () => void;
  onApproveSelected: () => void;
  selectableCount: number;
  selectedCount: number;
  /** Net daily-spend change if the current selection is approved. null when none is. */
  selectionNetDelta: number | null;
  writesBlocked: boolean;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  return (
    <div
      className="sticky bottom-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-foreground px-4 py-2.5 text-background shadow-lg"
      data-testid="queue-selection-bar"
    >
      <span className="font-medium text-sm">
        {uiText.rich('sentence_bea8277e1ceb', {
          v0: () => <span className="font-mono tabular-nums">{selectedCount}</span>,
        })}
      </span>
      {selectionNetDelta == null ? null : Math.abs(selectionNetDelta) < 0.5 ? (
        <span className="text-background/70 text-xs">{uiText('spend_stays_flat_2138646')}</span>
      ) : (
        <span className="text-background/70 text-xs tabular-nums">
          {uiText.rich('sentence_1682e9cb3c3b', {
            v0: selectionNetDelta > 0 ? '+' : '−',
            v1: () => (
              <span
                className="font-mono"
                {...figureProps('queue.net', Math.abs(selectionNetDelta), currency)}
              >
                {formatCurrency(Math.abs(selectionNetDelta), currency, uiLocale)}
              </span>
            ),
          })}
        </span>
      )}
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          className="h-8 px-3 text-background text-xs hover:bg-background/10 hover:text-background"
          disabled={writesBlocked || selectableCount === 0 || busy}
          onClick={onApproveAll}
          size="sm"
          type="button"
          variant="ghost"
        >
          {uiText.rich('sentence_4e928b1bbe82', {
            v0: () => <span className="font-mono tabular-nums">{selectableCount}</span>,
          })}
        </Button>
        <Button
          className="h-8 px-4 text-sm"
          disabled={writesBlocked || busy}
          onClick={onApproveSelected}
          size="sm"
          type="button"
        >
          {uiText.rich('sentence_cb3c36af49d5', {
            v0: () => (busy ? <Loader2Icon className="mr-1 size-3.5 animate-spin" /> : null),
          })}
        </Button>
      </span>
    </div>
  );
}

/** The one decision the solver actually made, said once above the rows it produced.
 *
 *  Nothing pairwise is stored: the engine emits a complete allocation vector where every
 *  raise is already paid for by the cuts. Rendering that as N independent rows was the bug —
 *  an operator could not see that taking $15 off one ad set is what funds the other. The rows
 *  stay individually selectable, because approving a subset is legitimate; the header just
 *  makes the coupling visible, and the selection bar says what a partial approval costs. */
function BudgetTransferHeader({
  attribution,
  nameById,
  currency,
  mode,
  allSelected,
  onToggleGroup,
  writesBlocked,
}: {
  attribution: TransferAttribution;
  nameById?: Map<string, string> | null;
  currency: string | null;
  mode: string | null;
  allSelected: boolean;
  onToggleGroup: () => void;
  writesBlocked: boolean;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const { donors, recipients, moved, net } = attribution;
  const name = (id: string) => resolveAdsetName({ adset_id: id }, nameById) ?? id;
  const pair = donors.length === 1 && recipients.length === 1;

  // net is ground truth for the items actually shown; mode only words the exception.
  const conservation = uiText('queueBudgetConservation', {
    state: Math.abs(net) < 1 ? 'unchanged' : mode === 'scale' ? 'growth' : 'other',
    sign: net > 0 ? '+' : '−',
    amount: formatCurrency(Math.abs(net), currency, uiLocale),
  });

  return (
    <li className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 py-3">
      <Checkbox
        aria-label={uiText('select_all_budget_moves_in_this_cycle_b2c727b')}
        checked={allSelected}
        className="mt-0.5"
        disabled={writesBlocked}
        onCheckedChange={onToggleGroup}
      />
      <div className="min-w-0">
        <p className="font-semibold text-sm tracking-tight">
          {pair ? (
            <>
              {uiText.rich('sentence_024f5f35c874', {
                v0: () => (
                  <span className="font-mono tabular-nums">
                    {uiText.rich('sentence_72ced7255fc0', {
                      v0: formatCurrency(moved, currency, uiLocale),
                    })}
                  </span>
                ),
                v1: name(donors[0].adsetId),
                v2: name(recipients[0].adsetId),
              })}
            </>
          ) : (
            <>
              {uiText.rich('sentence_308970bc833a', {
                amount: () => (
                  <span className="font-mono tabular-nums">
                    {uiText.rich('sentence_72ced7255fc0', {
                      v0: formatCurrency(moved, currency, uiLocale),
                    })}
                  </span>
                ),
                donors: donors.length,
                recipients: recipients.length,
              })}
            </>
          )}
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {uiText.rich('sentence_12dfd5f13a68', { v0: conservation })}
        </p>
      </div>
    </li>
  );
}

/** "← from Cold Lookalike $15" on a raised ad set, "→ to Retarget 30d $15" on a cut one. */
function CounterpartyLine({
  entry,
  currency,
  limit,
}: {
  entry: { direction: 'funds' | 'fundedBy'; parties: Counterparty[] };
  currency: string | null;
  limit: number;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const shown = entry.parties.slice(0, limit);
  const rest = entry.parties.length - shown.length;
  if (shown.length === 0) return null;
  return (
    <span className="text-muted-foreground text-xs">
      {entry.direction === 'funds' ? uiText('funds_28c635e') : uiText('funded_by_83f05c7')}
      {shown
        .map(
          (party) =>
            `${party.name ?? party.adsetId} ${formatCurrency(party.amount, currency, uiLocale)}`,
        )
        .join(' · ')}
      {rest > 0 ? uiText('template_5bea7822d675', { v0: rest }) : ''}
    </span>
  );
}

/** The kind tag a queue row leads with — the colour, not a glyph, says what kind it is. */
function rowKindTag(
  row: QueueRow,
  t: ReturnType<typeof useTranslations<'scale'>>,
): { tone: KindTone; word: string } {
  if (row.route === 'budget')
    return { tone: 'budget', word: t('actionKindTag', { tone: 'budget' }) };
  return { tone: kindTone(row.rec.kind), word: kindWord(row.rec.kind, t) };
}

/**
 * One queue row: ONE hairline line — checkbox · title (with before → after in mono) and its
 * why · the impact on the right · Approve / Dismiss — and its detail under it when opened.
 * The ad set's NAME is the subject; its raw id rides on hover, never as a line of its own.
 */
function QueueRowView({
  row,
  brandId,
  currency,
  selected,
  approving,
  failed,
  expanded,
  writesBlocked,
  busyDecision,
  counterparty,
  onToggleSelect,
  onToggleExpand,
  onApprove,
  onDismiss,
  settingsActions,
  evidence,
  timeZone,
}: {
  row: QueueRow;
  brandId: string;
  currency: string | null;
  selected: boolean;
  approving: boolean;
  failed: boolean;
  expanded: boolean;
  writesBlocked: boolean;
  /** A decision on this row (or a batch it is in) is in flight. */
  busyDecision: boolean;
  counterparty?: {
    direction: 'funds' | 'fundedBy';
    parties: Counterparty[];
  } | null;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onApprove: () => void;
  /** Absent on a budget move, which is decided as part of its cycle, never rejected alone. */
  onDismiss?: () => void;
  settingsActions: SettingsActions;
  evidence: EvidenceContext;
  /** The Meta ad account's IANA zone (the snapshot read's): the day a delivery row counts to. */
  timeZone: string | null;
}) {
  const uiText = useTranslations('scale');
  const selectable = isSelectableRow(row);
  const hidden = row.route === 'hidden';
  const tag = rowKindTag(row, uiText);
  // Dismiss is a decision on a still-pending recommendation; a settings row decides in its
  // detail, an ad-level row cannot be acted on, and an approved row is past deciding.
  const dismissable =
    onDismiss !== undefined &&
    row.route !== 'budget' &&
    row.route !== 'settings' &&
    !hidden &&
    row.rec.status === 'pending';

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the whole-row click is a pointer convenience; the accessible, keyboard-operable selection control is the Checkbox inside. Making the <li> a role=button would nest interactive controls (checkbox, expander, hover card).
    <li
      className={cn(
        'scroll-mt-2 py-3 transition-colors',
        selected && 'bg-primary/5',
        selectable && !writesBlocked && 'cursor-pointer hover:bg-muted/30',
      )}
      data-row-key={row.key}
      onClick={selectable ? onToggleSelect : undefined}
    >
      <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 @2xl:grid-cols-[1rem_minmax(0,1fr)_10rem_auto]">
        {hidden ? (
          <AdLevelDangerIcon />
        ) : (
          <Checkbox
            aria-label={selectionLabel(row, uiText)}
            checked={selected}
            className="mt-0.5"
            disabled={!selectable || writesBlocked}
            onCheckedChange={onToggleSelect}
            onClick={(event) => event.stopPropagation()}
          />
        )}

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <KindTag tone={tag.tone}>{tag.word}</KindTag>
            <RowHeadline brandId={brandId} currency={currency} row={row} />
            {row.approved ? (
              <span className="text-muted-foreground text-xs">{uiText('approved_87b42e4')}</span>
            ) : null}
            {approving ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                <Loader2Icon className="size-3 animate-spin" />
                {uiText('approving_8b64d4c')}
              </span>
            ) : null}
            {failed ? (
              <span className="font-medium text-destructive text-xs">
                {uiText('failed_031a8f0')}
              </span>
            ) : null}
          </div>
          {row.route === 'budget' ? (
            <>
              {row.item.reason ? (
                <p
                  className="mt-0.5 line-clamp-2 text-muted-foreground text-xs"
                  title={row.item.reason}
                >
                  {uiText.rich('sentence_b8fcef5f90e9', {
                    v0: row.item.reason,
                  })}
                </p>
              ) : null}
              {counterparty ? (
                <p className="mt-0.5">
                  <CounterpartyLine currency={currency} entry={counterparty} limit={1} />
                </p>
              ) : null}
            </>
          ) : (
            <RecWhy currency={currency} rec={row.rec} timeZone={timeZone} />
          )}
        </div>

        {/* Narrow: impact and actions share a second line under the title. Wide: the wrapper
            dissolves and they take the row's two right-hand columns. */}
        <div className="col-start-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 @2xl:contents">
          <div className="@2xl:text-right">
            <RowImpact currency={currency} row={row} />
          </div>

          {/* Under a coarse pointer each control's hit area is 44px: the px gap (and the taller
              buttons and chevron) keep the chevron's from reaching Approve's drawn edge, so a
              press meant for one never lands on the other. Desktop keeps the tight row. */}
          <div className="flex items-center justify-end gap-1 pointer-coarse:gap-[12px]">
            {dismissable ? (
              <Button
                aria-label={uiText('template_351bf5051aac', {
                  v0: selectionLabel(row, uiText).replace(/^Select /, ''),
                })}
                className="h-7 px-2.5 text-xs pointer-coarse:h-8"
                disabled={writesBlocked || busyDecision}
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss?.();
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                {uiText('dismiss_48845bf')}
              </Button>
            ) : null}
            {row.route !== 'budget' && row.blocked ? (
              <span
                className="max-w-56 text-muted-foreground text-xs"
                data-testid="queue-row-blocked"
              >
                {row.blocked}
              </span>
            ) : null}
            {selectable ? (
              <Button
                aria-label={uiText('template_d4c60449ac4f', {
                  v0: selectionLabel(row, uiText).replace(/^Select /, ''),
                })}
                className="h-7 px-3 text-xs pointer-coarse:h-8"
                disabled={writesBlocked || busyDecision}
                onClick={(event) => {
                  event.stopPropagation();
                  onApprove();
                }}
                size="sm"
                type="button"
                variant="default"
              >
                {uiText('approve_6007acb')}
              </Button>
            ) : null}
            <button
              aria-expanded={expanded}
              aria-label={expanded ? uiText('hide_detail_6c9aeec') : uiText('show_detail_67c90da')}
              className="hit-area rounded p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground pointer-coarse:p-2"
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpand();
              }}
              type="button"
            >
              {expanded ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronRightIcon className="size-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {expanded ? (
        <RowDetail
          counterparty={counterparty}
          currency={currency}
          evidence={evidence}
          row={row}
          settingsActions={settingsActions}
        />
      ) : null}
    </li>
  );
}

/** What the row puts on the table, on the right in mono: a budget move's change per day
 *  (green when it raises, red when it cuts), a recommendation's money at stake. The change is
 *  the difference of the two figures in the title, which carry the provenance; it adds none. */
function RowImpact({ row, currency }: { row: QueueRow; currency: string | null }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  if (row.route === 'budget') {
    const change = row.item.change_abs ?? 0;
    if (Math.abs(change) < 0.005) return null;
    return (
      <p className="text-xs">
        <span
          className={cn(
            'font-mono font-semibold text-sm tabular-nums',
            change > 0 ? 'text-success' : 'text-destructive',
          )}
        >
          {uiText.rich('sentence_e9dc34d70586', {
            v0: change > 0 ? '+' : '−',
            v1: formatCurrency(Math.abs(change), currency, uiLocale),
          })}
        </span>
        <span className="block text-muted-foreground">{uiText('daily_budget_c6371b3')}</span>
      </p>
    );
  }
  const money = impactLabel(row.rec, currency, optimizerText, uiLocale);
  if (!money) return null;
  return (
    <p className="text-xs">
      <span
        className="font-mono font-semibold text-foreground text-sm tabular-nums"
        {...figureProps(
          `queue.${row.rec.id}.at-stake`,
          impactPerDay(row.rec),
          currency,
          'none',
          'per-period',
        )}
      >
        {money.replace(/ at stake$/, '')}
      </span>
      <span className="block text-muted-foreground">{uiText('at_stake_adda7fd')}</span>
    </p>
  );
}

/** The justification, in the row, always visible — never only behind a hover. The structured
 *  line first (the trigger's headline, or metric · value · comparison · window), the prose
 *  reason under it. A trader should be able to act from these two lines alone. */
function RecWhy({
  rec,
  currency,
  timeZone,
}: {
  rec: RecommendationRow;
  currency: string | null;
  timeZone: string | null;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const line = recRowLine(rec, currency, undefined, timeZone ?? undefined, uiText, uiLocale);
  if (!line && !rec.reason) return null;
  return (
    <div className="mt-0.5 space-y-0.5 text-muted-foreground text-xs">
      {line ? <p className="text-foreground/80 tabular-nums">{line}</p> : null}
      {rec.reason ? (
        <p className="line-clamp-2" title={rec.reason}>
          {uiText.rich('sentence_b8fcef5f90e9', { v0: rec.reason })}
        </p>
      ) : null}
    </div>
  );
}

function RowHeadline({
  row,
  brandId,
  currency,
}: {
  row: QueueRow;
  brandId: string;
  currency: string | null;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  // The ad set by name, its raw id on hover — the id is never the line a person reads.
  const subject =
    row.route === 'settings' ? null : (
      <span className="font-semibold text-sm tracking-tight" title={row.adsetId}>
        {row.name ?? uiText('unnamed_ad_set_b8a5745')}
      </span>
    );
  if (row.route === 'budget') {
    const changePct = row.item.change_pct != null ? row.item.change_pct * 100 : null;
    return (
      <span className="min-w-0 font-semibold text-sm tracking-tight">
        <span title={row.adsetId}>{row.name ?? uiText('budget_move_5b0ff1c')}</span>{' '}
        <span className="font-mono font-normal text-muted-foreground tabular-nums">
          <span
            {...figureProps(
              `queue.${row.item.adset_id}.now`,
              row.item.current_budget ?? 0,
              currency,
            )}
          >
            {formatCurrency(row.item.current_budget ?? 0, currency, uiLocale)}
          </span>{' '}
          →{' '}
          <span
            className="font-semibold text-foreground"
            {...figureProps(
              `queue.${row.item.adset_id}.proposed`,
              row.item.final_budget ?? 0,
              currency,
            )}
          >
            {formatCurrency(row.item.final_budget ?? 0, currency, uiLocale)}
          </span>
          {changePct != null ? (
            <>
              {' ('}
              <span
                {...figureProps(
                  `queue.${row.item.adset_id}.change`,
                  Number(changePct.toFixed(0)),
                  null,
                  'none',
                  'percent-signed',
                )}
              >
                {changePct > 0 ? '+' : ''}
                {formatDecimal(changePct, 0, uiLocale)}%
              </span>
              {')'}
            </>
          ) : null}
        </span>
      </span>
    );
  }
  if (row.route === 'hidden') {
    return (
      <span className="min-w-0 text-sm">
        <span className="font-semibold text-muted-foreground tracking-tight">
          {recommendationLabel(row.rec.kind, optimizerText).label}
        </span>
        {subject ? <> · {subject}</> : null}
      </span>
    );
  }
  return (
    <span className="min-w-0 text-sm">
      <RecommendationInsight
        adsetId={row.adsetId}
        brandId={brandId}
        id={row.rec.id}
        kind={row.rec.kind}
        reason={row.rec.reason ?? ''}
        severity={row.rec.severity}
        trigger={row.rec.trigger}
      />
      {subject ? <> · {subject}</> : null}
    </span>
  );
}

function RowDetail({
  row,
  currency,
  counterparty,
  settingsActions,
  evidence,
}: {
  row: QueueRow;
  currency: string | null;
  counterparty?: {
    direction: 'funds' | 'fundedBy';
    parties: Counterparty[];
  } | null;
  settingsActions: SettingsActions;
  evidence: EvidenceContext;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  return (
    <div
      className="mt-3 ml-7 space-y-1.5 border-border/60 border-l pl-4 text-muted-foreground text-xs"
      data-testid="queue-row-detail"
    >
      {row.route === 'budget' ? (
        <BudgetDetail item={row.item} currency={currency} counterparty={counterparty} />
      ) : row.route !== 'settings' && isAudienceRecommendation(row.rec) ? (
        <AudienceCardHost evidence={evidence} name={row.name} rec={row.rec} />
      ) : row.route !== 'settings' && isCreativeRecommendation(row.rec) ? (
        <>
          <CreativeCardHost evidence={evidence} name={row.name} rec={row.rec} />
          {row.route === 'hidden' ? (
            <p className="mt-2">{notImplementedMessage(row.rec.kind, optimizerText)}</p>
          ) : null}
        </>
      ) : row.route === 'hidden' ? (
        <p>{notImplementedMessage(row.rec.kind, optimizerText)}</p>
      ) : row.route === 'creative' ? (
        <CreativeBriefDetail rec={row.rec} />
      ) : row.route === 'settings' ? (
        <SettingsDetail actions={settingsActions} currency={currency} rec={row.rec} />
      ) : (
        <>
          <RecDetail rec={row.rec} />
          <RecEvidenceChart
            currency={currency}
            denominatorMultiplier={evidence.denominatorMultiplier}
            item={evidence.itemById.get(row.adsetId) ?? null}
            kpiField={evidence.kpiField}
            maxCpa={evidence.maxCpa}
            name={row.name}
            rec={row.rec}
            snapshot={evidence.snapshotById.get(row.adsetId) ?? null}
          />
        </>
      )}
    </div>
  );
}

/** Resolves the creative(s) a recommendation is about from the ad set's live ads (lazy —
 *  only an expanded row reads them) and hands the card everything else from the row
 *  context. Variants can be requested only from rows that carry a seed to generate from. */
function CreativeCardHost({
  rec,
  name,
  evidence,
}: {
  rec: RecommendationRow;
  name: string | null;
  evidence: EvidenceContext;
}) {
  const adsQuery = useOptimizerAdsetAds(evidence.brandId, evidence.adAccountId, rec.adset_id);
  const ads = adsQuery.data;
  const canGenerate = rec.status === 'pending' || rec.status === 'approved';
  const targets = React.useMemo(
    () => implementTargets(evidence.audiences, rec.adset_id),
    [evidence.audiences, rec.adset_id],
  );
  const note = evidence.generateNotes.get(rec.id) ?? null;
  const snapshot = evidence.snapshotById.get(rec.adset_id) ?? null;
  const standing = React.useMemo(
    () => standingChart(snapshot?.creative ?? null, subjectAdId(rec)),
    [snapshot?.creative, rec],
  );
  return (
    <CreativeRecommendationCard
      adAccountId={evidence.adAccountId}
      ads={ads}
      adsLoading={adsQuery.isLoading}
      adsetName={name}
      audienceType={evidence.snapshotById.get(rec.adset_id)?.audienceType ?? null}
      brandId={evidence.brandId}
      currency={evidence.currency}
      generateNote={note ?? (canGenerate ? null : 'This recommendation is closed.')}
      generating={evidence.generatingIds.has(rec.id)}
      implementingKey={evidence.implementingKey}
      jobs={evidence.swapJobs}
      kpiField={evidence.kpiField}
      onGenerate={canGenerate ? () => evidence.requestGeneration(rec, name, ads) : null}
      onImplement={evidence.implementCreative}
      onRetry={evidence.retryCreative}
      rec={rec}
      resultWord={evidence.resultWord}
      snapshot={snapshot}
      standing={standing}
      targets={targets}
    />
  );
}

/** Hosts the audience card: resolves the proposal row for this recommendation and hands the
 *  card the actions from the group's context, so the card itself stays pure. */
function AudienceCardHost({
  rec,
  name,
  evidence,
}: {
  rec: RecommendationRow;
  name: string | null;
  evidence: EvidenceContext;
}) {
  const uiText = useTranslations('scale');
  const view = React.useMemo(
    () => audienceCardView(evidence.audienceProposals, rec, uiText),
    [evidence.audienceProposals, rec, uiText],
  );
  const proposalId = view.row?.id ?? null;
  const campaignId = view.block?.campaign_id ?? view.plan?.source.campaign_id ?? null;
  return (
    <AudienceRecommendationCard
      adAccountId={evidence.adAccountId}
      adsetName={name}
      brandId={evidence.brandId}
      approving={proposalId !== null && evidence.audienceBusy.approvingId === proposalId}
      busy={proposalId !== null && evidence.audienceBusy.busyId === proposalId}
      cboPreview={campaignId ? (evidence.cboPreviewByCampaign.get(campaignId) ?? null) : null}
      convertingCbo={evidence.audienceBusy.convertingCbo}
      currency={evidence.currency}
      onActivate={(handlers) =>
        proposalId && evidence.audienceActions.activate(proposalId, handlers)
      }
      onApprove={({ budgetMinorUnits, activate }, handlers) =>
        proposalId &&
        view.plan &&
        evidence.audienceActions.approve(
          { proposalId, budgetMinorUnits, activate, mode: view.plan.mode },
          handlers,
        )
      }
      onCancel={(handlers) => proposalId && evidence.audienceActions.cancel(proposalId, handlers)}
      onConvertCbo={evidence.audienceActions.convertCbo}
      onRequest={(handlers) => evidence.audienceActions.request(rec.id, handlers)}
      onRetry={(handlers) => proposalId && evidence.audienceActions.retry(proposalId, handlers)}
      onUndo={(handlers) => proposalId && evidence.audienceActions.undo(proposalId, handlers)}
      portfolioSpecs={evidence.portfolioSpecs}
      rec={rec}
      requesting={evidence.audienceBusy.requestingRecId === rec.id}
      resultWord={evidence.resultWord}
      retrying={proposalId !== null && evidence.audienceBusy.retryingId === proposalId}
      snapshot={evidence.snapshotById.get(rec.adset_id) ?? null}
      view={view}
    />
  );
}

/** A portfolio-level recommendation: the setting, what it is now, what it would become,
 *  and a button that writes exactly that through optimizer_update_portfolio. Advice with
 *  no single knob (consolidate ad sets, fix tracking) has no button; it is acknowledged
 *  or dismissed. Either way the row leaves the queue on a human's click, never on its own. */
function SettingsDetail({
  rec,
  actions,
  currency,
}: {
  rec: RecommendationRow;
  actions: SettingsActions;
  currency: string | null;
}) {
  const uiLocale = useLocale();

  const uiText = useTranslations('scale');
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const patch = settingsPatchOf(rec);
  const decided = rec.status !== 'pending';
  return (
    <div className="space-y-2">
      <RecDetail rec={rec} />
      {patch ? (
        <p className="text-foreground tabular-nums">
          <span className="font-medium">{settingsFieldLabel(patch.field, optimizerText)}:</span>{' '}
          {formatSettingsValue(patch.field, patch.from, currency, optimizerText, uiLocale)} →{' '}
          <span className="font-semibold">
            {formatSettingsValue(patch.field, patch.to, currency, optimizerText, uiLocale)}
          </span>
        </p>
      ) : null}
      {decided ? (
        <p className="text-muted-foreground">
          {uiText.rich('sentence_f5b935428629', { v0: rec.status })}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {patch ? (
            <Button
              disabled={actions.busy}
              onClick={() => void actions.apply(rec, patch)}
              size="sm"
              type="button"
            >
              {uiText('apply_setting_c14e4e4')}
            </Button>
          ) : (
            <Button
              disabled={actions.busy}
              onClick={() => actions.decide(rec, 'approved')}
              size="sm"
              type="button"
              variant="secondary"
            >
              {uiText('got_it_5ad3dbd')}
            </Button>
          )}
          <Button
            disabled={actions.busy}
            onClick={() => actions.decide(rec, 'rejected')}
            size="sm"
            type="button"
            variant="ghost"
          >
            {uiText('dismiss_48845bf')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The creative request as a person reads it: what to make, what to keep, and the measured
 *  combinations it is grounded on. Rendered from the recommendation's seed by the shared
 *  builder — the same brief the request email and the swap worker receive. Falls back to the
 *  plain reason for an older rec that carries no seed. */
function CreativeBriefDetail({ rec }: { rec: RecommendationRow }) {
  const uiText = useTranslations('scale');
  const brief = creativeBriefForRec(rec);
  if (!brief) return <RecDetail rec={rec} />;
  const seed = rec.seed as
    | {
        posterUrl?: string | null;
        winnerAssetId?: string | null;
        angleId?: string | null;
      }
    | null
    | undefined;
  const posterUrl = typeof seed?.posterUrl === 'string' ? seed.posterUrl : null;
  const angleLabel =
    typeof seed?.angleId === 'string' && seed.angleId in GLOBAL_ANGLE_LABELS
      ? GLOBAL_ANGLE_LABELS[seed.angleId as GlobalAngleId]
      : null;
  const inLibrary = typeof seed?.winnerAssetId === 'string' && seed.winnerAssetId.length > 0;
  return (
    <div className="space-y-1.5">
      {/* The creative the recommendation is about, in view. A creative recommendation with
          no creative in it cannot be acted on; the poster is the reference, the angle chip
          is the condensed WHY it wins. */}
      {posterUrl || angleLabel ? (
        <div className="flex items-start gap-3">
          {posterUrl ? (
            // biome-ignore lint/performance/noImgElement: Meta CDN poster with a signed, expiring URL; next/image cannot optimise it and would break the signature.
            <img
              alt={uiText('winning_creative_2b49fd6')}
              className="h-24 w-24 shrink-0 rounded-md border border-border/60 object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              src={posterUrl}
            />
          ) : null}
          <div className="min-w-0 space-y-1">
            {angleLabel ? (
              <Badge className="text-xs" variant="teal">
                {angleLabel}
              </Badge>
            ) : null}
            {!inLibrary ? (
              <p className="text-xs text-muted-foreground">
                {uiText('not_in_the_library_yet_import_it_from_the_ad__7f34796')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className="font-medium text-foreground">{brief.title}</p>
      <p className="leading-relaxed">{brief.brief}</p>
      {brief.groundedOn.length > 0 ? (
        <p>
          <span className="font-medium text-foreground">{uiText('grounded_on_79d5004')}</span>{' '}
          {brief.groundedOn.join(' · ')}
        </p>
      ) : null}
      {rec.ad_id ? (
        <p>
          <span className="font-medium text-foreground">{uiText('winning_ad_c09a6be')}</span>{' '}
          <code className="text-xs">{rec.ad_id}</code>
        </p>
      ) : null}
    </div>
  );
}

/** The three scoring windows behind a move, as "3d 1.20 / 7d 1.15 / 14d 1.31". Read straight
 *  off the persisted diagnostics — these are the NUMBERS, not the sentence. */
function scoreWindows(item: CycleItemRow): string | null {
  const diag = item.diagnostics ?? null;
  const parts = (
    [
      ['3d', diag?.score3d],
      ['7d', diag?.score7d],
      ['14d', diag?.score14d],
    ] as const
  )
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([label, value]) => `${label} ${(value as number).toFixed(2)}`);
  return parts.length > 0 ? parts.join(' / ') : null;
}

/** A budget move said as a sentence, then the numbers behind it.
 *
 *  The sentence is the one the ENGINE wrote at cycle time and persisted to
 *  optimizer.cycle_items.reason — the same string the apply copies into
 *  apply_audits.justification, so the queue and the money ledger cannot tell two different
 *  stories about one move. Absent on rows scored before the engine persisted it; the row
 *  then shows its numbers and no "Why", rather than a second explanation computed here. */
function BudgetDetail({
  item,
  currency,
  counterparty,
}: {
  item: CycleItemRow;
  currency: string | null;
  counterparty?: {
    direction: 'funds' | 'fundedBy';
    parties: Counterparty[];
  } | null;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const windowText = scoreWindows(item);

  return (
    <>
      {item.reason ? (
        <p>
          <span className="font-medium text-foreground">{uiText('why_ad389aa')}</span> {item.reason}
        </p>
      ) : null}
      <p>
        <span className="font-medium text-foreground">{uiText('before_after_cb98fe2')}</span>{' '}
        <span
          {...figureProps(`queue.${item.adset_id}.detail.now`, item.current_budget ?? 0, currency)}
        >
          {formatCurrency(item.current_budget ?? 0, currency, uiLocale)}
        </span>{' '}
        →{' '}
        <span
          {...figureProps(
            `queue.${item.adset_id}.detail.proposed`,
            item.final_budget ?? 0,
            currency,
          )}
        >
          {formatCurrency(item.final_budget ?? 0, currency, uiLocale)}
        </span>
      </p>
      {windowText ? (
        <p>
          <span className="font-medium text-foreground">{uiText('score_9689a81')}</span>{' '}
          {windowText}
        </p>
      ) : null}
      <CostIntervalLine adsetId={item.adset_id} ci={item.diagnostics?.ci} currency={currency} />
      {counterparty ? (
        <p>
          <CounterpartyLine currency={currency} entry={counterparty} limit={2} />
        </p>
      ) : null}
    </>
  );
}

function RecDetail({ rec }: { rec: RecommendationRow }) {
  const uiText = useTranslations('scale');
  return (
    <>
      {rec.reason ? (
        <p>
          <span className="font-medium text-foreground">{uiText('why_ad389aa')}</span> {rec.reason}
        </p>
      ) : null}
      <p>
        {uiText.rich('sentence_20a66c5279a4', {
          v0: () => <span className="font-mono">{rec.trigger}</span>,
        })}
      </p>
    </>
  );
}

/** The read-only danger affordance on an ad-LEVEL row: found, but the app cannot execute it
 *  yet, so it is never a button — just a focusable icon whose tooltip says so on hover/focus.
 *  Replaces the standing AdLevelPreviewNotice banner. */
function AdLevelDangerIcon() {
  const uiText = useTranslations('scale');
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-label={uiText('ad_level_execution_is_in_progress_not_yet_sur_909c8d7')}
              className="mt-0.5 inline-flex text-amber-600 dark:text-amber-500"
              role="img"
            >
              <TriangleAlertIcon aria-hidden="true" className="size-4" />
            </span>
          }
        />
        <TooltipContent className="max-w-xs">
          {uiText('ad_level_execution_is_in_progress_not_yet_sur_78efcfc')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
