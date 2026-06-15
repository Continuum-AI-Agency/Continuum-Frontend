"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
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
  /** Whether a proposed action (by stable key) has been approved this session. */
  isActionApproved: (key: string) => boolean;
  approveAction: (key: string) => void;
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
  // Monotonic counter for new-portfolio ids (avoids Date.now() collisions on fast clicks).
  const newPortfolioCounter = useRef(0);

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
    newPortfolioCounter.current += 1;
    const id = `pf-new-${newPortfolioCounter.current}`;
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

  // Approval state lives here so approving in Actions or Reallocation reflects
  // everywhere (the other screen, the nav "pending" badge). Session-only.
  const [approvedActions, setApprovedActions] = useState<Set<string>>(() => new Set());
  const isActionApproved = useCallback(
    (key: string) => approvedActions.has(key),
    [approvedActions],
  );
  const approveAction = useCallback((key: string) => {
    setApprovedActions((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
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
      isActionApproved,
      approveAction,
    }),
    [
      portfolios,
      getPortfolio,
      updateConfig,
      renamePortfolio,
      toggleAdSet,
      addPortfolio,
      isActionApproved,
      approveAction,
    ],
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
