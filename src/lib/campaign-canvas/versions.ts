// The versions of one campaign in a thread, and what changed between two of them (design C,
// option 30). A line v1 → v2 → v3 → "Applied in Meta" sits above Read and the Map; picking a
// version shows it, and "Compare with previous" marks what that version changed against the one
// before — added, changed, paused, and removed (a node the earlier version had, struck through).
//
// Two sources, both already in the thread the chat projects:
//   - a scaffold: each `paid.campaign_structure` part names its version (`version`, the version
//     id in `scaffoldId`, the scaffold in `parentScaffoldId`) — a correction in words saves a new
//     version and draws it again. Applied when the scaffold's build receipt arrives.
//   - a live change: each new `paid.live_change_preview` of the same campaign is its next
//     version. Applied when its approval was approved AND the tool's own result came back ok —
//     the approval alone is consent, the result is the write.
// Pure: no React, no store.

import type { CampaignStructurePayload, LiveChangePreviewPayload } from '@continuum/contracts';
import {
  type CampaignViewModel,
  campaignViewFromLiveChange,
  campaignViewFromStructure,
  changeTitle,
  type LecturaAd,
  type LecturaAdSet,
  type LecturaCampaign,
  type LecturaChange,
  type LecturaMark,
  type LecturaRow,
  lecturaMoney,
} from './lectura';
import { liveChangeDecisionOf } from './liveChange';
import { platformLabelsOf } from './platformLabels';
import {
  campaignIdsOfPreview,
  mergePreviews,
  pickStructure,
  previewForCampaign,
  scaffoldKeyOf,
} from './portfolio';

export type VersionStatus = 'proposed' | 'approved' | 'applied' | 'denied' | 'failed';

export type CampaignVersion = {
  /** The preview part id (a live change) or `paid_scaffold_versions.id` (a scaffold). */
  id: string;
  number: number;
  label: string;
  model: CampaignViewModel;
  status: VersionStatus;
};

export type VersionLine = {
  /** The campaign id (a live change) or the parent scaffold id (a scaffold). */
  key: string;
  source: 'live' | 'scaffold';
  versions: CampaignVersion[];
  /** The version the platform now runs, or null while nothing was applied. */
  appliedId: string | null;
};

/** What the thread's messages carry that a version line reads. */
export type VersionThreadMessage = {
  liveChangePreviews?: readonly LiveChangePreviewPayload[];
  campaignStructures?: readonly CampaignStructurePayload[];
  resolvedApprovals?: Readonly<Record<string, { decision: 'approved' | 'denied' }>>;
  toolResults?: readonly { id: string; ok: boolean }[];
  scaffold?: { scaffoldId: string; receipt?: { status: string } | null } | null;
};

const appliedIdOf = (versions: readonly CampaignVersion[]): string | null =>
  versions.filter((version) => version.status === 'applied').at(-1)?.id ?? null;

// ---------------------------------------------------------------------------
// Live changes
// ---------------------------------------------------------------------------

/**
 * Where a set of approvals stands. Applied only when every one was approved and its tool came
 * back ok; failed when one came back with an error; denied when one was denied.
 */
const liveStatusOf = (
  messages: readonly VersionThreadMessage[],
  previews: readonly LiveChangePreviewPayload[],
): VersionStatus => {
  const results = new Map<string, boolean>();
  for (const message of messages) {
    for (const result of message.toolResults ?? []) results.set(result.id, result.ok);
  }
  const decisions = previews.map((preview) => liveChangeDecisionOf(messages, preview.approvalId));
  if (decisions.includes('denied')) return 'denied';
  if (decisions.some((decision) => decision === 'pending')) return 'proposed';
  const outcomes = previews.map((preview) => results.get(preview.toolCallId));
  if (outcomes.includes(false)) return 'failed';
  return outcomes.every((ok) => ok === true) ? 'applied' : 'approved';
};

/**
 * Every version of one live campaign across the thread: each message that previews a change to
 * it is the next version (several approvals in one message are one version, read together).
 */
export const liveChangeVersionsOf = (
  messages: readonly VersionThreadMessage[],
  campaignId: string,
): VersionLine => {
  const versions: CampaignVersion[] = [];
  for (const message of messages) {
    const previews = (message.liveChangePreviews ?? []).filter((preview) =>
      campaignIdsOfPreview(preview).includes(campaignId),
    );
    const last = previews.at(-1);
    if (!last) continue;
    const merged = mergePreviews(
      previews.map((preview) => previewForCampaign(preview, campaignId)),
    );
    const number = versions.length + 1;
    versions.push({
      id: last.partId,
      number,
      label: `v${number}`,
      model: campaignViewFromLiveChange(merged),
      status: liveStatusOf(messages, previews),
    });
  }
  return { key: campaignId, source: 'live', versions, appliedId: appliedIdOf(versions) };
};

