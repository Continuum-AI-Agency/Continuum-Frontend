"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdSetSnapshot, ItemDiagnostics } from "@continuum/optimization-engine";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TableCell } from "@/components/ui/table";
import { shortName } from "@/lib/paid-media/optimizer/engine-helpers";
import { cn } from "@/lib/utils";

type Tone = "default" | "ok" | "warn" | "bad";

const toneClass: Record<Tone, string> = {
  default: "text-foreground",
  ok: "text-[var(--cs-success,#53a88a)]",
  warn: "text-amber-700 dark:text-amber-500",
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
      <span className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-500">
        starved
      </span>
    );
  }
  if (status === "grace") {
    return <Badge variant="secondary">grace</Badge>;
  }
  return null;
}

/** Ad-set name table cell: truncated name + audience + status chips. */
export function AdSetNameCell({
  item,
  snap,
}: {
  item: ItemDiagnostics;
  snap?: AdSetSnapshot;
}) {
  return (
    <TableCell>
      <div className="flex items-center gap-1.5">
        <span className="truncate font-medium">{shortName(snap?.name ?? item.id)}</span>
        <AudienceChip type={snap?.audienceType} />
        <StatusChip status={item.status} />
      </div>
    </TableCell>
  );
}

export function TrajectoryChip({ state }: { state: ItemDiagnostics["trajectoryState"] }) {
  if (state === "positive") return <Badge variant="success">↑ improving</Badge>;
  if (state === "negative") return <Badge variant="destructive">↓ declining</Badge>;
  return <Badge variant="secondary">→ stable</Badge>;
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

/**
 * Numeric input that keeps a local string buffer so the field can be cleared
 * and edited freely (a controlled `value={number}` would snap back to 0 on
 * empty). Commits a parsed number only for valid input.
 */
export function NumberField({
  value,
  onCommit,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  onCommit: (next: number) => void;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(() => String(value));

  // Re-sync only when the external value differs from what the buffer already
  // represents. Our own per-keystroke commits round-trip back through `value`,
  // and a blind setText would clobber partial input like "10." or "007".
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      value={text}
      className={className}
      aria-label={ariaLabel}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "" || /^-?\d*\.?\d*$/.test(next)) {
          setText(next);
          if (next !== "" && next !== "-" && next !== "." && Number.isFinite(Number(next))) {
            onCommit(Number(next));
          }
        }
      }}
    />
  );
}

/** Empty state shown when a portfolio has no ad sets selected yet. */
export function EmptyPortfolioState({ settingsHref }: { settingsHref: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 pt-6">
        <div>
          <p className="text-sm font-medium">No ad sets yet</p>
          <p className="text-sm text-muted-foreground">
            This portfolio has no ad sets selected, so there is nothing to reallocate.
            Add ad sets in Settings to generate a proposal.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={settingsHref}>Go to Settings</Link>
        </Button>
      </CardContent>
    </Card>
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
