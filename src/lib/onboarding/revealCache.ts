"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AgentPreviewBuckets } from "@/components/onboarding/v2/state/agentPreview";
import type { ScrapeResult } from "@/lib/onboarding/scrape";

export const REVEAL_PROMPT_VERSION = 1;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export type RevealCacheEntry = {
  buckets: AgentPreviewBuckets;
  scrape: ScrapeResult | null;
  runId: string | null;
  inputHash: string | null;
  cachedAt: number;
  expiresAt: number;
};

type RevealCacheState = {
  entries: Record<string, RevealCacheEntry>;
};

type RevealCacheActions = {
  read: (brandId: string, websiteUrl: string) => RevealCacheEntry | null;
  write: (
    brandId: string,
    websiteUrl: string,
    entry: { buckets: AgentPreviewBuckets; scrape: ScrapeResult | null; runId?: string | null; inputHash?: string | null }
  ) => void;
  invalidateBrand: (brandId: string) => void;
  invalidateUrl: (brandId: string, websiteUrl: string) => void;
  clear: () => void;
};

export function makeRevealCacheKey(brandId: string, websiteUrl: string): string {
  return `${brandId}::${normalizeUrl(websiteUrl)}::v${REVEAL_PROMPT_VERSION}`;
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";
  try {
    const url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
    return `${url.hostname}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return trimmed;
  }
}

export const useBrandProfileRevealCache = create<RevealCacheState & RevealCacheActions>()(
  persist(
    (set, get) => ({
      entries: {},
      read: (brandId, websiteUrl) => {
        const key = makeRevealCacheKey(brandId, websiteUrl);
        const entry = get().entries[key];
        if (!entry) return null;
        if (entry.expiresAt < Date.now()) {
          set((state) => {
            const next = { ...state.entries };
            delete next[key];
            return { entries: next };
          });
          return null;
        }
        return entry;
      },
      write: (brandId, websiteUrl, { buckets, scrape, runId = null, inputHash = null }) => {
        const key = makeRevealCacheKey(brandId, websiteUrl);
        const now = Date.now();
        set((state) => ({
          entries: {
            ...state.entries,
            [key]: {
              buckets,
              scrape,
              runId,
              inputHash,
              cachedAt: now,
              expiresAt: now + TWENTY_FOUR_HOURS_MS,
            },
          },
        }));
      },
      invalidateBrand: (brandId) => {
        set((state) => {
          const next: Record<string, RevealCacheEntry> = {};
          for (const [k, v] of Object.entries(state.entries)) {
            if (!k.startsWith(`${brandId}::`)) next[k] = v;
          }
          return { entries: next };
        });
      },
      invalidateUrl: (brandId, websiteUrl) => {
        const key = makeRevealCacheKey(brandId, websiteUrl);
        set((state) => {
          if (!state.entries[key]) return state;
          const next = { ...state.entries };
          delete next[key];
          return { entries: next };
        });
      },
      clear: () => set({ entries: {} }),
    }),
    {
      name: "continuum:onboarding:reveal-cache:v1",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? noopStorage : window.sessionStorage
      ),
      partialize: (state) => ({ entries: state.entries }),
    }
  )
);

const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};
