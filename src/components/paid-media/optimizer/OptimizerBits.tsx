"use client";

import type { ItemDiagnostics } from "@continuum/optimization-engine";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "default" | "ok" | "warn" | "bad";

const toneClass: Record<Tone, string> = {
  default: "text-foreground",
  ok: "text-[var(--cs-success,#53a88a)]",
  warn: "text-amber-600 dark:text-amber-500",
  bad: "text-destructive",
};

export function KpiCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("text-2xl font-semibold tabular-nums", toneClass[tone])}>{value}</span>
        {sub ? <span className="text-[11px] text-muted-foreground">{sub}</span> : null}
      </CardContent>
    </Card>
  );
}

export function ModeChip({ mode, automatic = false }: { mode: string; automatic?: boolean }) {
  const label = mode.charAt(0).toUpperCase() + mode.slice(1);
  return (
    <Badge variant="violet">
      {automatic ? "⚡ Automatic · " : ""}
      {label}
    </Badge>
  );
}

export function AudienceChip({ type }: { type?: string }) {
  if (type === "remarketing") return <Badge variant="violet">rmkt</Badge>;
  if (type === "prospecting") return <Badge variant="teal">prosp</Badge>;
  if (type === "retargeting") return <Badge variant="outline">rtgt</Badge>;
  return null;
}

export function StatusChip({ status }: { status: string }) {
  if (status === "starved") {
    return (
      <span className="shrink-0 text-[11px] font-semibold text-amber-600 dark:text-amber-500">
        starved
      </span>
    );
  }
  if (status === "grace") {
    return <Badge variant="secondary">grace</Badge>;
  }
  return null;
}

export function TrajectoryChip({ state }: { state: ItemDiagnostics["trajectoryState"] }) {
  if (state === "positive") return <Badge variant="success">↑ improving</Badge>;
  if (state === "negative") return <Badge variant="destructive">↓ declining</Badge>;
  return <Badge variant="secondary">→ stable</Badge>;
}

export function ConservationBadge({ conserved }: { conserved: boolean }) {
  return conserved ? (
    <Badge variant="success">✓ exact</Badge>
  ) : (
    <Badge variant="destructive">⚠ check</Badge>
  );
}

export function DeltaPct({ pct }: { pct: number }) {
  const tone = pct > 0.5 ? "ok" : pct < -0.5 ? "bad" : "default";
  return (
    <span className={cn("tabular-nums", toneClass[tone])}>
      {pct > 0 ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  );
}

/** Horizontal bar: fill to `proposedPct`, optional marker at `currentPct`. */
export function ShareBar({
  proposedPct,
  currentPct,
}: {
  proposedPct: number;
  currentPct?: number;
}) {
  return (
    <div className="relative h-4 w-full overflow-hidden rounded bg-muted">
      <div
        className="absolute inset-y-0 left-0 rounded bg-primary/70"
        style={{ width: `${Math.max(0, Math.min(100, proposedPct))}%` }}
      />
      {currentPct !== undefined ? (
        <div
          className="absolute inset-y-0 w-0.5 bg-foreground/70"
          style={{ left: `${Math.max(0, Math.min(100, currentPct))}%` }}
        />
      ) : null}
    </div>
  );
}

/** Pacing bar centered on plan; marker at 50%, fill scales with % vs plan. */
export function PacingBar({ pctVsPlan }: { pctVsPlan: number }) {
  const fill = Math.max(2, Math.min(98, 50 + pctVsPlan * 4));
  const over = pctVsPlan > 3;
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded bg-muted">
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded",
          over ? "bg-amber-500" : "bg-primary/70",
        )}
        style={{ width: `${fill}%` }}
      />
      <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-foreground/60" />
    </div>
  );
}
