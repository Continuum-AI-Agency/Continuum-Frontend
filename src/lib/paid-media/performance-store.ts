"use client";

import { create } from "zustand";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BudgetPacingResponse } from "@/lib/schemas/budgetPacing";
import type { PaidMetricsRange } from "@/lib/schemas/paidMetrics";
import type {
  CampaignPerformanceRow,
  PaidMediaPlatform,
} from "@/lib/paid-media/performance-types";

type CacheStatus = "idle" | "loading" | "success" | "error";

type CampaignPerformanceEntry = {
  status: CacheStatus;
  data: CampaignPerformanceRow[];
  error?: string;
  updatedAt?: number;
};

type BudgetPacingEntry = {
  status: CacheStatus;
  data?: BudgetPacingResponse;
  error?: string;
  updatedAt?: number;
};

type LoadOptions = {
  force?: boolean;
};

type CampaignPerformanceParams = {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  range: PaidMetricsRange;
};

type BudgetPacingParams = {
  brandId: string;
  adAccountId: string;
};

type PaidMediaPerformanceState = {
  campaigns: Record<string, CampaignPerformanceEntry>;
  budgetPacing: Record<string, BudgetPacingEntry>;
  loadCampaignPerformance: (
    params: CampaignPerformanceParams,
    options?: LoadOptions
  ) => Promise<CampaignPerformanceRow[]>;
  loadBudgetPacing: (
    params: BudgetPacingParams,
    options?: LoadOptions
  ) => Promise<BudgetPacingResponse>;
  invalidateCampaignPerformance: (key: string) => void;
  invalidateBudgetPacing: (key: string) => void;
  reset: () => void;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

function isFresh(updatedAt: number | undefined): boolean {
  return typeof updatedAt === "number" && Date.now() - updatedAt < CACHE_TTL_MS;
}

function rangeKey(range: PaidMetricsRange): string {
  if (range.preset !== "custom") return range.preset;
  return `custom:${range.since}:${range.until}`;
}

export function makeCampaignPerformanceKey(params: CampaignPerformanceParams): string {
  return [
    params.brandId,
    params.adAccountId,
    params.platform,
    rangeKey(params.range),
  ].join(":");
}

export function makeBudgetPacingKey(params: BudgetPacingParams): string {
  return [params.brandId, params.adAccountId, "budget-pacing"].join(":");
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<U>
): Promise<U[]> {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
  const results = new Array<U>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: safeLimit }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index]);
      }
    })
  );

  return results;
}

export const usePaidMediaPerformanceStore = create<PaidMediaPerformanceState>((set, get) => ({
  campaigns: {},
  budgetPacing: {},

  loadCampaignPerformance: async (params, options) => {
    const key = makeCampaignPerformanceKey(params);
    const existing = get().campaigns[key];

    if (!options?.force && existing?.status === "success" && isFresh(existing.updatedAt)) {
      return existing.data;
    }

    if (!options?.force && existing?.status === "loading") {
      return existing.data;
    }

    set((state) => ({
      campaigns: {
        ...state.campaigns,
        [key]: {
          status: "loading",
          data: existing?.data ?? [],
        },
      },
    }));

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.functions.invoke(
        `fetch-meta-campaigns?brandId=${params.brandId}&adAccountId=${params.adAccountId}`,
        {
          method: "POST",
          body: {
            brandId: params.brandId,
            adAccountId: params.adAccountId,
          },
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      const rawCampaigns = Array.isArray(data?.campaigns)
        ? (data.campaigns as CampaignPerformanceRow[])
        : [];

      const campaigns = await mapWithConcurrency(rawCampaigns, 6, async (campaign) => {
        try {
          const response = await fetch("/api/paid-metrics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platform: params.platform,
              brandId: params.brandId,
              accountId: params.adAccountId,
              campaignId: campaign.id,
              range: params.range,
            }),
          });

          if (!response.ok) return campaign;

          const metrics = await response.json();
          return {
            ...campaign,
            metrics: metrics.metrics,
            comparison: metrics.comparison,
            trends: metrics.trends,
          };
        } catch {
          return campaign;
        }
      });

      set((state) => ({
        campaigns: {
          ...state.campaigns,
          [key]: {
            status: "success",
            data: campaigns,
            updatedAt: Date.now(),
          },
        },
      }));

      return campaigns;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load campaign performance";
      set((state) => ({
        campaigns: {
          ...state.campaigns,
          [key]: {
            status: "error",
            data: existing?.data ?? [],
            error: message,
            updatedAt: existing?.updatedAt,
          },
        },
      }));
      throw error;
    }
  },

  loadBudgetPacing: async (params, options) => {
    const key = makeBudgetPacingKey(params);
    const existing = get().budgetPacing[key];

    if (!options?.force && existing?.status === "success" && existing.data && isFresh(existing.updatedAt)) {
      return existing.data;
    }

    set((state) => ({
      budgetPacing: {
        ...state.budgetPacing,
        [key]: {
          status: "loading",
          data: existing?.data,
        },
      },
    }));

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/paid-media/budget-pacing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ brandId: params.brandId, adAccountId: params.adAccountId }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data = (await response.json()) as BudgetPacingResponse;
      set((state) => ({
        budgetPacing: {
          ...state.budgetPacing,
          [key]: {
            status: "success",
            data,
            updatedAt: Date.now(),
          },
        },
      }));
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load budget pacing";
      set((state) => ({
        budgetPacing: {
          ...state.budgetPacing,
          [key]: {
            status: "error",
            data: existing?.data,
            error: message,
            updatedAt: existing?.updatedAt,
          },
        },
      }));
      throw error;
    }
  },

  invalidateCampaignPerformance: (key) =>
    set((state) => {
      const next = { ...state.campaigns };
      delete next[key];
      return { campaigns: next };
    }),

  invalidateBudgetPacing: (key) =>
    set((state) => {
      const next = { ...state.budgetPacing };
      delete next[key];
      return { budgetPacing: next };
    }),

  reset: () => set({ campaigns: {}, budgetPacing: {} }),
}));

