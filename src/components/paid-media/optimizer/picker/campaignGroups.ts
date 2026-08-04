// Groups a fleet of ad-set snapshots into a campaign -> ad-set tree for the
// enrollment picker, and classifies each ad set's ELIGIBILITY for budget
// reallocation. An ad set is eligible only when it has an ad-set-level daily
// budget the optimizer can move (currentBudget > 0) and the ingest did not freeze
// it. CBO/lifetime ad sets (budget managed at the campaign level) carry a visible,
// legible reason instead of being silently dropped. Pure + dependency-light so it
// can be exercised by a bench without React.

import type { AdSetSnapshot, OptimizationObjective, PortfolioLevel } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { deriveCpa } from '../format';
import { freezeLabel } from '../reportModel';
import type { PortfolioPickerEntity } from './portfolioPickerEntities';

const UNGROUPED_ID = '__ungrouped__';
const UNGROUPED_LABEL = 'Ungrouped';
// Held-reason fallback copy, per level. Ad-set mode: the ad set has no ad-set
// budget (its campaign is CBO/lifetime). Campaign mode: the campaign has no
// campaign budget (it splits at the ad-set level — ABO).
const ADSET_HELD_REASON = 'No ad-set budget — managed at the campaign level (CBO or lifetime).';
const CAMPAIGN_HELD_REASON =
  'No campaign budget — this campaign splits budget at the ad-set level (ABO).';

export type AdsetPickItem = {
  id: string;
  name: string;
  eligible: boolean;
  /** Inactive recoverable rows are addable even though the optimizer cannot score them yet. */
  canAdd: boolean;
  // Visible inline reason when NOT eligible (never tooltip-only); null when eligible.
  reason: string | null;
  currentBudget: number;
  spend14: number;
  // Strongest known conversion-type event in the trailing 14d window — an
  // objective-agnostic "results" proxy for the row (the tree groups by campaign,
  // so there is no single objective to pick an exact KPI from).
  events14: number;
  // CPA = spend14 / events14, or null when there are no tracked results.
  cpa: number | null;
  // How many ads (creatives) live in this ad set (0 when the ingest hasn't sent it).
  adCount: number;
  freezeReason: string | null;
  // 'daily' | 'lifetime' for a campaign snapshot (CBO); undefined for an ad set.
  budgetType?: 'daily' | 'lifetime';
  // This ad set BUYS a different event than the portfolio's objective, so runCycle will
  // freeze it (kpi_mismatch) and never move its budget. Only known when an objective is
  // supplied — eligibility itself is deliberately objective-agnostic (an ad set's budget is
  // movable or it isn't), but a mismatched ad set is eligible AND inert, which is the worst
  // combination to discover after the fact. On a live account 60 of 63 "eligible" ad sets
  // were mismatched under a `purchase` objective: 95% of the budget enrolled and frozen.
  mismatch: boolean;
  // What this ad set actually declared it buys (Meta optimization_goal → kpiField).
  kpiField: string | null;
  // Another portfolio holds this ad set's single ACTIVE enrollment. Selecting it here is a
  // MOVE, not a copy — the DB allows exactly one active enrollment per ad set. Left
  // selectable on purpose (moving is a legitimate thing to want); the badge and the save
  // confirmation are what make it a decision rather than a surprise. Null when unclaimed or
  // when the claim is this same portfolio.
  enrolledIn: AdsetClaim | null;
  providerLifecycle: PortfolioPickerEntity['providerLifecycle'] | null;
  providerStatus: string | null;
};

/** Which portfolio currently owns an ad set's active enrollment.
 *
 *  `canRelease` is the difference between "selecting this moves it" and "selecting this will be
 *  REFUSED": taking a claimed ad set requires edit rights on the brand holding it, so a claim
 *  held by a brand the operator cannot edit is a dead end the picker must show up front rather
 *  than let the save discover. `portfolioId`/`portfolioName` are null in exactly that case —
 *  the claim is disclosed, its holder is not. */
export type AdsetClaim = {
  portfolioId: string | null;
  portfolioName: string | null;
  sameBrand: boolean;
  canRelease: boolean;
};

/** adset_id → owning portfolio, for every ACTIVE enrollment on the account. */
export type AdsetClaimMap = ReadonlyMap<string, AdsetClaim>;

const NO_CLAIMS: AdsetClaimMap = new Map();

