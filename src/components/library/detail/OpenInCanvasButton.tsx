'use client';

// The Library → Canvas handoff. Unlike Brand quick look (a one-shot generate call
// that returns a single image), this hands the asset to the Studio Canvas as a real
// graph: a durable reference node wired into pre-made generation nodes that already
// carry the brand-book selection, so the user lands on a canvas that is ready to Run
// and can keep working — rewire it, add nodes, run it again. Outputs come back here:
// a canvas creation registers into the Library with this asset stamped on its
// origin_ref, and can be promoted onto it as a new version.

import {
  type CanvasLibraryNodeType,
  canvasLibrarySource,
  type MediaAsset,
} from '@continuum/contracts';
import { ExternalLink, Loader2, Workflow } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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

// What the canvas would place this asset as, from what the detail row already knows. The
// seeding route decides for real from the head version's renditions; a PSD whose card
// preview is ready but whose canvas rendition is not gets the route's own error.
export function canvasPlacement(asset: MediaAsset): CanvasLibraryNodeType | null {
  if (asset.kind === 'image' || asset.kind === 'video' || asset.kind === 'audio') return asset.kind;
  const original = canvasLibrarySource({
    kind: asset.kind,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    bucket: asset.bucket,
    storagePath: asset.storagePath,
    renditions: [],
  });
  if (original) return original.nodeType;
  if (asset.preview?.state !== 'ready') return null;
  return asset.preview.kind === 'video' ? 'video' : 'image';
}

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
        const { roomId, seedId } = await seedCanvasFromLibrary({
          brandId,
          assetId: asset.id,
          template,
        });
        // Carry the seeded room forward so the canvas opens the room the node was
        // written into, rather than falling back to the first room in the list.
        const params = new URLSearchParams({ roomId, seedId });
        router.push(`${CANVAS_ROUTE}?${params.toString()}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open the canvas');
      } finally {
        // Always clear the spinner. It previously only reset on failure, so a
        // successful seed left the button stuck spinning until navigation
        // unmounted it — and if navigation stalled, forever.
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

  // A source file (PSD, INDD, 3D, MKV) reaches the canvas as its Library rendition while
  // the node keeps the SOURCE asset + version; nothing drawable yet means no menu.
  const placement = canvasPlacement(asset);
  if (!placement) return null;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" disabled={busy}>
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Workflow className="size-3.5" aria-hidden />
              )}
              Open in Canvas
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-72">
          {/* Base UI's GroupLabel throws outside a Group: an ungrouped label crashed the
              menu on open, and took the asset dialog down with it. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Pre-made workflows</DropdownMenuLabel>
            {TEMPLATE_ROWS.map((row) => {
              const unsupported = !templateSupportsAsset(row.template, placement);
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
          </DropdownMenuGroup>

          {derived.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
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
              </DropdownMenuGroup>
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
