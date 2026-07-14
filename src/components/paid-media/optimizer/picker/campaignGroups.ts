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
};

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

function events14Of(snapshot: AdSetSnapshot): number {
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
function heldReason(snapshot: AdSetSnapshot, mode: PortfolioLevel): string {
  const fallbackReason = mode === 'campaign' ? CAMPAIGN_HELD_REASON : ADSET_HELD_REASON;
  if (mode === 'campaign' && snapshot.freezeReason === 'unsupported_budget') return fallbackReason;
  return freezeLabel(snapshot.freezeReason)?.label ?? fallbackReason;
}

function toPickItem(
  snapshot: AdSetSnapshot,
  mode: PortfolioLevel,
  objective?: OptimizationObjective,
): AdsetPickItem {
  const currentBudget = snapshot.currentBudget ?? 0;
  const frozen = snapshot.status === 'frozen' || snapshot.freeze === true;
  const eligible = currentBudget > 0 && !frozen;
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
  };
}

// Eligible ad sets first, then by 14d spend desc (biggest first), then by name —
// so the actionable, high-spend rows surface at the top of each campaign.
function compareAdsets(a: AdsetPickItem, b: AdsetPickItem): number {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  if (b.spend14 !== a.spend14) return b.spend14 - a.spend14;
  return a.name.localeCompare(b.name);
}

// Group the snapshots by campaign, preserving provenance. Ad sets lacking a
// campaignId fall into a single "Ungrouped" section. Sections and their ad sets
// are sorted by name for a stable, scannable tree. In campaign mode each snapshot
// is self-referential (campaignId === id), so every section holds exactly one row
// (the campaign itself) — the held-reason copy switches to campaign wording.
export function buildCampaignSections(
  snapshots: AdSetSnapshot[],
  mode: PortfolioLevel = 'adset',
  objective?: OptimizationObjective,
): CampaignSection[] {
  const byCampaign = new Map<string, { name: string; items: AdsetPickItem[] }>();

  for (const snapshot of snapshots) {
    const campaignId = snapshot.campaignId?.trim() || UNGROUPED_ID;
    const campaignName =
      snapshot.campaignName?.trim() || (campaignId === UNGROUPED_ID ? UNGROUPED_LABEL : campaignId);
    const bucket = byCampaign.get(campaignId) ?? { name: campaignName, items: [] };
    bucket.items.push(toPickItem(snapshot, mode, objective));
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

export type PickerChip = 'eligible' | 'spending' | 'held' | 'mismatch';

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
} {
  const items = sections.flatMap((section) => section.adsets);
  return {
    total: items.length,
    eligible: items.filter((item) => item.eligible).length,
    held: items.filter((item) => !item.eligible).length,
    mismatch: items.filter((item) => item.mismatch).length,
  };
}