export type CampaignSection = {
  campaignId: string;
  campaignName: string;
  adsets: AdsetPickItem[];
  eligibleCount: number;
  totalCount: number;
  // Campaign-level aggregates for the data table's group header row.
  totalBudget: number;
  totalSpend14: number;
  totalEvents14: number;
  totalAds: number;
  cpa: number | null;
  // How many of this campaign's ad sets buy a different event than the objective (and so
  // would enroll frozen). 0 when no objective was supplied.
  mismatchCount: number;
};

export type PortfolioPickerSource = AdSetSnapshot | PortfolioPickerEntity;

function isPickerEntity(source: PortfolioPickerSource): source is PortfolioPickerEntity {
  return 'providerLifecycle' in source;
}

function events14Of(snapshot: PortfolioPickerSource): number {
  const d14 = snapshot.windows?.d14;
  if (!d14) return 0;
  return Math.max(
    d14.purchases ?? 0,
    d14.leads ?? 0,
    d14.appInstalls ?? 0,
    d14.signups ?? 0,
    d14.landingPageViews ?? 0,
  );
}

// The held reason is level-relative for the "budget lives at the other level"
// freeze: an ABO campaign (unsupported_budget in campaign mode) must read as
// ABO, not as the ad-set-context "CBO/lifetime" freezeLabel. Every other freeze
// keeps the shared freezeLabel wording, falling back to the mode default.
function providerHeldReason(source: PortfolioPickerEntity): string | null {
  const status = source.providerStatus?.replaceAll('_', ' ').toLowerCase();
  if (source.providerLifecycle === 'active') return null;
  if (source.providerLifecycle === 'recoverable') {
    return `${status ? `${status[0].toUpperCase()}${status.slice(1)}` : 'Inactive'} on Meta — held until active.`;
  }
  if (source.providerLifecycle === 'archived') return 'Archived on Meta — remove-only.';
  if (source.providerLifecycle === 'deleted') return 'Deleted on Meta — remove-only.';
  return 'Meta status unavailable — remove-only.';
}

function heldReason(snapshot: PortfolioPickerSource, mode: PortfolioLevel): string {
  if (isPickerEntity(snapshot)) {
    const providerReason = providerHeldReason(snapshot);
    if (providerReason) return providerReason;
  }
  const fallbackReason = mode === 'campaign' ? CAMPAIGN_HELD_REASON : ADSET_HELD_REASON;
  if (mode === 'campaign' && snapshot.freezeReason === 'unsupported_budget') return fallbackReason;
  return freezeLabel(snapshot.freezeReason)?.label ?? fallbackReason;
}

function toPickItem(
  snapshot: PortfolioPickerSource,
  mode: PortfolioLevel,
  objective?: OptimizationObjective,
  claims: AdsetClaimMap = NO_CLAIMS,
): AdsetPickItem {
  const currentBudget = snapshot.currentBudget ?? 0;
  const frozen = isPickerEntity(snapshot)
    ? !snapshot.optimizable
    : snapshot.status === 'frozen' || snapshot.freeze === true;
  const eligible = isPickerEntity(snapshot) ? snapshot.optimizable : currentBudget > 0 && !frozen;
  const canAdd = isPickerEntity(snapshot) ? snapshot.canAdd : eligible;
  const reason = eligible ? null : heldReason(snapshot, mode);
  const spend14 = snapshot.windows?.d14?.spend ?? 0;

  // With an objective in hand, count the event the portfolio ACTUALLY prices on. Without one,
  // fall back to the objective-agnostic strongest-signal proxy. The proxy is why a lead
  // portfolio could show a purchase-derived cost next to an ad set the engine scores on leads.
  const kpiField = snapshot.kpiField ?? null;
  const objectiveKpi = objective
    ? (getOptimizationMetricDefinition(objective).kpiField as keyof NonNullable<
        AdSetSnapshot['windows']
      >['d14'])
    : null;
  const events14 = objectiveKpi
    ? Number(snapshot.windows?.d14?.[objectiveKpi] ?? 0)
    : events14Of(snapshot);
  const mult = objective ? getOptimizationMetricDefinition(objective).denominatorMultiplier : 1;
  const rawCpa = deriveCpa(spend14, events14);

  return {
    id: snapshot.id,
    name: snapshot.name?.trim() || snapshot.id,
    eligible,
    canAdd,
    reason,
    currentBudget,
    spend14,
    events14,
    cpa: rawCpa === null ? null : rawCpa * mult,
    adCount: snapshot.adCount ?? 0,
    freezeReason: snapshot.freezeReason ?? null,
    budgetType: snapshot.budgetType,
    mismatch: Boolean(objectiveKpi && kpiField && kpiField !== objectiveKpi),
    kpiField,
    enrolledIn: claims.get(snapshot.id) ?? null,
    providerLifecycle: isPickerEntity(snapshot) ? snapshot.providerLifecycle : null,
    providerStatus: isPickerEntity(snapshot) ? snapshot.providerStatus : null,
  };
}

