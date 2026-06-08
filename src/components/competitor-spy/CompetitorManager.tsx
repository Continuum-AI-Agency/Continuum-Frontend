"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CompetitorSpyStreamFrame } from "@continuum/contracts";
import { useCompetitors, useCreateCompetitor, useDeleteCompetitor } from "@/lib/api/competitorSpy";
import { streamCompetitorSync } from "@/lib/api/competitorSpyStream";

const INPUT_CLASS = "rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm";
const BTN_CLASS =
  "rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50";

function describeFrame(frame: CompetitorSpyStreamFrame): string {
  switch (frame.type) {
    case "competitor_started":
      return `Syncing ${frame.data.competitorName} (${frame.data.index + 1}/${frame.data.total})…`;
    case "snapshot_diff":
      return `Found ${frame.data.fetched} ads (${frame.data.inserted} new)…`;
    case "media_extracted":
      return "Fetching creatives…";
    case "creative_analyzed":
      return "Analyzing creatives…";
    case "awareness_block":
      return "Building awareness report…";
    case "run_completed":
      return `Done — ${frame.data.snapshotsInserted} new, ${frame.data.analysisCompleted} analyzed.`;
    case "run_error":
      return `Error: ${frame.data.message}`;
    default:
      return "Working…";
  }
}

export function CompetitorManager({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const { data: competitors, isLoading } = useCompetitors(brandId);
  const create = useCreateCompetitor(brandId);
  const remove = useDeleteCompetitor(brandId);

  const [name, setName] = useState("");
  const [pageId, setPageId] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), metaPageId: pageId.trim() || undefined },
      {
        onSuccess: () => {
          setName("");
          setPageId("");
        },
      },
    );
  };

  const runSync = async () => {
    if (running) return;
    setRunning(true);
    setProgress("Starting sync…");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamCompetitorSync({
        brandId,
        signal: ac.signal,
        onFrame: (frame) => setProgress(describeFrame(frame)),
      });
    } catch {
      setProgress("Sync failed.");
    } finally {
      setRunning(false);
      void qc.invalidateQueries({ queryKey: ["competitor-spy"] });
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Competitor name</span>
          <input className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Meta Page ID (optional)</span>
          <input className={INPUT_CLASS} value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="123456789" />
        </label>
        <button type="submit" className={BTN_CLASS} disabled={create.isPending || !name.trim()}>
          {create.isPending ? "Adding…" : "Add competitor"}
        </button>
      </form>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tracked competitors</h3>
        <button onClick={runSync} className={BTN_CLASS} disabled={running}>
          {running ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {progress ? <p className="text-xs text-muted-foreground">{progress}</p> : null}

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-muted/70" />
      ) : (competitors ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No competitors yet. Add one above (a Meta Page ID gives the most accurate match).
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {(competitors ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between p-3">
              <div>
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.metaPageId ? `Page ${c.metaPageId}` : `name match`} · {c.status} · {c.source}
                </div>
              </div>
              <button
                onClick={() => remove.mutate(c.id)}
                className="text-xs text-destructive hover:underline"
                disabled={remove.isPending}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
