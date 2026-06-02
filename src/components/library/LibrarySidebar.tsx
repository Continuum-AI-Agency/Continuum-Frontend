"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Folder, FolderOpen, HardDrive, Loader2 } from "lucide-react";
import type { MediaCollection } from "@continuum/contracts";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type Props = {
  brandId: string;
  collections: MediaCollection[];
  selectedCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  storageUsedBytes: number;
};

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

export function LibrarySidebar({
  brandId,
  collections,
  selectedCollectionId,
  onSelectCollection,
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
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Collections
        </span>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.96] [transition-property:scale,color,background-color]"
          title="New collection"
        >
          <FolderPlus className="size-4" />
        </button>
      </div>

      {creating && (
        <div className="px-2 pb-2">
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

      <ScrollArea className="min-h-0 flex-1 px-1.5">
        <CollectionRow
          selected={selectedCollectionId === null}
          label="All Media"
          onClick={() => onSelectCollection(null)}
        />
        {collections.map((col) => (
          <CollectionRow
            key={col.id}
            selected={selectedCollectionId === col.id}
            label={col.name}
            onClick={() => onSelectCollection(col.id)}
          />
        ))}
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
