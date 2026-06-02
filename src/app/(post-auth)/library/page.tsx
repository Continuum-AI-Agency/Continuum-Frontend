import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { fetchMediaAssets, fetchMediaCollections, fetchStorageUsedBytes } from "@/lib/media/fetchers.server";
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

async function LibraryContent({ collectionId }: { collectionId?: string }) {
  const { activeBrandId, activeBrandTier } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const [assets, collections, storageUsedBytes] = await Promise.all([
    fetchMediaAssets(activeBrandId, { collectionId }),
    fetchMediaCollections(activeBrandId),
    fetchStorageUsedBytes(activeBrandId),
  ]);

  return (
    <LibraryViewer
      brandId={activeBrandId}
      isPaid={isPaidTier(activeBrandTier)}
      initialAssets={assets}
      initialCollections={collections}
      storageUsedBytes={storageUsedBytes}
      selectedCollectionId={collectionId ?? null}
    />
  );
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ collection?: string }>;
}) {
  const { collection } = await searchParams;
  return (
    <div className="h-[calc(100dvh-4.25rem)] min-h-[var(--workspace-min-height,600px)] w-full overflow-hidden">
      <Suspense key={collection ?? "all"} fallback={<LibrarySkeleton />}>
        <LibraryContent collectionId={collection} />
      </Suspense>
    </div>
  );
}
