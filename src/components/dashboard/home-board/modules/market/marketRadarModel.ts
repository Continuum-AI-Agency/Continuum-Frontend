// H12 Market radar: competitor moves on top, trends below.
//
// Competitor moves are the lifecycle feed of the brand's latest stored awareness report (the
// Backend keeps the 50 newest lifecycle events of the scan window there). They are facts, so
// they are ordered by recency alone; a burst from one competitor (fifty variants in one scan)
// is one line, grouped by competitor, event type and UTC day.
//
// Trends are the latest completed generation's. There is no numeric relevance score for a
// trend (`relevance_to_brand` is text), so they are ordered by recency — the day their signal
// window ends — and then by the generation's `confidence`. No competitor prices, no Google
// Trends: neither is read anywhere yet.
import type { AwarenessReportPayload } from '@continuum/contracts';
import { z } from 'zod';
import type { ModuleFrameState } from '@/components/paid-media/optimizer/sections/board/ModuleFrame';
import { mapBackendInsightsResponse } from '@/lib/brand-insights/backend';
import type { BrandInsights } from '@/lib/schemas/brandInsights';

export type CompetitorMove = {
  competitorId: string;
  sourceAdId: string;
  eventType: string;
  /** ISO instant of the event. */
  at: string;
};

export type MoveGroup = {
  key: string;
  competitorId: string;
  eventType: string;
  /** UTC day of the events, YYYY-MM-DD. */
  day: string;
  count: number;
  latestAt: string;
};

export type TrendItem = {
  id: string;
  title: string;
  relevance: string | null;
  confidence: number | null;
  /** The day the trend's signal window ends (else the generation's), YYYY-MM-DD; null if unknown. */
  day: string | null;
  platforms: string[];
};

const feedRowSchema = z.object({
  sourceAdId: z.string().min(1),
  eventType: z.string().min(1),
  eventAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  competitorId: z.string().min(1),
});

export function competitorMovesOf(report: AwarenessReportPayload | null): CompetitorMove[] {
  const feed = report?.blocks.find((block) => block.category === 'lifecycle_feed');
  const rows = (feed?.data as { rows?: unknown } | undefined)?.rows;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const parsed = feedRowSchema.safeParse(row);
    return parsed.success
      ? [
          {
            competitorId: parsed.data.competitorId,
            sourceAdId: parsed.data.sourceAdId,
            eventType: parsed.data.eventType,
            at: parsed.data.eventAt,
          },
        ]
      : [];
  });
}

/** The headline: lifecycle events in the report's feed that happened within the last `days`. */
export function movesInLastDays(moves: CompetitorMove[], now: Date, days = 7): number {
  const since = now.getTime() - days * 86_400_000;
  return moves.filter((move) => Date.parse(move.at) >= since).length;
}

function utcDay(iso: string): string {
  return new Date(Date.parse(iso)).toISOString().slice(0, 10);
}

