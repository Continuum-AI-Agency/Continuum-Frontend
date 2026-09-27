'use client';

import {
  LIBRARY_TRASH_RETENTION_DAYS,
  type LibraryTrashItem,
  libraryTrashPageSchema,
} from '@continuum/contracts';
import { ArrowLeft, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import { restoreAssetsOperation } from '@/lib/library/creativeOperations';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { AssetThumb } from '../views/AssetThumb';

const REFUSED_REASON = 'Can’t restore: stacked into another asset';

async function fetchTrash(brandId: string): Promise<LibraryTrashItem[]> {
  const response = await fetch(`/api/library/assets/trash?${new URLSearchParams({ brandId })}`);
  if (!response.ok) throw new Error(`Loading the trash failed (${response.status})`);
  const parsed = libraryTrashPageSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Trash response was malformed');
  return parsed.data.items;
}

function deletedLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function TrashView({
  brandId,
  onClose,
  onRestored,
}: {
  brandId: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [items, setItems] = useState<LibraryTrashItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(new Set());
  const [refused, setRefused] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchTrash(brandId)
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Loading the trash failed');
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const restore = async (item: LibraryTrashItem) => {
    const { id } = item.asset;
    const name = item.asset.title ?? item.asset.fileName;
    setRestoring((current) => new Set(current).add(id));
    try {
      const result = await restoreAssetsOperation(createSupabaseBrowserClient(), {
        brandId,
        assetIds: [id],
      });
      if (result.restoredAssetIds.includes(id)) {
        setItems((current) => current?.filter((entry) => entry.asset.id !== id) ?? null);
        toast.success(`Restored ${name}`);
        onRestored();
      } else if (result.refusedAssetIds.includes(id)) {
        setRefused((current) => new Set(current).add(id));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Restoring ${name} failed`);
    } finally {
      setRestoring((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <section data-testid="library-trash-view" aria-label="Trash" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="size-3.5" />
          Back to library
        </Button>
        <p className="text-xs text-muted-foreground">
          Deleted assets stay here for {LIBRARY_TRASH_RETENTION_DAYS} days.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : items === null ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
          <Trash2 className="size-6 text-muted-foreground/40" />
          Trash is empty.
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/70">
          {items.map((item) => {
            const { id } = item.asset;
            const isRefused = refused.has(id);
            return (
              <li
                key={id}
                data-testid="trash-row"
                data-asset-id={id}
                className="flex items-center gap-3 px-3 py-2"
              >
                <AssetThumb asset={item.asset} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {item.asset.title ?? item.asset.fileName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isRefused ? REFUSED_REASON : `Deleted ${deletedLabel(item.deletedAt)}`}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="trash-restore"
                  disabled={restoring.has(id) || isRefused}
                  onClick={() => void restore(item)}
                >
                  {restoring.has(id) ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  Restore
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
