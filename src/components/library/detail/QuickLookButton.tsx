'use client';

// Brand quick look (WS7): one-tap brand alignment for an image asset. Opens a
// dialog with brand-book piece chips + an optional instruction, sends the asset
// as the reference image to the AI Studio generate endpoint (brand_book_pieces
// become an authoritative <brand_book> prompt block server-side), shows the
// original next to the result, and saves the result as a new version or a new
// library asset. Images only in v1 — video/file get a disabled button.

import type { BrandBookPieceKind, MediaAsset } from '@continuum/contracts';
import { Loader2, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { BrandBookPiecePreview } from '@/components/brand/GenerationConfigPreview';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BRAND_BOOK_PIECE_KINDS,
  presentBrandBookPiece,
} from '@/lib/brands/generationConfigPresentation';
import { useBrandBook } from '@/lib/brands/useBrandBook.client';
import {
  buildQuickLookRequest,
  generateStudioImage,
  type StudioImageResult,
  saveFileAsNewVersion,
  studioResultToFile,
  suffixFileName,
} from '@/lib/library/quickLook';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';

export type QuickLookButtonProps = {
  brandId: string;
  asset: MediaAsset;
  onAssetChanged?: () => void;
};

// 'full' expands to every piece server-side, so it is mutually exclusive with
// the concrete chips: picking a concrete piece drops 'full', emptying the
// selection falls back to it.
function togglePiece(
  selected: readonly BrandBookPieceKind[],
  piece: BrandBookPieceKind,
): BrandBookPieceKind[] {
  if (piece === 'full') return ['full'];
  const withoutFull = selected.filter((candidate) => candidate !== 'full');
  const next = withoutFull.includes(piece)
    ? withoutFull.filter((candidate) => candidate !== piece)
    : [...withoutFull, piece];
  return next.length > 0 ? next : ['full'];
}

function resultPreviewUrl(result: StudioImageResult): string | undefined {
  if (result.signedUrl) return result.signedUrl;
  if (!result.base64) return undefined;
  return result.base64.startsWith('data:')
    ? result.base64
    : `data:${result.mimeType};base64,${result.base64}`;
}

export function QuickLookButton({ brandId, asset, onAssetChanged }: QuickLookButtonProps) {
  const [open, setOpen] = useState(false);
  const [pieces, setPieces] = useState<BrandBookPieceKind[]>(['full']);
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<StudioImageResult | null>(null);
  const [saving, setSaving] = useState<'version' | 'asset' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { brandTokens, isLoading: isBrandBookLoading } = useBrandBook(brandId);
  const brandPieces = BRAND_BOOK_PIECE_KINDS.map((kind) =>
    presentBrandBookPiece(brandTokens, kind),
  ).filter((piece) => piece !== null);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const request = buildQuickLookRequest({ brandId, asset, pieces, instruction });
      setResult(await generateStudioImage(request));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [brandId, asset, pieces, instruction]);

  const handleSaveVersion = useCallback(async () => {
    if (!result) return;
    setSaving('version');
    setError(null);
    setNotice(null);
    try {
      const file = await studioResultToFile(result, suffixFileName(asset.fileName, 'brand'));
      const versionNumber = await saveFileAsNewVersion({
        brandId,
        assetId: asset.id,
        file,
        note: 'Brand quick look',
      });
      setNotice(`Saved as version ${versionNumber}.`);
      onAssetChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the version');
    } finally {
      setSaving(null);
    }
  }, [result, brandId, asset.id, asset.fileName, onAssetChanged]);

  const handleSaveAsset = useCallback(async () => {
    if (!result) return;
    setSaving('asset');
    setError(null);
    setNotice(null);
    try {
      const file = await studioResultToFile(result, suffixFileName(asset.fileName, 'brand'));
      await uploadMediaAsset({ file, brandId });
      setNotice('Saved to the library as a new asset.');
      onAssetChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the asset');
    } finally {
      setSaving(null);
    }
  }, [result, brandId, asset.fileName, onAssetChanged]);

  if (asset.kind !== 'image') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span>
                <Button variant="outline" size="sm" disabled className="pointer-events-none">
                  <Sparkles className="size-3.5" aria-hidden />
                  Brand quick look
                </Button>
              </span>
            }
          />
          <TooltipContent>Brand quick look supports images only for now.</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5" aria-hidden />
        Brand quick look
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Brand quick look</DialogTitle>
            <DialogDescription>
              Re-render this image aligned to your brand book. Pick the pieces to enforce and
              optionally tell the model what to change.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 sm:grid-cols-2">
            {isBrandBookLoading ? (
              <p className="text-xs text-muted-foreground">Loading Brand Book…</p>
            ) : null}
            {!isBrandBookLoading && brandPieces.length === 0 ? (
              <p className="text-xs text-muted-foreground">No Brand Book tokens available.</p>
            ) : null}
            {brandPieces.map((piece) => {
              const active = pieces.includes(piece.kind);
              return (
                <Button
                  key={piece.kind}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  className="h-auto justify-start gap-2 p-2 text-left"
                  aria-pressed={active}
                  disabled={generating}
                  onClick={() => setPieces((prev) => togglePiece(prev, piece.kind))}
                >
                  <BrandBookPiecePreview presentation={piece} size="card" />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{piece.label}</span>
                    <span className="line-clamp-2 block text-[0.65rem] font-normal opacity-75">
                      {piece.description}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>

          <Textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder='Optional instruction, e.g. "align this to our brand"'
            rows={2}
            disabled={generating}
          />

          {result ? (
            <div className="grid grid-cols-2 gap-3">
              <figure className="min-w-0">
                <figcaption className="mb-1 text-xs text-muted-foreground">Original</figcaption>
                {asset.signedUrl ? (
                  // biome-ignore lint/performance/noImgElement: transient signed URL preview
                  <img
                    src={asset.signedUrl}
                    alt={asset.title ?? asset.fileName}
                    className="max-h-72 w-full rounded-md border border-border object-contain"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">Preview unavailable</p>
                )}
              </figure>
              <figure className="min-w-0">
                <figcaption className="mb-1 text-xs text-muted-foreground">Brand look</figcaption>
                {resultPreviewUrl(result) ? (
                  // biome-ignore lint/performance/noImgElement: transient signed URL preview
                  <img
                    src={resultPreviewUrl(result)}
                    alt="Brand-aligned result"
                    className="max-h-72 w-full rounded-md border border-border object-contain"
                  />
                ) : null}
              </figure>
            </div>
          ) : null}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}

          <DialogFooter>
            {result ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSaveVersion()}
                  disabled={saving !== null || generating}
                >
                  {saving === 'version' ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : null}
                  Save as new version
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSaveAsset()}
                  disabled={saving !== null || generating}
                >
                  {saving === 'asset' ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : null}
                  Save as new asset
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              onClick={() => void handleGenerate()}
              disabled={generating || saving !== null || brandPieces.length === 0}
            >
              {generating ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
              {generating ? 'Generating…' : result ? 'Regenerate' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
