"use client";

import { useEffect, useState } from "react";
import type { SavedBoard, SavedItem } from "@continuum/contracts";
import { cn } from "@/lib/utils";
import {
  useBoardItems,
  useCreateBoard,
  useCreativeUrl,
  useDeleteBoard,
  useRemoveBoardItem,
  useSavedBoards,
} from "@/lib/api/competitorSpy";
import { compactCount } from "./brandVisuals";

const RAIL_CLASS = "md:sticky md:top-0 md:w-60 md:shrink-0 md:self-start";

function SavedItemCard({
  item,
  onRemove,
}: {
  item: SavedItem;
  onRemove: () => void;
}) {
  const isPaid = item.kind === "paid";
  const needsSigned = isPaid && item.hasCreativeMedia && Boolean(item.adSnapshotId);
  const { data: signedUrl } = useCreativeUrl(item.adSnapshotId ?? "", needsSigned);
  const mediaUrl = signedUrl ?? item.payload.mediaUrl ?? null;
  const likes = compactCount(item.payload.likeCount ?? null);
  const comments = compactCount(item.payload.commentsCount ?? null);

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-[4/5] w-full bg-muted">
        {mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed / remote CDN URLs
          <img src={mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No creative</div>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wide text-white">
          {item.kind}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from board"
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-md bg-black/55 text-sm leading-none text-white transition-colors hover:bg-black/75"
        >
          ×
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="truncate text-sm font-medium text-foreground">
          {item.competitorName ?? item.payload.title ?? "Saved item"}
        </span>
        {item.payload.caption ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{item.payload.caption}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1 font-mono text-2xs text-muted-foreground">
          <span>
            {isPaid
              ? `${item.payload.observedActiveDays ?? 0}d · ${item.payload.status ?? "saved"}`
              : [likes ? `${likes} likes` : null, comments ? `${comments} comments` : null]
                  .filter(Boolean)
                  .join(" · ") || "instagram"}
          </span>
          {item.payload.permalink ? (
            <a
              href={item.payload.permalink}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 underline-offset-2 hover:underline"
            >
              View
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function BoardRail({
  boards,
  selectedId,
  onSelect,
  brandId,
  className,
}: {
  boards: SavedBoard[];
  selectedId?: string;
  onSelect: (id: string) => void;
  brandId: string;
  className?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const create = useCreateBoard(brandId);

  async function submit(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const board = await create.mutateAsync({ name: trimmed });
    setName("");
    setCreating(false);
    onSelect(board.id);
  }

  return (
    <aside className={cn("flex flex-col gap-1", className)}>
      <div className="mb-1 hidden items-baseline justify-between px-2.5 md:flex">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Boards</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{boards.length}</span>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:pb-0">
        {boards.map((board) => {
          const active = board.id === selectedId;
          return (
            <button
              key={board.id}
              type="button"
              onClick={() => onSelect(board.id)}
              aria-current={active}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                "min-w-44 md:min-w-0 md:w-full",
                active ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm text-foreground", active && "font-medium")}>
                  {board.name}
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {board.itemCount} saved
                </span>
              </span>
            </button>
          );
        })}

        {creating ? (
          <div className="flex shrink-0 items-center gap-1 px-2.5 py-1 md:w-full">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
                if (e.key === "Escape") {
                  setCreating(false);
                  setName("");
                }
              }}
              placeholder="Board name"
              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-foreground/30"
            />
            <button
              type="button"
              onClick={() => void submit()}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground md:w-full"
          >
            <span className="flex size-8 shrink-0 items-center justify-center text-base leading-none">+</span>
            <span className="truncate">New board</span>
          </button>
        )}
      </div>
    </aside>
  );
}

export function BoardsPanel({ brandId }: { brandId: string }) {
  const { data: boards } = useSavedBoards(brandId);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const { data: items } = useBoardItems(selectedId);
  const del = useDeleteBoard(brandId);
  const removeItem = useRemoveBoardItem(brandId);

  useEffect(() => {
    if (!boards) return;
    if (selectedId && boards.some((b) => b.id === selectedId)) return;
    setSelectedId(boards[0]?.id);
  }, [boards, selectedId]);

  const list = boards ?? [];
  const selected = list.find((b) => b.id === selectedId);

  if (list.length === 0) {
    return (
      <div className="flex flex-col gap-4 md:flex-row md:gap-5">
        <BoardRail boards={list} selectedId={selectedId} onSelect={setSelectedId} brandId={brandId} className={RAIL_CLASS} />
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">No boards yet</p>
          <p className="text-xs text-muted-foreground">
            Create a board, then save competitor ads and posts to it from the grids.
          </p>
        </div>
      </div>
    );
  }

  const savedItems = items ?? [];

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-5">
      <BoardRail boards={list} selectedId={selectedId} onSelect={setSelectedId} brandId={brandId} className={RAIL_CLASS} />
      <div className="min-w-0 flex-1 space-y-4">
        {selected ? (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{selected.name}</h2>
              <p className="font-mono text-xs text-muted-foreground">{selected.itemCount} saved</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete board “${selected.name}”? This removes its saved items.`)) {
                  del.mutate(selected.id);
                  setSelectedId(undefined);
                }
              }}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            >
              Delete board
            </button>
          </div>
        ) : null}

        {savedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium">This board is empty</p>
            <p className="text-xs text-muted-foreground">
              Use “+ Save” on an ad or post to add it here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {savedItems.map((item) => (
              <SavedItemCard
                key={item.id}
                item={item}
                onRemove={() => removeItem.mutate({ boardId: item.boardId, itemId: item.id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