// ---------------------------------------------------------------------------
// Scaffolds
// ---------------------------------------------------------------------------

const scaffoldStatusOf = (
  messages: readonly VersionThreadMessage[],
  versionId: string,
): VersionStatus => {
  let status: VersionStatus = 'proposed';
  for (const message of messages) {
    const receipt = message.scaffold?.scaffoldId === versionId ? message.scaffold.receipt : null;
    if (!receipt) continue;
    status = receipt.status === 'failed' ? 'failed' : 'applied';
  }
  return status;
};

/** Every saved version of one scaffold the thread drew, oldest first, by its own number. */
export const scaffoldVersionsOf = (
  messages: readonly VersionThreadMessage[],
  parentScaffoldId: string,
): VersionLine => {
  const byVersionId = new Map<string, CampaignStructurePayload[]>();
  for (const message of messages) {
    for (const structure of message.campaignStructures ?? []) {
      if (scaffoldKeyOf(structure) !== parentScaffoldId) continue;
      const list = byVersionId.get(structure.scaffoldId) ?? [];
      list.push(structure);
      byVersionId.set(structure.scaffoldId, list);
    }
  }
  const versions = [...byVersionId.values()]
    .map((structures) => pickStructure(structures))
    .filter((structure): structure is CampaignStructurePayload => structure !== null)
    .sort((a, b) => a.version - b.version)
    .map(
      (structure): CampaignVersion => ({
        id: structure.scaffoldId,
        number: structure.version,
        label: `v${structure.version}`,
        model: campaignViewFromStructure(structure),
        status: scaffoldStatusOf(messages, structure.scaffoldId),
      }),
    );
  return { key: parentScaffoldId, source: 'scaffold', versions, appliedId: appliedIdOf(versions) };
};

/** A line is worth drawing when there is something to pick between, or something applied. */
export const showsVersionLine = (line: VersionLine | null | undefined): line is VersionLine =>
  Boolean(line && (line.versions.length > 1 || line.appliedId));

// ---------------------------------------------------------------------------
// Compare two versions
// ---------------------------------------------------------------------------

export type VersionChangeMark = Exclude<LecturaMark, 'unchanged'>;

export type VersionComparison = {
  /** The newer version, every node marked against the older one; removed nodes put back. */
  model: CampaignViewModel;
  counts: Record<VersionChangeMark, number>;
};

type NodeState = {
  name: string;
  paused: boolean;
  facts: Map<string, { label: string; text: string }>;
};

const STOPS = new Set<LecturaMark>(['paused']);

const proposedRowsOf = (rows: readonly LecturaRow[]) =>
  rows.filter((row) => row.field !== 'name' && row.field !== 'status');

const stateOf = (
  node: { name: string; mark: LecturaMark; rows: LecturaRow[] },
  extra: [string, string, string | null][],
): NodeState => {
  const facts = new Map<string, { label: string; text: string }>();
  for (const [field, label, text] of extra) {
    if (text !== null) facts.set(field, { label, text });
  }
  // What the version proposes for each field is its after value.
  for (const row of proposedRowsOf(node.rows))
    facts.set(row.field, { label: row.label, text: row.after });
  return {
    name: node.rows.find((row) => row.field === 'name')?.after ?? node.name,
    paused: STOPS.has(node.mark),
    facts,
  };
};

const campaignState = (campaign: LecturaCampaign, currency: string | null) =>
  stateOf(campaign, [
    ['daily_budget', 'Daily budget', lecturaMoney(campaign.budgetMinor, currency)],
  ]);

// Own marks only: an ad set that stops because its campaign does is the campaign's change.
const adSetState = (adSet: LecturaAdSet, currency: string | null) =>
  stateOf(adSet, [
    // A paused ad set keeps its budget; the pause is its own row (Status), not "$0".
    [
      'daily_budget',
      'Daily budget',
      lecturaMoney(
        adSet.mark === 'paused' ? adSet.budgetMinor : (adSet.budgetAfter ?? adSet.budgetMinor),
        currency,
      ),
    ],
    ['audience', 'Audience', adSet.audience],
  ]);

const adState = (ad: LecturaAd) => stateOf(ad, []);

