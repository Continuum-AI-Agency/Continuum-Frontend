import { setBrandLogo } from '@/lib/brands/brandLogo';
import { bulkUpdateAssetTagsOperation } from '@/lib/library/creativeOperations';
import { uploadMediaAsset } from '@/lib/library/uploadMediaAsset';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Logos and reference images handed over during onboarding are ordinary Library media
// carrying a tag. A tag, not a new store: the Library already filters, searches and hands
// tagged media to the agents, which a brand document (text chunks only) never can.
export type BrandLibraryTag = 'logo' | 'reference';

/** The Library's own upload queue runs three at a time (useMediaUpload MAX_CONCURRENCY). */
export const UPLOAD_CONCURRENCY = 3;

export type UploadOutcome = { ok: true; assetId: string } | { ok: false; error: unknown };

type Deps = {
  upload: (input: { file: File; brandId: string }) => Promise<{ assetId: string }>;
  tag: (brandId: string, assetIds: string[], tag: BrandLibraryTag) => Promise<unknown>;
};

const defaultDeps: Deps = {
  upload: uploadMediaAsset,
  tag: (brandId, assetIds, tag) =>
    bulkUpdateAssetTagsOperation(createSupabaseBrowserClient(), {
      brandId,
      assetIds,
      addTags: [tag],
    }),
};

/**
 * Uploads a drop of images a few at a time, then tags every one that landed in a single
 * call. Each file reports as it settles; `tagged: false` means the files are in the
 * Library but without the tag, which the brand can add there.
 */
export async function uploadTaggedLibraryImages(
  input: { brandId: string; files: readonly File[]; tag: BrandLibraryTag },
  onSettled: (index: number, outcome: UploadOutcome) => void,
  deps: Deps = defaultDeps,
): Promise<{ tagged: boolean }> {
  const assetIds: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < input.files.length) {
      const index = next++;
      try {
        const { assetId } = await deps.upload({ file: input.files[index], brandId: input.brandId });
        assetIds.push(assetId);
        onSettled(index, { ok: true, assetId });
      } catch (error) {
        onSettled(index, { ok: false, error });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, input.files.length) }, worker),
  );

  if (assetIds.length === 0) return { tagged: true };
  try {
    await deps.tag(input.brandId, assetIds, input.tag);
    return { tagged: true };
  } catch {
    return { tagged: false };
  }
}

/**
 * Makes an image already in the Library the brand logo through the one logo writer, which
 * sets `brand_profiles.logo_path` and the brand tokens generation reads. Returns the new path.
 */
export async function setBrandLogoFromLibrary(brandId: string, assetId: string): Promise<string> {
  const { logoPath } = await setBrandLogo({ source: 'library', brandId, assetId });
  if (!logoPath) throw new Error('The brand logo was not saved');
  return logoPath;
}

/** A logo the brand never chose (none yet, or a scraped URL) gives way to the first upload. */
export const isChosenBrandLogo = (logoPath: string | null) =>
  Boolean(logoPath) && !/^https?:\/\//i.test(logoPath ?? '');
