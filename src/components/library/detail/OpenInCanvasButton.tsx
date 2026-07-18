'use client';

// The Library → Canvas handoff. Unlike Brand quick look (a one-shot generate call
// that returns a single image), this hands the asset to the Studio Canvas as a real
// graph: a durable reference node wired into pre-made generation nodes that already
// carry the brand-book selection, so the user lands on a canvas that is ready to Run
// and can keep working — rewire it, add nodes, run it again. Outputs come back here:
// a canvas creation registers into the Library with this asset stamped on its
// origin_ref, and can be promoted onto it as a new version.

import type { MediaAsset } from '@continuum/contracts';
import { ExternalLink, Loader2, Workflow } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { LibraryCanvasTemplate } from '@/lib/library/canvasTemplates';
import { templateSupportsAsset } from '@/lib/library/canvasTemplates';
import {
  CANVAS_ROUTE,
  fetchDerivedCanvasAssets,
  saveDerivedAssetAsVersion,
  seedCanvasFromLibrary,
} from '@/lib/library/openInCanvas';

export type OpenInCanvasButtonProps = {
  brandId: string;
  asset: MediaAsset;
  onAssetChanged?: () => void;
};

const TEMPLATE_ROWS: { template: LibraryCanvasTemplate; label: string; hint: string }[] = [
  {
    template: 'brand-align',
    label: 'Brand align',
    hint: 'Reference → brand-enforced image node',
  },
  {
    template: 'resize-pack',
    label: 'Resize pack',
    hint: 'One node per placement ratio',
  },
  {
    template: 'blank',
    label: 'Blank canvas',
    hint: 'Drop the asset in and wire it yourself',
  },
];

export function OpenInCanvasButton({ brandId, asset, onAssetChanged }: OpenInCanvasButtonProps) {
  const router = useRouter();
  const [seeding, setSeeding] = useState<LibraryCanvasTemplate | null>(null);
  const [derived, setDerived] = useState<MediaAsset[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDerivedCanvasAssets({ brandId, assetId: asset.id })
      .then((assets) => {
        if (!cancelled) setDerived(assets);
      })
      .catch(() => {
        if (!cancelled) setDerived([]);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, asset.id]);

  const handleOpen = useCallback(
    async (template: LibraryCanvasTemplate) => {
      setSeeding(template);
      setError(null);
      try {
        await seedCanvasFromLibrary({ brandId, assetId: asset.id, template });
        router.push(CANVAS_ROUTE);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open the canvas');
        setSeeding(null);
      }
    },
    [brandId, asset.id, router],
  );

  const handleSaveVersion = useCallback(
    async (output: MediaAsset) => {
      setSavingId(output.id);
      setError(null);
      try {
        await saveDerivedAssetAsVersion({ brandId, assetId: asset.id, derived: output });
        onAssetChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the version');
      } finally {
        setSavingId(null);
      }
    },
    [brandId, asset.id, onAssetChanged],
  );

  const busy = seeding !== null;

  // Source-file bytes are never coerced to an image. A companion rendition is
  // review media, not a replacement for the source identity; Canvas can expose
  // this again when its handoff accepts an explicit rendition id.
  if (asset.kind === 'file') return null;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy}>
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Workflow className="size-3.5" aria-hidden />
            )}
            Open in Canvas
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Pre-made workflows</DropdownMenuLabel>
          {TEMPLATE_ROWS.map((row) => {
            const supported = templateSupportsAsset(
              row.template,
              asset.kind === 'video' ? 'video' : 'image',
            );
            const unsupported = asset.kind !== 'image' && !supported;
            return (
              <DropdownMenuItem
                key={row.template}
                disabled={unsupported || busy}
                onSelect={(event) => {
                  event.preventDefault();
                  void handleOpen(row.template);
                }}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm">{row.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {unsupported ? 'Images only' : row.hint}
                  </span>
                </div>
              </DropdownMenuItem>
            );
          })}

          {derived.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Canvas outputs ({derived.length})</DropdownMenuLabel>
              {derived.map((output) => (
                <DropdownMenuItem
                  key={output.id}
                  disabled={savingId !== null}
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleSaveVersion(output);
                  }}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{output.title ?? output.fileName}</span>
                    <span className="text-xs text-muted-foreground">
                      {savingId === output.id ? 'Saving…' : 'Save as new version'}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {derived.length > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          <ExternalLink className="size-3" aria-hidden />
          {derived.length} canvas output{derived.length === 1 ? '' : 's'}
        </span>
      ) : null}

      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