/** Before → after rows between two states of one node, and its mark. */
const diffStates = (
  before: NodeState,
  after: NodeState,
): { mark: LecturaMark; rows: LecturaRow[] } => {
  const rows: LecturaRow[] = [];
  if (before.name !== after.name) {
    rows.push({ field: 'name', label: 'Name', before: before.name, after: after.name });
  }
  const fields = new Set([...before.facts.keys(), ...after.facts.keys()]);
  for (const field of fields) {
    const was = before.facts.get(field);
    const now = after.facts.get(field);
    if (was?.text === now?.text) continue;
    rows.push({
      field,
      label: now?.label ?? was?.label ?? field,
      before: was?.text ?? 'none',
      after: now?.text ?? 'none',
    });
  }
  if (before.paused !== after.paused) {
    // Not `status`: the views hide a status row behind the mark, and this one IS the change.
    rows.push({
      field: 'stops',
      label: 'Status',
      before: before.paused ? 'Pauses' : 'Keeps running',
      after: after.paused ? 'Pauses' : 'Keeps running',
    });
  }
  if (after.paused && !before.paused) return { mark: 'paused', rows };
  return { mark: rows.length > 0 ? 'changed' : 'unchanged', rows };
};

const marked = <T extends { mark: LecturaMark; rows: LecturaRow[] }>(
  node: T,
  diff: { mark: LecturaMark; rows: LecturaRow[] },
): T => ({ ...node, mark: diff.mark, rows: diff.rows });

const removedAd = (ad: LecturaAd): LecturaAd => ({
  ...ad,
  mark: 'removed',
  rows: [],
  stops: false,
});

const removedAdSet = (adSet: LecturaAdSet): LecturaAdSet => ({
  ...adSet,
  mark: 'removed',
  rows: [],
  stopsWithParent: false,
  ads: adSet.ads.map(removedAd),
});

const addedNode = <T extends { mark: LecturaMark; rows: LecturaRow[] }>(node: T): T => ({
  ...node,
  mark: 'added',
  rows: [],
});

/**
 * The newer version marked against the older one, by node id (Meta ids for a live change, path
 * keys for a scaffold — both stable across versions of one campaign). A node only the newer one
 * has is added; one only the older one had is put back, removed; one in both is changed where its
 * name, budget, audience, any proposed field or whether it stops differs, paused when it starts
 * to stop. The changes list is rebuilt from those marks, so Read's "changes first" and the Map's
 * "next change" walk what changed between the two versions — not what each proposes on its own.
 */
