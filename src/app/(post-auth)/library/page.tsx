import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { mediaKindSchema, mediaSourceSchema } from "@continuum/contracts";
import type { MediaKind, MediaSource } from "@continuum/contracts";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { fetchMediaAssets, fetchMediaCollections, fetchStorageUsedBytes } from "@/lib/media/fetchers.server";
import { fetchBrandStyle } from "@/lib/ai-studio/brandStyle.server";
import { buildCaptionStyle } from "@/lib/clips/clipCaptionStyle";
import { isPaidTier } from "@/lib/media/tier";
import { LibraryViewer } from "@/components/library/LibraryViewer";

export const metadata: Metadata = {
  title: "Media Library | Continuum AI",
  description: "Semantically-understood media library for your brand assets.",
};

function LibrarySkeleton() {
  return (
    <div className="flex h-full gap-4 p-4">
      <div className="w-56 shrink-0 animate-pulse rounded-xl bg-muted/70" />
      <div className="flex flex-1 flex-col gap-4">
        <div className="h-9 w-full animate-pulse rounded-lg bg-muted/70" />
        <div className="grid grid-cols-3 gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted/70" />
          ))}
        </div>
      </div>
    </div>
  );
}

async function LibraryContent({
  collectionId,
  source,
  kind,
}: {
  collectionId?: string;
  source?: MediaSource;
  kind?: MediaKind;
}) {
  const { activeBrandId, activeBrandTier } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const [assets, collections, storageUsedBytes, brandStyle] = await Promise.all([
    fetchMediaAssets(activeBrandId, { collectionId, source, kind }),
    fetchMediaCollections(activeBrandId),
    fetchStorageUsedBytes(activeBrandId),
    fetchBrandStyle(activeBrandId),
  ]);

  return (
    <LibraryViewer
      brandId={activeBrandId}
      isPaid={isPaidTier(activeBrandTier)}
      initialAssets={assets}
      initialCollections={collections}
      storageUsedBytes={storageUsedBytes}
      captionStyle={buildCaptionStyle(brandStyle)}
      selectedCollectionId={collectionId ?? null}
      selectedSource={source ?? null}
      selectedKind={kind ?? null}
    />
  );
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string; source?: string; kind?: string }>;
}) {
  const { collection, source, kind } = await searchParams;
  const parsedSource = mediaSourceSchema.safeParse(source);
  const parsedKind = mediaKindSchema.safeParse(kind);
  const source_ = parsedSource.success ? parsedSource.data : undefined;
  const kind_ = parsedKind.success ? parsedKind.data : undefined;

  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height,600px)] w-full min-w-0 overflow-hidden">
      {/* Stable Suspense boundary (no per-filter key): filter/collection changes
          are soft navigations, so React keeps the current grid mounted during the
          refetch instead of tearing it down to the skeleton. The skeleton shows
          only on the first load of the route. */}
      <Suspense fallback={<LibrarySkeleton />}>
        <LibraryContent collectionId={collection} source={source_} kind={kind_} />
      </Suspense>
    </div>
  );
}
