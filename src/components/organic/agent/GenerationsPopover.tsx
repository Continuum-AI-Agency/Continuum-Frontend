"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, X, XCircle } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getApiBaseUrl } from "@/lib/api/config";
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken";
import { useCalendarStore, type GenerationEntry, type GenerationStatus } from "@/lib/organic/store";
import { cn } from "@/lib/utils";

type Props = {
  brandId: string | null;
  onViewDraftAction?: (draftId: string) => void;
};

const STATUS_RANK: Record<GenerationStatus, number> = {
  running: 0,
  queued: 1,
  completed: 2,
  failed: 3,
  cancelled: 4,
};

const isActive = (status: GenerationStatus): boolean => status === "running" || status === "queued";

function formatStage(stage: string | null | undefined): string {
  if (!stage) return "";
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function cancelGeneration(jobId: string, brandId: string): Promise<void> {
  try {
    const token = await getBrowserAccessToken();
    await fetch(`${getApiBaseUrl()}/api/organic/agent/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ brandId }),
    });
  } catch {
    // Best-effort: the run also stops on its own deadline if the request fails.
  }
}

function StatusIcon({ status }: { status: GenerationStatus }) {
  if (isActive(status)) return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />;
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "failed") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function GenerationRow({
  entry,
  brandId,
  onViewDraftAction,
}: {
  entry: GenerationEntry;
  brandId: string | null;
  onViewDraftAction?: (draftId: string) => void;
}) {
  const active = isActive(entry.status);
  const pct = Math.max(5, Math.min(100, entry.pct ?? (entry.status === "queued" ? 5 : 10)));
  const label = active ? formatStage(entry.stage) || "Working" : entry.status;

  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-2 py-1.5 last:border-b-0">
      <StatusIcon status={entry.status} />

      <HoverCard openDelay={120}>
        <HoverCardTrigger asChild>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="h-4 px-1 text-[10px] capitalize">
                {entry.platform ?? "post"}
              </Badge>
              <span className="truncate text-[11px] capitalize text-muted-foreground">{label}</span>
            </div>
            {active && <Progress value={pct} className="h-1" />}
          </div>
        </HoverCardTrigger>
        {entry.previewUrl && (
          <HoverCardContent align="start" className="w-48 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.previewUrl} alt="Preview" className="aspect-square w-full rounded object-cover" />
            {typeof entry.quality === "number" && (
              <p className="px-1 pt-1 text-[10px] text-muted-foreground">Quality {Math.round(entry.quality)}%</p>
            )}
          </HoverCardContent>
        )}
      </HoverCard>

      {entry.status === "completed" && typeof entry.quality === "number" && (
        <Badge variant="outline" className="h-4 px-1 text-[10px]">{Math.round(entry.quality)}%</Badge>
      )}

      {active && brandId && (
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => void cancelGeneration(entry.jobId, brandId)}
          aria-label="Abort generation"
        >
          <X className="h-3 w-3" />
        </Button>
      )}

      {entry.status === "completed" && entry.draftId && onViewDraftAction && (
        <Button
          size="sm"
          variant="ghost"
          className="h-5 shrink-0 px-1.5 text-[10px] text-muted-foreground"
          onClick={() => onViewDraftAction(entry.draftId as string)}
        >
          Open
        </Button>
      )}
    </div>
  );
}

export function GenerationsPopover({ brandId, onViewDraftAction }: Props) {
  const [open, setOpen] = useState(false);
  const generations = useCalendarStore(useShallow((s) => s.generations));

  const entries = useMemo(
    () =>
      Object.values(generations).sort(
        (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.updatedAt - a.updatedAt,
      ),
    [generations],
  );

  if (entries.length === 0) return null;

  const runningCount = entries.filter((e) => isActive(e.status)).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          {runningCount > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
          ) : (
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          )}
          {entries.length} {entries.length === 1 ? "generation" : "generations"}
          {runningCount > 0 && <span className="text-muted-foreground">· {runningCount} running</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Generations
          </p>
        </div>
        <ScrollArea className="max-h-80">
          {entries.map((entry) => (
            <GenerationRow
              key={entry.jobId}
              entry={entry}
              brandId={brandId}
              onViewDraftAction={onViewDraftAction}
            />
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
