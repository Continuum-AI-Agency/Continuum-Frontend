"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X, RefreshCw } from "lucide-react";
import type { CompetitorSpyStreamFrame } from "@continuum/contracts";
import {
  useCompetitors,
  useCreateCompetitor,
  useDeleteCompetitor,
  useMetaPageSearch,
} from "@/lib/api/competitorSpy";
import { streamCompetitorSync } from "@/lib/api/competitorSpyStream";

const TAG_LIMIT = 5;

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
      return "Building report…";
    case "run_completed":
      return `Done — ${frame.data.snapshotsInserted} new, ${frame.data.analysisCompleted} analyzed.`;
    case "run_error":
      return `Error: ${frame.data.message}`;
    default:
      return "Working…";
  }
}

export function CompetitorTagInput({ brandId }: { brandId: string }) {
  const qc = useQueryClient();
  const { data: competitors } = useCompetitors(brandId);
  const create = useCreateCompetitor(brandId);
  const remove = useDeleteCompetitor(brandId);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: pageResults, isFetching } = useMetaPageSearch(brandId, debounced);

  const tracked = competitors ?? [];
  const taggedCount = tracked.filter((c) => c.source === "user" && c.status === "active").length;
  const atLimit = taggedCount >= TAG_LIMIT;

  const alreadyTracked = (pageId: string, name: string): boolean =>
    tracked.some(
      (c) => (pageId && c.metaPageId === pageId) || c.name.toLowerCase() === name.trim().toLowerCase(),
    );

  const suggestions = (pageResults ?? []).filter((p) => !alreadyTracked(p.pageId, p.pageName)).slice(0, 6);
  const limitError =
    create.error instanceof Error && create.error.message === "competitor_limit_reached";

  const addPage = (pageId: string, pageName: string) => {
    if (atLimit) return;
    create.mutate({ name: pageName, metaPageId: pageId }, { onSuccess: () => setQuery("") });
  };
  const addByName = () => {
    const name = query.trim();
    if (!name || atLimit) return;
    create.mutate({ name }, { onSuccess: () => setQuery("") });
  };

  const runSync = async () => {
    if (running) return;
    setRunning(true);
    setProgress("Starting sync…");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamCompetitorSync({ brandId, signal: ac.signal, onFrame: (frame) => setProgress(describeFrame(frame)) });
    } catch {
      setProgress("Sync failed.");
    } finally {
      setRunning(false);
      void qc.invalidateQueries({ queryKey: ["competitor-spy"] });
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Competitors</h3>
          <p className="text-xs text-muted-foreground">
            Tag up to {TAG_LIMIT}. These also drive the competitors Trends monitors.
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {taggedCount}/{TAG_LIMIT}
        </span>
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={atLimit}
          placeholder={atLimit ? `Limit of ${TAG_LIMIT} reached` : "Search a brand (e.g. Nike)…"}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          aria-label="Search competitors to tag"
        />
        {!atLimit && debounced.trim().length >= 2 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md">
            {suggestions.map((p) => (
              <button
                key={p.pageId}
                type="button"
                onClick={() => addPage(p.pageId, p.pageName)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">{p.pageName}</span>
                <Plus className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
            {isFetching ? <div className="px-3 py-2 text-xs text-muted-foreground">Searching Meta…</div> : null}
            {!isFetching && suggestions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matching advertisers.</div>
            ) : null}
            <button
              type="button"
              onClick={addByName}
              className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Track “{query.trim()}” by name (less precise)
            </button>
          </div>
        ) : null}
      </div>

      {limitError ? (
        <p className="text-xs text-destructive">You can tag at most {TAG_LIMIT} competitors. Remove one first.</p>
      ) : null}

      {tracked.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tracked.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
            >
              <span className="font-medium">{c.name}</span>
              {c.source === "auto" ? <span className="text-[10px] text-muted-foreground">auto</span> : null}
              <button
                type="button"
                onClick={() => remove.mutate(c.id)}
                disabled={remove.isPending}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${c.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No competitors tagged yet.</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={runSync}
          disabled={running || tracked.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Syncing…" : "Sync now"}
        </button>
        {progress ? <span className="text-xs text-muted-foreground">{progress}</span> : null}
      </div>
    </div>
  );
}
