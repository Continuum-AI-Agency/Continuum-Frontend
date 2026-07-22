import type {
  PaidEntityKpiUnit,
  PaidEntityLevel,
  PaidRankedEntity,
  PaidRankingScope,
} from '@continuum/contracts';
import { buildEntityPathLabel } from '@continuum/contracts';
import type { PersistedCampaignInsight } from '@/lib/paid-media/insight-history-client';

export type PaidLeaderboardRow = {
  id: string;
  name: string;
  subLabel?: string;
  insightLine?: string;
  metricValue: string;
  level?: PaidEntityLevel;
  pathLabel?: string;
};

// Only the fields the leaderboard join needs from a persisted paid insight, so
// this stays a pure, testable mapping with no dependency on the full insight row.
type LeaderboardInsight = Pick<PersistedCampaignInsight, 'campaignId' | 'campaignName' | 'title'>;

function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatKpiValue(value: number, unit: PaidEntityKpiUnit): string {
  switch (unit) {
    case 'currency':
      return formatCurrencyCompact(value);
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'multiplier':
      return `${value.toFixed(2)}x`;
    case 'number':
    default:
      return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
  }
}

function buildSubLabel(entity: PaidRankedEntity, scope: PaidRankingScope): string | undefined {
  if (scope === 'top_adsets') {
    const campaign = entity.labels?.campaign?.trim();
    return campaign ? campaign : undefined;
  }
  const spend = entity.metrics.spend;
  return typeof spend === 'number' ? `${formatCurrencyCompact(spend)} spend` : undefined;
}

// Campaign rows join their persisted insight by campaign_id. Ad-set rows have no
// per-adset persisted insight, so they roll up the parent campaign's insight
// matched by name (the ranked adset row carries labels.campaign = campaign name).
function resolveInsight(
  entity: PaidRankedEntity,
  scope: PaidRankingScope,
  byCampaignId: Map<string, LeaderboardInsight>,
  byCampaignName: Map<string, LeaderboardInsight>,
): LeaderboardInsight | undefined {
  if (scope === 'top_adsets') {
    const campaign = entity.labels?.campaign;
    return campaign ? byCampaignName.get(campaign) : undefined;
  }
  return byCampaignId.get(entity.id);
}

// Prefer the producer's composite path_label; otherwise compose it from the
// structured hierarchy names; otherwise fall back to the legacy campaign label.
function resolvePathLabel(entity: PaidRankedEntity): string | undefined {
  const explicit = entity.path_label?.trim();
  if (explicit) return explicit;
  if (entity.hierarchy) {
    const composed = buildEntityPathLabel(entity.hierarchy).trim();
    if (composed) return composed;
  }
  const campaign = entity.labels?.campaign?.trim();
  return campaign ? campaign : undefined;
}

export function buildPaidLeaderboardRows(params: {
  entities: PaidRankedEntity[];
  insights: LeaderboardInsight[];
  scope: PaidRankingScope;
}): PaidLeaderboardRow[] {
  const byCampaignId = new Map<string, LeaderboardInsight>();
  const byCampaignName = new Map<string, LeaderboardInsight>();
  for (const insight of params.insights) {
    if (insight.campaignId) byCampaignId.set(insight.campaignId, insight);
    if (insight.campaignName) byCampaignName.set(insight.campaignName, insight);
  }

  return params.entities.map((entity) => {
    const insight = resolveInsight(entity, params.scope, byCampaignId, byCampaignName);
    return {
      id: entity.id,
      name: entity.name.trim() || 'Untitled',
      subLabel: buildSubLabel(entity, params.scope),
      insightLine: insight?.title,
      metricValue: formatKpiValue(entity.kpi_value, entity.kpi_unit),
      level: entity.level,
      pathLabel: resolvePathLabel(entity),
    };
  });
}