// Eligible ad sets first, then by 14d spend desc (biggest first), then by name —
// so the actionable, high-spend rows surface at the top of each campaign.
function compareAdsets(a: AdsetPickItem, b: AdsetPickItem): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (a.canAdd !== b.canAdd) return a.canAdd ? -1 : 1;
  if (b.spend14 !== a.spend14) return b.spend14 - a.spend14;
  return a.name.localeCompare(b.name);
}

// Group the snapshots by campaign, preserving provenance. Ad sets lacking a
// campaignId fall into a single "Ungrouped" section. Sections and their ad sets
// are sorted by name for a stable, scannable tree. In campaign mode each snapshot
// is self-referential (campaignId === id), so every section holds exactly one row
// (the campaign itself) — the held-reason copy switches to campaign wording.
export function buildCampaignSections(
  snapshots: PortfolioPickerSource[],
  mode: PortfolioLevel = 'adset',
  objective?: OptimizationObjective,
  claims: AdsetClaimMap = NO_CLAIMS,
): CampaignSection[] {
  const byCampaign = new Map<string, { name: string; items: AdsetPickItem[] }>();

  for (const snapshot of snapshots) {
    const campaignId = snapshot.campaignId?.trim() || UNGROUPED_ID;
    const campaignName =
      snapshot.campaignName?.trim() || (campaignId === UNGROUPED_ID ? UNGROUPED_LABEL : campaignId);
    const bucket = byCampaign.get(campaignId) ?? { name: campaignName, items: [] };
    bucket.items.push(toPickItem(snapshot, mode, objective, claims));
    byCampaign.set(campaignId, bucket);
  }

  const mult = objective ? getOptimizationMetricDefinition(objective).denominatorMultiplier : 1;
  const sections: CampaignSection[] = [...byCampaign.entries()].map(([campaignId, bucket]) => {
    const totalSpend14 = bucket.items.reduce((sum, item) => sum + item.spend14, 0);
    const totalEvents14 = bucket.items.reduce((sum, item) => sum + item.events14, 0);
    const rawCpa = deriveCpa(totalSpend14, totalEvents14);
    return {
      campaignId,
      campaignName: bucket.name,
      adsets: bucket.items.sort(compareAdsets),
      eligibleCount: bucket.items.filter((item) => item.eligible).length,
      totalCount: bucket.items.length,
      totalBudget: bucket.items.reduce((sum, item) => sum + item.currentBudget, 0),
      totalSpend14,
      totalEvents14,
      totalAds: bucket.items.reduce((sum, item) => sum + item.adCount, 0),
      cpa: rawCpa === null ? null : rawCpa * mult,
      mismatchCount: bucket.items.filter((item) => item.mismatch).length,
    };
  });

  // Ungrouped sinks to the bottom; everything else alphabetical by campaign name.
  return sections.sort((a, b) => {
    if (a.campaignId === UNGROUPED_ID) return 1;
    if (b.campaignId === UNGROUPED_ID) return -1;
    return a.campaignName.localeCompare(b.campaignName);
  });
}

/** Build the ad-set → owning-portfolio map, EXCLUDING the portfolio being edited: an ad set
 *  already enrolled here is not moving anywhere, and badging it "In: <this portfolio>" would
 *  read as a conflict where there is none. */
export function buildClaimMap(
  enrollments: ReadonlyArray<{
    adset_id: string;
    portfolio_id: string | null;
    portfolio_name: string | null;
    same_brand?: boolean;
    can_release?: boolean;
  }>,
  currentPortfolioId: string | null,
): AdsetClaimMap {
  const map = new Map<string, AdsetClaim>();
  for (const row of enrollments) {
    if (row.portfolio_id !== null && row.portfolio_id === currentPortfolioId) continue;
    const sameBrand = row.same_brand ?? true;
    map.set(row.adset_id, {
      portfolioId: row.portfolio_id,
      // A cross-brand holder the caller cannot see has no name to show. Saying "another
      // portfolio" there would be a guess; saying which BRAND-space it sits in is the honest
      // amount of detail, and it is what makes the refusal legible.
      portfolioName: row.portfolio_name?.trim() || (sameBrand ? 'another portfolio' : null),
      sameBrand,
      canRelease: row.can_release ?? true,
    });
  }
  return map;
}

