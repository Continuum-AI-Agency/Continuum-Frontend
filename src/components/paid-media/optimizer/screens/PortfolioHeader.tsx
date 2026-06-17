"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { useOptimizer } from "../OptimizerProvider";
import { ModeChip } from "../OptimizerBits";
import { fmt } from "@/lib/paid-media/optimizer/engine-helpers";
import { OBJECTIVE_LABELS } from "@/lib/paid-media/optimizer/types";
import { cn } from "@/lib/utils";

const BASE = "/paid-media/optimizer";

export function PortfolioHeader({ portfolioId }: { portfolioId: string }) {
  const { getPortfolio } = useOptimizer();
  const pathname = usePathname();
  const pf = getPortfolio(portfolioId);

  if (!pf) {
    return (
      <div className="text-sm text-muted-foreground">
        Portfolio not found.{" "}
        <Link href={`${BASE}/portfolios`} className="underline">
          Back to portfolios
        </Link>
        .
      </div>
    );
  }

  const tabs = [
    { href: `${BASE}/${pf.id}`, label: "Dashboard", active: pathname === `${BASE}/${pf.id}` },
    {
      href: `${BASE}/${pf.id}/reallocation`,
      label: "Reallocation",
      active: pathname.endsWith("/reallocation"),
    },
    {
      href: `${BASE}/${pf.id}/settings`,
      label: "Settings",
      active: pathname.endsWith("/settings"),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={`${BASE}/portfolios`}
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" /> Portfolios
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{pf.name}</h2>
          <p className="text-sm text-muted-foreground">
            {OBJECTIVE_LABELS[pf.objective]} · {pf.snapshots.length} ad sets · plan ${fmt(pf.config.periodBudget)}/mo
          </p>
        </div>
        <ModeChip mode={pf.config.mode} automatic />
      </div>
      <nav className="flex items-center gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              tab.active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
