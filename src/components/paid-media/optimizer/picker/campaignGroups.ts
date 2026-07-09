// Groups a fleet of ad-set snapshots into a campaign -> ad-set tree for the
// enrollment picker, and classifies each ad set's ELIGIBILITY for budget
// reallocation. An ad set is eligible only when it has an ad-set-level daily
// budget the optimizer can move (currentBudget > 0) and the ingest did not freeze
// it. CBO/lifetime ad sets (budget managed at the campaign level) carry a visible,
// legible reason instead of being silently dropped. Pure + dependency-light so it
// can be exercised by a bench without React.

import type { AdSetSnapshot, PortfolioLevel } from '@continuum/contracts';
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

function toPickItem(snapshot: AdSetSnapshot, mode: PortfolioLevel): AdsetPickItem {
  const currentBudget = snapshot.currentBudget ?? 0;
  const frozen = snapshot.status === 'frozen' || snapshot.freeze === true;
  const eligible = currentBudget > 0 && !frozen;
  const reason = eligible ? null : heldReason(snapshot, mode);
  const spend14 = snapshot.windows?.d14?.spend ?? 0;
  const events14 = events14Of(snapshot);
  return {
    id: snapshot.id,
    name: snapshot.name?.trim() || snapshot.id,
    eligible,
    reason,
    currentBudget,
    spend14,
    events14,
    cpa: deriveCpa(spend14, events14),
    adCount: snapshot.adCount ?? 0,
    freezeReason: snapshot.freezeReason ?? null,
    budgetType: snapshot.budgetType,
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
): CampaignSection[] {
  const byCampaign = new Map<string, { name: string; items: AdsetPickItem[] }>();

  for (const snapshot of snapshots) {
    const campaignId = snapshot.campaignId?.trim() || UNGROUPED_ID;
    const campaignName =
      snapshot.campaignName?.trim() || (campaignId === UNGROUPED_ID ? UNGROUPED_LABEL : campaignId);
    const bucket = byCampaign.get(campaignId) ?? { name: campaignName, items: [] };
    bucket.items.push(toPickItem(snapshot, mode));
    byCampaign.set(campaignId, bucket);
  }

  const sections: CampaignSection[] = [...byCampaign.entries()].map(([campaignId, bucket]) => {
    const totalSpend14 = bucket.items.reduce((sum, item) => sum + item.spend14, 0);
    const totalEvents14 = bucket.items.reduce((sum, item) => sum + item.events14, 0);
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
      cpa: deriveCpa(totalSpend14, totalEvents14),
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