/** The ad sets a save would take from other portfolios, grouped by which portfolio loses
 *  them — the sentence the confirm step needs ("3 ad sets will move out of Prospecting Q3").
 *
 *  Claims the caller CANNOT release are excluded: those are not moves this save will make, they
 *  are the reason it would be refused. Listing them here would promise something that cannot
 *  happen; they get their own blocking message. Claims whose holder cannot be named are
 *  likewise skipped — there is no portfolio to attribute the move to. */
export function previewMoves(
  selectedIds: ReadonlyArray<string>,
  claims: AdsetClaimMap,
): Array<{ portfolioName: string; adsetIds: string[] }> {
  const byPortfolio = new Map<string, { portfolioName: string; adsetIds: string[] }>();
  for (const id of selectedIds) {
    const claim = claims.get(id);
    if (!claim || !claim.canRelease) continue;
    if (!claim.portfolioId || !claim.portfolioName) continue;
    const bucket = byPortfolio.get(claim.portfolioId) ?? {
      portfolioName: claim.portfolioName,
      adsetIds: [] as string[],
    };
    bucket.adsetIds.push(id);
    byPortfolio.set(claim.portfolioId, bucket);
  }
  return [...byPortfolio.values()].sort((a, b) => b.adsetIds.length - a.adsetIds.length);
}

// The CBO campaigns in a fleet: campaigns whose ad sets are held
// `unsupported_budget` (the budget lives on the campaign, not the ad sets — Meta's
// "Advantage Campaign Budget"). These are the convert-to-ABO targets we surface as
// not-yet-optimizable. Only snapshots carrying a real campaignId qualify (a convert
// needs one), and each resulting section is one CBO campaign with its held ad sets.
export function buildCboCampaignSections(snapshots: AdSetSnapshot[]): CampaignSection[] {
  const cbo = snapshots.filter(
    (snapshot) => snapshot.freezeReason === 'unsupported_budget' && !!snapshot.campaignId?.trim(),
  );
  return buildCampaignSections(cbo).filter((section) => section.campaignId !== UNGROUPED_ID);
}

// Narrow a section's ad sets to a search query. A hit on the campaign name keeps
// every ad set; otherwise only ad sets whose name or id match survive.
export function filterSection(section: CampaignSection, query: string): AdsetPickItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return section.adsets;
  if (section.campaignName.toLowerCase().includes(trimmed)) return section.adsets;
  return section.adsets.filter(
    (item) => item.name.toLowerCase().includes(trimmed) || item.id.toLowerCase().includes(trimmed),
  );
}

// The eligible ad-set ids among a list (used by a campaign's "select all"
// tri-state control — ineligible ad sets are never enrolled).
export function sectionEligibleIds(adsets: AdsetPickItem[]): string[] {
  return adsets.filter((item) => item.eligible).map((item) => item.id);
}

// ── browsing: search, filters, virtualization ────────────────────────────────────────────
// An account with 300+ ad sets is not browsable by scrolling a flat table, and the old picker
// rendered every row into the DOM inside a 60vh box inside a 672px column. These are the pure
// pieces the virtualized picker is built from — kept here so a bench can exercise them without
// React.

export type PickerChip = 'eligible' | 'spending' | 'held' | 'mismatch' | 'inactive' | 'terminal';

/** One rendered line: either a campaign group header, or an ad set under it. The virtualizer
 *  indexes THIS — a flat list is the only thing a windowing library can measure. */
export type PickerRow =
  | { kind: 'campaign'; section: CampaignSection; visibleCount: number }
  | { kind: 'adset'; item: AdsetPickItem; section: CampaignSection };

