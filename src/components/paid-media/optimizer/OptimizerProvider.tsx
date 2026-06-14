"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AdSetSnapshot } from "@continuum/optimization-engine";

import { AD_SET_CATALOG, SAMPLE_PORTFOLIOS } from "@/lib/paid-media/optimizer/sample-data";
import type {
  CatalogAdSet,
  OptimizerPortfolio,
  PortfolioConfig,
} from "@/lib/paid-media/optimizer/types";

type OptimizerContextValue = {
  portfolios: OptimizerPortfolio[];
  catalog: CatalogAdSet[];
  getPortfolio: (id: string) => OptimizerPortfolio | undefined;
  updateConfig: (id: string, patch: Partial<PortfolioConfig>) => void;
  renamePortfolio: (id: string, name: string) => void;
  toggleAdSet: (id: string, adSetId: string) => void;
  addPortfolio: () => string;
};

const OptimizerContext = createContext<OptimizerContextValue | null>(null);

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * In-memory client store for the optimizer. Seeded from the bundled sample data.
 * Edits (settings, ad set selection) live only for the session — Supabase
 * persistence is intentionally out of scope for this PR.
 */
export function OptimizerProvider({ children }: { children: ReactNode }) {
  const [portfolios, setPortfolios] = useState<OptimizerPortfolio[]>(() =>
    deepClone(SAMPLE_PORTFOLIOS),
  );

  const getPortfolio = useCallback(
    (id: string) => portfolios.find((p) => p.id === id),
    [portfolios],
  );

  const updateConfig = useCallback((id: string, patch: Partial<PortfolioConfig>) => {
    setPortfolios((prev) =>
      prev.map((p) => (p.id === id ? { ...p, config: { ...p.config, ...patch } } : p)),
    );
  }, []);

  const renamePortfolio = useCallback((id: string, name: string) => {
    setPortfolios((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  const toggleAdSet = useCallback((id: string, adSetId: string) => {
    setPortfolios((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const exists = p.snapshots.some((s) => s.id === adSetId);
        if (exists) {
          // Keep at least one ad set in a portfolio.
          if (p.snapshots.length <= 1) return p;
          return { ...p, snapshots: p.snapshots.filter((s) => s.id !== adSetId) };
        }
        const fromCatalog = AD_SET_CATALOG.find((c) => c.id === adSetId);
        if (!fromCatalog) return p;
        // Drop the catalog-only `cpi` field; engine snapshots don't carry it.
        const snapshot = deepClone(fromCatalog) as AdSetSnapshot & { cpi?: number };
        delete snapshot.cpi;
        snapshot.status = "active";
        return { ...p, snapshots: [...p.snapshots, snapshot] };
      }),
    );
  }, []);

  const addPortfolio = useCallback(() => {
    const id = `pf-new-${Math.round(Date.now())}`;
    const fresh: OptimizerPortfolio = {
      id,
      name: "New portfolio",
      objective: "Purchases",
      currency: "MXN",
      config: {
        mode: "balanced",
        periodBudget: 300000,
        dailyBudget: 10000,
        velocityCap: 30,
        cpaTarget: 100,
      },
      snapshots: [],
    };
    setPortfolios((prev) => [...prev, fresh]);
    return id;
  }, []);

  const value = useMemo<OptimizerContextValue>(
    () => ({
      portfolios,
      catalog: AD_SET_CATALOG,
      getPortfolio,
      updateConfig,
      renamePortfolio,
      toggleAdSet,
      addPortfolio,
    }),
    [portfolios, getPortfolio, updateConfig, renamePortfolio, toggleAdSet, addPortfolio],
  );

  return <OptimizerContext.Provider value={value}>{children}</OptimizerContext.Provider>;
}

export function useOptimizer(): OptimizerContextValue {
  const ctx = useContext(OptimizerContext);
  if (!ctx) {
    throw new Error("useOptimizer must be used within an OptimizerProvider");
  }
  return ctx;
}