export const compareVersions = (
  previous: CampaignViewModel,
  next: CampaignViewModel,
): VersionComparison => {
  const labels = platformLabelsOf(next.platform);
  const currency = next.currency ?? previous.currency;
  const previousCampaigns = new Map(previous.campaigns.map((campaign) => [campaign.id, campaign]));

  const campaigns: LecturaCampaign[] = next.campaigns.map((campaign) => {
    const before = previousCampaigns.get(campaign.id);
    if (!before) {
      return {
        ...addedNode(campaign),
        adSets: campaign.adSets.map((adSet) => ({
          ...addedNode(adSet),
          ads: adSet.ads.map(addedNode),
        })),
      };
    }
    const beforeAdSets = new Map(before.adSets.map((adSet) => [adSet.id, adSet]));
    const adSets: LecturaAdSet[] = campaign.adSets.map((adSet) => {
      const was = beforeAdSets.get(adSet.id);
      if (!was) return { ...addedNode(adSet), ads: adSet.ads.map(addedNode) };
      const beforeAds = new Map(was.ads.map((ad) => [ad.id, ad]));
      const ads = adSet.ads.map((ad) => {
        const wasAd = beforeAds.get(ad.id);
        return wasAd ? marked(ad, diffStates(adState(wasAd), adState(ad))) : addedNode(ad);
      });
      const keptAds = new Set(adSet.ads.map((ad) => ad.id));
      return {
        ...marked(adSet, diffStates(adSetState(was, currency), adSetState(adSet, currency))),
        stopsWithParent: false,
        ads: [...ads, ...was.ads.filter((ad) => !keptAds.has(ad.id)).map(removedAd)],
      };
    });
    const keptAdSets = new Set(campaign.adSets.map((adSet) => adSet.id));
    return {
      ...marked(
        campaign,
        diffStates(campaignState(before, currency), campaignState(campaign, currency)),
      ),
      adSets: [
        ...adSets,
        ...before.adSets.filter((adSet) => !keptAdSets.has(adSet.id)).map(removedAdSet),
      ],
    };
  });
  const keptCampaigns = new Set(next.campaigns.map((campaign) => campaign.id));
  for (const campaign of previous.campaigns) {
    if (keptCampaigns.has(campaign.id)) continue;
    campaigns.push({
      ...campaign,
      mark: 'removed',
      rows: [],
      adSets: campaign.adSets.map(removedAdSet),
    });
  }

  const changes: LecturaChange[] = [];
  const counts: Record<VersionChangeMark, number> = { added: 0, changed: 0, paused: 0, removed: 0 };
  const push = (
    change: Omit<LecturaChange, 'title' | 'basis'> & { level: LecturaChange['level'] },
  ) => {
    counts[change.mark] += 1;
    changes.push({
      ...change,
      title: changeTitle(labels, change.level, change.mark, change.rows),
      basis: null,
    });
  };
  for (const campaign of campaigns) {
    if (campaign.mark !== 'unchanged') {
      push({
        id: campaign.id,
        level: 'campaign',
        mark: campaign.mark,
        campaignName: campaign.name,
        adSetName: null,
        rows: campaign.rows,
        adSetId: null,
      });
    }
    // A campaign added or removed whole is one change; its parts go with it.
    if (campaign.mark === 'added' || campaign.mark === 'removed') continue;
    for (const adSet of campaign.adSets) {
      if (adSet.mark !== 'unchanged') {
        push({
          id: adSet.id,
          level: 'adset',
          mark: adSet.mark,
          campaignName: campaign.name,
          adSetName: adSet.name,
          rows: adSet.rows,
          adSetId: adSet.id,
        });
      }
      if (adSet.mark === 'added' || adSet.mark === 'removed') continue;
      for (const ad of adSet.ads) {
        if (ad.mark === 'unchanged') continue;
        push({
          id: ad.id,
          level: 'ad',
          mark: ad.mark,
          campaignName: campaign.name,
          adSetName: adSet.name,
          rows: ad.rows,
          adSetId: adSet.id,
        });
      }
    }
  }
  // An ad's title names the ad: "Name: renamed".
  for (const change of changes) {
    if (change.level !== 'ad') continue;
    const ad = campaigns
      .flatMap((campaign) => campaign.adSets)
      .flatMap((adSet) => adSet.ads)
      .find((entry) => entry.id === change.id);
    if (ad) change.title = `${ad.name}: ${change.title.toLowerCase()}`;
  }

  return {
    model: {
      ...next,
      kind: 'change',
      currency,
      campaigns,
      changes,
      totals: {
        before: previous.totals.after ?? previous.totals.before,
        after: next.totals.after ?? next.totals.before,
        newWhenActivated: next.totals.newWhenActivated,
      },
      adSetCount: campaigns.reduce(
        (total, campaign) =>
          total + campaign.adSets.filter((adSet) => adSet.mark !== 'removed').length,
        0,
      ),
    },
    counts,
  };
};

// ---------------------------------------------------------------------------
// What the line shows
// ---------------------------------------------------------------------------

export type VersionView = {
  version: CampaignVersion;
  previous: CampaignVersion | null;
  /** The selected version, or — comparing — the selected version marked against the previous. */
  model: CampaignViewModel;
  comparison: VersionComparison | null;
};

/**
 * The version on screen: the one picked (the newest when none is), and with `compare` on, it
 * marked against the one before it. Null when the line has no versions.
 */
export const versionViewOf = (
  line: VersionLine,
  selectedId: string | null,
  compare: boolean,
): VersionView | null => {
  const index = Math.max(
    0,
    selectedId === null
      ? line.versions.length - 1
      : line.versions.findIndex((version) => version.id === selectedId),
  );
  const version = line.versions[index];
  if (!version) return null;
  const previous = index > 0 ? (line.versions[index - 1] ?? null) : null;
  const comparison = compare && previous ? compareVersions(previous.model, version.model) : null;
  return { version, previous, model: comparison?.model ?? version.model, comparison };
};

/** "1 removed · 2 changed" — what Compare found, strongest first. */
export const comparisonSummaryOf = (comparison: VersionComparison): string => {
  const { removed, paused, changed, added } = comparison.counts;
  const parts = [
    removed > 0 ? `${removed} removed` : null,
    paused > 0 ? `${paused} paused` : null,
    changed > 0 ? `${changed} changed` : null,
    added > 0 ? `${added} added` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : 'Same as the version before';
};

/** "Applied in Meta", in the platform's own name. */
export const appliedLabelOf = (model: CampaignViewModel): string => {
  const chip = platformLabelsOf(model.platform).chip;
  return `Applied in ${chip.split(' ')[0]}`;
};