function matchesChips(item: AdsetPickItem, chips: readonly PickerChip[]): boolean {
  // Chips are ADDITIVE filters, all of which must hold. An empty set means no filtering.
  return chips.every((chip) => {
    if (chip === 'eligible') return item.eligible;
    if (chip === 'spending') return item.spend14 > 0;
    if (chip === 'held') return !item.eligible;
    if (chip === 'inactive') return item.providerLifecycle === 'recoverable';
    if (chip === 'terminal') {
      return ['archived', 'deleted', 'unknown'].includes(item.providerLifecycle ?? '');
    }
    return item.mismatch;
  });
}

/** Tokenized AND match over campaign name, ad-set name and ad-set id.
 *
 *  The old filter was a single substring test, so "prospect broad" found nothing unless those
 *  two words were adjacent in that order. Splitting on whitespace and requiring every token to
 *  hit somewhere is what people actually expect from a search box. */
function matchesQuery(item: AdsetPickItem, section: CampaignSection, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = `${item.name} ${item.id} ${section.campaignName}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/** The ad sets of one section surviving the query + chips. */
export function filterItems(
  section: CampaignSection,
  { query = '', chips = [] }: { query?: string; chips?: readonly PickerChip[] },
): AdsetPickItem[] {
  return section.adsets.filter(
    (item) => matchesQuery(item, section, query) && matchesChips(item, chips),
  );
}

/** Flatten the tree into the virtualizer's index. A collapsed campaign contributes its header
 *  and nothing else; a campaign with no surviving ad sets contributes nothing at all.
 *
 *  `collapsed` is ALWAYS honored. The old picker computed
 *  `isCollapsed = !searching && collapsed.has(id)`, which made every collapse control inert
 *  the moment a query was typed: you could click it, and nothing happened. Auto-expanding the
 *  sections that match a new query is a decision for the component (it can update the set);
 *  it is not something this function should do behind the caller's back. */
export function flattenRows(
  sections: CampaignSection[],
  {
    collapsed,
    query = '',
    chips = [],
  }: { collapsed: ReadonlySet<string>; query?: string; chips?: readonly PickerChip[] },
): PickerRow[] {
  const rows: PickerRow[] = [];

  for (const section of sections) {
    const visible = filterItems(section, { query, chips });
    if (visible.length === 0) continue;

    rows.push({ kind: 'campaign', section, visibleCount: visible.length });
    if (collapsed.has(section.campaignId)) continue;

    for (const item of visible) rows.push({ kind: 'adset', item, section });
  }
  return rows;
}

/** The campaigns that have at least one hit for this query — what a search should open. */
export function sectionsMatching(
  sections: CampaignSection[],
  query: string,
  chips: readonly PickerChip[] = [],
): string[] {
  if (!query.trim()) return [];
  return sections
    .filter((section) => filterItems(section, { query, chips }).length > 0)
    .map((section) => section.campaignId);
}

/** The N biggest-spending ELIGIBLE ad sets across the fleet. The fastest path from an empty
 *  selection to a sane portfolio, and it pairs with the advisor: select, and the budget and
 *  target are proposed immediately. */
export function topEligibleBySpend(sections: CampaignSection[], count: number): string[] {
  return sections
    .flatMap((section) => section.adsets)
    .filter((item) => item.eligible)
    .sort((a, b) => b.spend14 - a.spend14)
    .slice(0, count)
    .map((item) => item.id);
}

/** Campaigns to start collapsed: everything that does not hold one of the top-20 ad sets by
 *  spend. Opening a 300-ad-set account fully expanded is not a browsing experience. */
export function defaultCollapsed(sections: CampaignSection[]): Set<string> {
  const top = new Set(topEligibleBySpend(sections, 20));
  const collapsed = new Set<string>();
  for (const section of sections) {
    if (!section.adsets.some((item) => top.has(item.id))) collapsed.add(section.campaignId);
  }
  return collapsed;
}

/** Fleet-wide counts for the toolbar. Nothing is ever hidden without a signpost. */
export function pickerCounts(sections: CampaignSection[]): {
  total: number;
  eligible: number;
  held: number;
  mismatch: number;
  inactive: number;
  terminal: number;
} {
  const items = sections.flatMap((section) => section.adsets);
  return {
    total: items.length,
    eligible: items.filter((item) => item.eligible).length,
    held: items.filter((item) => !item.eligible).length,
    mismatch: items.filter((item) => item.mismatch).length,
    inactive: items.filter((item) => item.providerLifecycle === 'recoverable').length,
    terminal: items.filter((item) =>
      ['archived', 'deleted', 'unknown'].includes(item.providerLifecycle ?? ''),
    ).length,
  };
}
