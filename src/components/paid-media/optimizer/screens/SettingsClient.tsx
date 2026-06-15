"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { useOptimizer } from "../OptimizerProvider";
import { AudienceChip, NumberField } from "../OptimizerBits";
import { fmt, shortName } from "@/lib/paid-media/optimizer/engine-helpers";
import { MONTH, type OptimizationMode } from "@/lib/paid-media/optimizer/types";
import type { AdSetSnapshot } from "@continuum/optimization-engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const BASE = "/paid-media/optimizer";

const MODES: { value: OptimizationMode; label: string; hint: string }[] = [
  { value: "efficiency", label: "Efficiency", hint: "ceiling, may underspend" },
  { value: "balanced", label: "Balanced", hint: "spend the exact plan" },
  { value: "scale", label: "Scale", hint: "grow if target met" },
];

const cpiOfSnap = (s: AdSetSnapshot): number =>
  s.windows.d14.purchases > 0 ? s.windows.d14.spend / s.windows.d14.purchases : 0;

export function SettingsClient({ portfolioId }: { portfolioId: string }) {
  const { getPortfolio, catalog, updateConfig, renamePortfolio, toggleAdSet } = useOptimizer();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const pf = getPortfolio(portfolioId);

  const rows = useMemo(() => {
    if (!pf) return [];
    const selected = new Set(pf.snapshots.map((s) => s.id));
    // Selected ad sets first, then the rest of the account catalog.
    const merged: { snap: AdSetSnapshot; selected: boolean }[] = pf.snapshots.map((snap) => ({
      snap,
      selected: true,
    }));
    for (const cat of catalog) {
      if (!selected.has(cat.id)) merged.push({ snap: cat, selected: false });
    }
    const q = search.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter(({ snap }) =>
      `${shortName(snap.name ?? "")} ${snap.name ?? ""} ${snap.id}`.toLowerCase().includes(q),
    );
  }, [pf, catalog, search]);

  if (!pf) return null;

  return (
    <Card>
      <CardContent className="flex max-w-2xl flex-col gap-5 pt-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pf-name" className="text-xs text-muted-foreground">
            Portfolio name
          </label>
          <Input
            id="pf-name"
            value={pf.name}
            onChange={(e) => renamePortfolio(pf.id, e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold">
            Ad sets{" "}
            <span className="font-normal text-muted-foreground">
              — search by name or ad set ID to add
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ad set ID…"
              className="pl-8"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {pf.snapshots.length} selected · {catalog.length} available in account
          </div>
          <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {rows.map(({ snap, selected }) => {
              const cpi = cpiOfSnap(snap);
              return (
                <label
                  key={snap.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleAdSet(pf.id, snap.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{shortName(snap.name ?? snap.id)}</span>
                      <AudienceChip type={snap.audienceType} />
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">ID {snap.id}</div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground tabular-nums">
                    ${fmt(snap.currentBudget)}
                  </div>
                  <div className="w-12 text-right text-xs tabular-nums">
                    {cpi > 0 ? `$${cpi.toFixed(0)}` : "–"}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold">Budget &amp; schedule</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Period total budget (${pf.currency})`}>
              <NumberField
                value={pf.config.periodBudget}
                onCommit={(n) => updateConfig(pf.id, { periodBudget: n })}
              />
            </Field>
            <Field label="Period">
              <Input value="Jun 1 – Jun 30, 2026" disabled />
            </Field>
            <Field label={`Daily budget (${pf.currency})`}>
              <NumberField
                value={pf.config.dailyBudget}
                onCommit={(n) => updateConfig(pf.id, { dailyBudget: n })}
              />
            </Field>
            <Field label="Implied from plan">
              <Input value={`$${fmt(pf.config.periodBudget / MONTH.days)} / day`} disabled />
            </Field>
          </div>
        </div>

        <Field
          label={
            <>
              Velocity cap (± per cycle):{" "}
              <span className="font-medium text-foreground">{pf.config.velocityCap}%</span>
            </>
          }
        >
          <Slider
            value={[pf.config.velocityCap]}
            min={10}
            max={60}
            step={1}
            onValueChange={(v) => updateConfig(pf.id, { velocityCap: v[0] ?? pf.config.velocityCap })}
            aria-label="Velocity cap"
          />
        </Field>

        <Field label={`Target CPA / CPI (${pf.currency})`}>
          <NumberField
            value={pf.config.cpaTarget}
            onCommit={(n) => updateConfig(pf.id, { cpaTarget: n })}
            className="max-w-40"
          />
        </Field>

        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold">Optimization mode</div>
          <div className="inline-flex w-full rounded-lg border bg-muted/40 p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => updateConfig(pf.id, { mode: m.value })}
                className={cn(
                  "flex flex-1 flex-col items-center rounded-md px-2 py-1.5 text-xs transition-colors",
                  pf.config.mode === m.value
                    ? "bg-background font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{m.label}</span>
                <span className="text-[10px] font-normal opacity-70">{m.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            <div className="text-sm font-medium">Reallocation runs automatically</div>
            <div className="text-xs text-muted-foreground">
              Daily cycle · pauses always need approval
            </div>
          </div>
          <Button onClick={() => router.push(`${BASE}/${pf.id}`)}>Save portfolio</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
