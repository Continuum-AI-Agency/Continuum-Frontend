// The companion canvas's read-only view of a pending Jaina edit on a LIVE campaign
// (`paid.live_change_preview`). Pure: the tree, the summary line and the cell text, so the
// component only lays them out. The approval itself stays on the chat card.

import {
  formatMoney,
  type LiveChangeNode,
  type LiveChangePreviewPayload,
  type LiveChangeRow,
} from '@continuum/contracts';

export type LiveChangeDecision = 'pending' | 'approved' | 'denied';

export type LiveChangeAdSet = {
  node: LiveChangeNode;
  ads: LiveChangeNode[];
  /** Its own mark is unchanged but its campaign is being paused, so it stops too. */
  stopsWithParent: boolean;
};

export type LiveChangeCampaign = { node: LiveChangeNode; adSets: LiveChangeAdSet[] };

/** Campaign → ad sets → ads, in the payload's order (a copy right after its source). */
export const liveChangeTreeOf = (payload: LiveChangePreviewPayload): LiveChangeCampaign[] => {
  const childrenOf = (id: string) => payload.nodes.filter((node) => node.parentId === id);
  return payload.nodes
    .filter((node) => node.level === 'campaign')
    .map((campaign) => ({
      node: campaign,
      adSets: childrenOf(campaign.id)
        .filter((node) => node.level === 'adset')
        .map((adSet) => ({
          node: adSet,
          ads: childrenOf(adSet.id).filter((node) => node.level === 'ad'),
          stopsWithParent: campaign.mark === 'paused' && adSet.mark === 'unchanged',
        })),
    }));
};

/** An ad stops with its ad set or campaign when either is being paused. */
export const adStopsWithParent = (adSet: LiveChangeAdSet, ad: LiveChangeNode): boolean =>
  ad.mark === 'unchanged' && (adSet.node.mark === 'paused' || adSet.stopsWithParent);

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "1 pause · 1 change · 3 new, paused" — the line above the tree. */
export const liveChangeSummaryOf = (payload: LiveChangePreviewPayload): string => {
  const { paused, changed, added } = payload.counts;
  const parts = [
    paused > 0 ? plural(paused, 'pause', 'pauses') : null,
    changed > 0 ? plural(changed, 'change', 'changes') : null,
    added > 0 ? `${added} new, paused` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : 'No change on this campaign';
};

const MONEY_FIELDS = new Set(['daily_budget', 'lifetime_budget', 'bid_amount']);

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  name: 'Name',
  daily_budget: 'Daily budget',
  lifetime_budget: 'Lifetime budget',
  bid_amount: 'Bid',
  bid_strategy: 'Bid strategy',
  placements: 'Placements',
  audience: 'Audience',
  countries: 'Countries',
  advantage_audience: 'Advantage+ audience',
  optimization_goal: 'Optimization goal',
};

export const liveChangeFieldLabel = (field: string): string =>
  FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** A before or after cell. Budgets travel in minor units and read as money. */
export const liveChangeValueText = (
  row: LiveChangeRow,
  side: 'before' | 'after',
  currency: string | null,
): string => {
  const value = row[side];
  if (value === null || value === '') return 'none';
  if (MONEY_FIELDS.has(row.field) && typeof value === 'number') {
    return formatMoney(value / 100, currency);
  }
  return String(value);
};

/** A node's own daily budget, as money, or null when it has none of its own. */
export const liveChangeBudgetText = (
  node: LiveChangeNode,
  currency: string | null,
): string | null =>
  node.dailyBudgetMinor === null
    ? null
    : `${formatMoney(node.dailyBudgetMinor / 100, currency)}/day`;

type LiveChangeThreadMessage = {
  liveChangePreviews?: readonly LiveChangePreviewPayload[];
  resolvedApprovals?: Readonly<Record<string, { decision: 'approved' | 'denied' }>>;
};

/** Where an approval stands across the thread: the last resolution wins, else pending. */
export const liveChangeDecisionOf = (
  messages: readonly LiveChangeThreadMessage[],
  approvalId: string,
): LiveChangeDecision => {
  let decision: LiveChangeDecision = 'pending';
  for (const message of messages) {
    const resolved = message.resolvedApprovals?.[approvalId];
    if (resolved) decision = resolved.decision;
  }
  return decision;
};

/** The newest preview across the thread, and the decision on its approval. */
export const latestLiveChangeOf = (
  messages: readonly LiveChangeThreadMessage[],
): { preview: LiveChangePreviewPayload; decision: LiveChangeDecision; index: number } | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const previews = messages[index]?.liveChangePreviews ?? [];
    const preview = previews[previews.length - 1];
    if (!preview) continue;
    return { preview, decision: liveChangeDecisionOf(messages, preview.approvalId), index };
  }
  return null;
};

/** One preview of the thread by its part id — what a chat card's "Open in canvas" opens. */
export const liveChangeByPartIdOf = (
  messages: readonly LiveChangeThreadMessage[],
  partId: string,
): { preview: LiveChangePreviewPayload; decision: LiveChangeDecision } | null => {
  for (const message of messages) {
    const preview = message.liveChangePreviews?.find((entry) => entry.partId === partId);
    if (preview) return { preview, decision: liveChangeDecisionOf(messages, preview.approvalId) };
  }
  return null;
};
