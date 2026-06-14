"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useOptimizer } from "./OptimizerProvider";
import { pendingCount, runPortfolioCycle } from "@/lib/paid-media/optimizer/engine-helpers";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const BASE = "/paid-media/optimizer";

export function OptimizerNav() {
  const pathname = usePathname();
  const { portfolios } = useOptimizer();

  const pending = portfolios.reduce(
    (acc, pf) => acc + pendingCount(runPortfolioCycle(pf)),
    0,
  );

  const tabs: { href: string; label: string; active: boolean; showPending?: boolean }[] = [
    { href: BASE, label: "Overview", active: pathname === BASE },
    {
      href: `${BASE}/portfolios`,
      label: "Portfolios",
      active: pathname.startsWith(`${BASE}/portfolios`),
    },
    {
      href: `${BASE}/actions`,
      label: "Actions",
      active: pathname.startsWith(`${BASE}/actions`),
      showPending: true,
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Budget Optimizer</h1>
        <Badge variant="violet">Beta</Badge>
      </div>
      <nav className="flex items-center gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
              tab.active
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.showPending && pending > 0 ? (
              <Badge variant="secondary">{pending}</Badge>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
