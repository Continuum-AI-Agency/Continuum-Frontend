"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X, RefreshCw } from "lucide-react";
import type { CompetitorSpyStreamFrame } from "@continuum/contracts";
import {
  useCompetitors,
  useCreateCompetitor,
  useDeleteCompetitor,
  useInstagramCompetitorSearch,
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
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setSelectedPageId(null);
  }, [debounced]);

  const {
    data: instagramResult,
    isFetching,
    error: searchError,
  } = useInstagramCompetitorSearch(brandId, debounced);

  const tracked = competitors ?? [];
  const taggedCount = tracked.filter((c) => c.source === "user" && c.status === "active").length;
  const atLimit = taggedCount >= TAG_LIMIT;

  const alreadyTracked = (pageId: string | null, username: string | null, name: string): boolean =>
    tracked.some(
      (c) =>
        (pageId && c.metaPageId === pageId) ||
        (username && c.instagramUsername?.toLowerCase() === username.toLowerCase()) ||
        c.name.toLowerCase() === name.trim().toLowerCase(),
    );

  const selectedPage =
    instagramResult?.metaPageCandidates.find((page) => page.pageId === selectedPageId) ??
    instagramResult?.metaPageCandidates[0] ??
    null;
  const instagramName = instagramResult?.account.name ?? instagramResult?.account.username ?? "";
  const resultAlreadyTracked = instagramResult
    ? alreadyTracked(selectedPage?.pageId ?? null, instagramResult.account.username, instagramName)
    : false;
  const limitError =
    create.error instanceof Error && create.error.message === "competitor_limit_reached";

  const addInstagramCompetitor = () => {
    if (!instagramResult || atLimit) return;
    const name = instagramResult.account.name ?? selectedPage?.pageName ?? instagramResult.account.username;
    if (alreadyTracked(selectedPage?.pageId ?? null, instagramResult.account.username, name)) return;
    create.mutate(
      {
        name,
        metaPageId: selectedPage?.pageId,
        instagramUsername: instagramResult.account.username,
        instagramUserId: instagramResult.account.id ?? undefined,
        instagramName: instagramResult.account.name ?? undefined,
        instagramFollowersCount: instagramResult.account.followersCount ?? undefined,
      },
      {
        onSuccess: () => {
          setQuery("");
          setSelectedPageId(null);
        },
      },
    );
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
          placeholder={atLimit ? `Limit of ${TAG_LIMIT} reached` : "Search Instagram handle or brand (e.g. @nike)…"}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          aria-label="Search competitors to tag"
        />
        {!atLimit && debounced.trim().length >= 2 ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md">
            {isFetching ? <div className="px-3 py-2 text-xs text-muted-foreground">Searching Instagram…</div> : null}

            {!isFetching && instagramResult ? (
              <div className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {instagramResult.account.name ?? instagramResult.account.username}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      @{instagramResult.account.username}
                      {instagramResult.account.followersCount !== null
                        ? ` · ${instagramResult.account.followersCount.toLocaleString()} followers`
                        : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addInstagramCompetitor}
                    disabled={create.isPending || resultAlreadyTracked}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <Plus className="size-3" />
                    Tag
                  </button>
                </div>

                {instagramResult.posts.length > 0 ? (
                  <div className="grid grid-cols-6 gap-1">
                    {instagramResult.posts.slice(0, 6).map((post) => (
                      <div key={post.id} className="aspect-square overflow-hidden rounded-md bg-muted">
                        {post.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.coverUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Meta ad Page ID
                  </div>
                  {instagramResult.metaPageCandidates.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {instagramResult.metaPageCandidates.slice(0, 5).map((page) => (
                        <button
                          key={page.pageId}
                          type="button"
                          onClick={() => setSelectedPageId(page.pageId)}
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            (selectedPage?.pageId ?? null) === page.pageId
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {page.pageName} · {page.pageId}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      No Page ID candidate found. Organic preview can still be tagged.
                    </div>
                  )}
                </div>

                {instagramResult.warnings.length > 0 ? (
                  <div className="text-[11px] text-muted-foreground">
                    {instagramResult.warnings.includes("meta_page_search_failed")
                      ? "Ad Library Page lookup failed; Instagram lookup succeeded."
                      : "Some lookup data may be incomplete."}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!isFetching && searchError ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Could not find a public Instagram business or creator account.
              </div>
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
              {c.instagramUsername ? <span className="text-[10px] text-muted-foreground">@{c.instagramUsername}</span> : null}
              {c.metaPageId ? <span className="text-[10px] text-muted-foreground">Page {c.metaPageId}</span> : null}
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
