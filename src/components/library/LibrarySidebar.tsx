"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FolderPlus,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
  LayoutGrid,
  Upload,
  Sparkles,
  PenTool,
  Telescope,
  Film,
  MessageSquare,
  Scissors,
} from "lucide-react";
import type { MediaCollection, MediaSource } from "@continuum/contracts";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MEDIA_SOURCES, type SourceFilterValue } from "@/lib/media/filters";

type Props = {
  brandId: string;
  collections: MediaCollection[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  selectedSource: SourceFilterValue;
  onSelectSource: (source: SourceFilterValue) => void;
  storageUsedBytes: number;
};

// Per-source sidebar icon. Keyed by source so a new source added to the canonical
// MEDIA_SOURCES vocabulary just needs an icon here to appear as a Browse folder.
const SOURCE_ICONS: Record<MediaSource, typeof Folder> = {
  upload: Upload,
  ai_generated: Sparkles,
  canvas: PenTool,
  inspiration: Telescope,
  hyperframe: Film,
  chat_upload: MessageSquare,
  clip: Scissors,
  backfill: Folder,
};

// Built-in derived folders. These set the source filter (collection cleared);
// they are virtual (no media.collections rows). Derived from the canonical
// MEDIA_SOURCES so every composited bucket shows up. Imported/backfill stays
// reachable via the filter chips but is intentionally not a sidebar folder.
const BROWSE_FOLDERS: { value: SourceFilterValue; label: string; icon: typeof Folder }[] = [
  { value: "all", label: "All Media", icon: LayoutGrid },
  ...MEDIA_SOURCES.filter((s) => s.value !== "backfill").map((s) => ({
    value: s.value,
    label: s.label,
    icon: SOURCE_ICONS[s.value],
  })),
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function CollectionRow({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent",
        selected && "bg-accent font-medium",
      )}
    >
      {selected ? (
        <FolderOpen className="size-4 shrink-0 text-primary" />
      ) : (
        <Folder className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

function BrowseRow({
  selected,
  label,
  icon: Icon,
  onClick,
}: {
  selected: boolean;
  label: string;
  icon: typeof Folder;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent",
        selected && "bg-accent font-medium",
      )}
    >
      <Icon className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function LibrarySidebar({
  brandId,
  collections,
  selectedCollectionId,
  onSelectCollection,
  selectedSource,
  onSelectSource,
  storageUsedBytes,
}: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch("/api/library/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, name: trimmed }),
      });
      if (resp.ok) {
        setName("");
        setCreating(false);
        router.refresh();
      }
    } catch (err) {
      console.error("[LibrarySidebar] create collection failed", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border/50 bg-muted/30">
      <ScrollArea className="min-h-0 flex-1 px-1.5 pt-2">
        <div className="px-2 pb-1 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Browse
          </span>
        </div>
        {BROWSE_FOLDERS.map((folder) => (
          <BrowseRow
            key={folder.value}
            selected={selectedCollectionId === null && selectedSource === folder.value}
            label={folder.label}
            icon={folder.icon}
            onClick={() => onSelectSource(folder.value)}
          />
        ))}

        <div className="mt-3 flex items-center justify-between px-2 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Collections
          </span>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96] [transition-property:scale,color,background-color]"
            title="New collection"
          >
            <FolderPlus className="size-4" />
          </button>
        </div>

        {creating && (
          <div className="px-1 pb-2">
            <input
              autoFocus
              value={name}
              disabled={submitting}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCreate();
                if (e.key === "Escape") {
                  setName("");
                  setCreating(false);
                }
              }}
              onBlur={() => void submitCreate()}
              placeholder="Collection name…"
              className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm outline-none focus:border-border"
            />
          </div>
        )}

        {collections.length === 0 && !creating ? (
          <p className="px-2 py-1 text-xs text-muted-foreground/70">No collections yet.</p>
        ) : (
          collections.map((col) => (
            <CollectionRow
              key={col.id}
              selected={selectedCollectionId === col.id}
              label={col.name}
              onClick={() => onSelectCollection(col.id)}
            />
          ))
        )}
      </ScrollArea>

      <Separator />

      <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground/70">
        {submitting ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <HardDrive className="size-3.5 shrink-0" />
        )}
        <span className="tabular-nums">{formatBytes(storageUsedBytes)} used</span>
      </div>
    </aside>
  );
}