export function groupMoves(moves: CompetitorMove[]): MoveGroup[] {
  const groups = new Map<string, MoveGroup>();
  for (const move of moves) {
    const day = utcDay(move.at);
    const key = `${move.competitorId}:${move.eventType}:${day}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      if (Date.parse(move.at) > Date.parse(group.latestAt)) group.latestAt = move.at;
    } else {
      groups.set(key, {
        key,
        competitorId: move.competitorId,
        eventType: move.eventType,
        day,
        count: 1,
        latestAt: move.at,
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt) || b.count - a.count,
  );
}

/** A trends read for a brand with no completed generation carries no generation id. */
export function trendsFromReadResponse(payload: unknown): BrandInsights | null {
  const data = (payload as { data?: { generation_id?: unknown } | null } | null)?.data;
  if (!data || data.generation_id == null) return null;
  return mapBackendInsightsResponse(payload);
}

export function trendItemsOf(insights: BrandInsights | null): TrendItem[] {
  if (!insights) return [];
  const { trendsAndEvents } = insights.data;
  const fallback = trendsAndEvents.generatedAt ?? insights.generatedAt ?? null;
  return trendsAndEvents.trends.map((trend) => {
    const at = trend.signalWindowEnd ?? fallback;
    return {
      id: trend.id,
      title: trend.title,
      relevance: trend.relevanceToBrand ?? null,
      confidence: typeof trend.confidence === 'number' ? trend.confidence : null,
      day: at ? at.slice(0, 10) : null,
      platforms: trend.recommendedPlatforms ?? trend.platforms ?? [],
    };
  });
}

/** Recency (day) first, then confidence; unknowns last, then title so the order is stable. */
export function orderTrends(trends: TrendItem[]): TrendItem[] {
  return [...trends].sort(
    (a, b) =>
      (b.day ?? '').localeCompare(a.day ?? '') ||
      (b.confidence ?? -1) - (a.confidence ?? -1) ||
      a.title.localeCompare(b.title),
  );
}

type MoveLabel = { verb: string; singular: string; plural: string };

export const MOVE_LABELS: Record<string, MoveLabel> = {
  new_ad: { verb: 'launched a new ad', singular: 'new ad', plural: 'new ads' },
  resumed: {
    verb: 'resumed an ad',
    singular: 'ad resumed',
    plural: 'ads resumed',
  },
  paused: { verb: 'paused an ad', singular: 'ad paused', plural: 'ads paused' },
  removed: {
    verb: 'removed an ad',
    singular: 'ad removed',
    plural: 'ads removed',
  },
  variant_spawned: {
    verb: 'spun off an ad variant',
    singular: 'new ad variant',
    plural: 'new ad variants',
  },
  copy_changed: {
    verb: 'changed an ad’s copy',
    singular: 'ad copy change',
    plural: 'ad copy changes',
  },
  sustained_hero: {
    verb: 'kept a long-running hero ad',
    singular: 'long-running hero ad',
    plural: 'long-running hero ads',
  },
  volume_spike: {
    verb: 'spiked its ad volume',
    singular: 'ad volume spike',
    plural: 'ad volume spikes',
  },
  creative_theme_shift: {
    verb: 'shifted its creative theme',
    singular: 'creative theme shift',
    plural: 'creative theme shifts',
  },
};

function labelOf(eventType: string): MoveLabel {
  const words = eventType.replaceAll('_', ' ');
  return MOVE_LABELS[eventType] ?? { verb: words, singular: words, plural: words };
}

/** "Smart Fit Mexico launched a new ad" / "Smart Fit Mexico · 3 new ad variants"; without the
 *  competitor's name (the tile does not read it), "3 new ad variants". */
export function moveSentence(group: MoveGroup, competitorName: string | null): string {
  const label = labelOf(group.eventType);
  const counted = `${group.count} ${group.count === 1 ? label.singular : label.plural}`;
  if (!competitorName) return counted;
  return group.count === 1 ? `${competitorName} ${label.verb}` : `${competitorName} · ${counted}`;
}

/** "Nov 3", for a YYYY-MM-DD day. */
export function shortDay(day: string, locale: string = 'en-US'): string {
  return new Date(`${day}T12:00:00.000Z`).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export const MARKET_NOTHING_TRACKED = 'No competitors tracked yet — add them in Brand Spy.';
export const MARKET_NOTHING_READ =
  'No competitor moves or trends read yet — scan your competitors in Brand Spy.';

export function marketTileView(input: {
  loading: boolean;
  failed: boolean;
  reportExists: boolean;
  moves: CompetitorMove[];
  trends: TrendItem[];
}): { state: ModuleFrameState; missing: string | null } {
  if (input.failed) return { state: 'error', missing: null };
  if (input.loading) return { state: 'loading', missing: null };
  if (input.moves.length === 0 && input.trends.length === 0) {
    return {
      state: 'missing',
      missing: input.reportExists ? MARKET_NOTHING_READ : MARKET_NOTHING_TRACKED,
    };
  }
  return { state: 'ready', missing: null };
}
