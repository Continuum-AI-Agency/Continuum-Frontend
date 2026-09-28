'use client';

// The Library's specialty viewers behind one seam: a 3D model, an HTML5 bundle (zip), or a
// file that carries its own page previews (InDesign `page_N`). The detail stage
// (FilePreviewStage) and the share page mount FamilyViewer the same way; it answers null
// for every family it does not draw, so the host keeps its own fallback.
//
// A model's card poster is rendered here, in the browser, the first time a member opens it,
// and saved through the same sign/complete_asset_rendition path useOpportunisticPoster uses
// for video (persistAssetRendition, role model_poster). A share guest never writes one.

import type {
  LibraryViewerManifest,
  MediaAsset,
  MediaAssetVersion,
  OrbitAnchor,
} from '@continuum/contracts';
import { viewerFamily } from '@continuum/contracts';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { persistAssetRendition } from '@/lib/library/assetPreview';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { OverlayPin, SpatialAnnotation } from '../detail/AnnotationOverlay';
import type { ComposerExtras } from '../detail/CommentComposer';
import { HtmlBundleViewer } from './HtmlBundleViewer';
import { PagedViewer } from './PagedViewer';
import { useViewerManifest } from './useViewerManifest';

// For client components only: this module is 'use client', so on the server every export is a
// client reference that cannot be called. A Server Component imports viewerFamily from
// @continuum/contracts and renders <FamilyViewer> from here.
export { type ViewerFamily, viewerFamily } from '@continuum/contracts';

/** Where a new comment made on the viewer's current view belongs: its page, or its camera. */
export type ViewerAnchor = { page?: number; orbit?: OrbitAnchor };

/**
 * The same review wiring the image stage takes. Pins carrying `orbit` or `page` are drawn on
 * their camera / page; selecting one restores that camera or turns to that page.
 */
export type ViewerReview = {
  pins: OverlayPin[];
  onSelectPin: (id: string | null) => void;
  posting: boolean;
  brandId?: string;
  onPostAnnotated: (body: string, annotation: SpatialAnnotation, extras: ComposerExtras) => void;
};

export type FamilyViewerProps = {
  asset: MediaAsset;
  version: MediaAssetVersion | null;
  surface: 'detail' | 'share';
  onAnchor?: (anchor: ViewerAnchor) => void;
  review?: ViewerReview;
  /** Shown when a ZIP turns out not to be an HTML bundle (an archive or an AE package). */
  fallback?: ReactNode;
};

function StageSpinner() {
  return (
    <div
      data-testid="family-viewer-loading"
      className="flex size-full items-center justify-center text-muted-foreground"
    >
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

// three.js stays out of every bundle that never opens a model.
const ModelViewer = dynamic(() => import('./ModelViewer').then((module) => module.ModelViewer), {
  ssr: false,
  loading: StageSpinner,
});

const postersSaved = new Set<string>();

function saveModelPoster(
  asset: MediaAsset,
  manifest: Extract<LibraryViewerManifest, { family: 'model_3d' }>,
  poster: { blob: Blob; width: number; height: number },
): void {
  if (postersSaved.has(manifest.versionId)) return;
  postersSaved.add(manifest.versionId);
  void persistAssetRendition({
    client: createSupabaseBrowserClient(),
    brandId: asset.brandId,
    assetId: manifest.assetId,
    assetVersionId: manifest.versionId,
    role: 'model_poster',
    blob: poster.blob,
    mimeType: poster.blob.type === 'image/png' ? 'image/png' : 'image/webp',
    width: poster.width,
    height: poster.height,
    renderer: 'three-model-poster',
  }).catch((cause: unknown) => {
    console.warn('[FamilyViewer] model poster not saved', cause);
  });
}

function Unavailable({ message, fallback }: { message: string; fallback?: ReactNode }) {
  if (fallback) return <>{fallback}</>;
  return (
    <div
      data-testid="family-viewer-unavailable"
      className="flex size-full items-center justify-center p-8 text-center text-sm text-muted-foreground"
    >
      {message}
    </div>
  );
}

// The detail stage hands the viewer a sized box; a share page lays it out in the page's flow,
// where `size-full` would collapse to nothing, so there a viewer gets a stage of its own.
function Stage({
  surface,
  children,
}: {
  surface: FamilyViewerProps['surface'];
  children: ReactNode;
}) {
  if (surface === 'detail') return <>{children}</>;
  return (
    <div className="h-[min(70vh,720px)] min-h-80 w-full overflow-hidden rounded-lg border border-border">
      {children}
    </div>
  );
}

function ViewerHost(props: FamilyViewerProps) {
  const { asset, version, surface, review, onAnchor, fallback } = props;
  const state = useViewerManifest({ asset, version, surface });
  const label = asset.title ?? version?.fileName ?? asset.fileName;

  if (state.status === 'loading') {
    return (
      <Stage surface={surface}>
        <StageSpinner />
      </Stage>
    );
  }
  if (state.status === 'unavailable') {
    return <Unavailable message="This file's viewer could not be opened." fallback={fallback} />;
  }
  const { manifest } = state;
  switch (manifest.family) {
    case 'model_3d':
      if (!manifest.model) {
        return (
          <Unavailable
            message={
              manifest.modelError === 'model_too_large'
                ? 'This CAD file is too large to convert for the 3D viewer. Download it to open.'
                : 'This model could not be converted for the 3D viewer. Download it to open.'
            }
          />
        );
      }
      return (
        <Stage surface={surface}>
          <ModelViewer
            source={manifest.model}
            label={label}
            capturePoster={surface === 'detail' && !manifest.posterUrl}
            onPoster={(poster) => saveModelPoster(asset, manifest, poster)}
            review={review}
            onAnchor={onAnchor}
          />
        </Stage>
      );
    case 'html_bundle':
      return (
        <Stage surface={surface}>
          <HtmlBundleViewer entryUrl={manifest.entryUrl} label={label} onReload={state.reload} />
        </Stage>
      );
    case 'paged':
      return (
        <Stage surface={surface}>
          <PagedViewer
            pages={manifest.pages}
            pageCount={manifest.pageCount}
            label={label}
            review={review}
            onAnchor={onAnchor}
          />
        </Stage>
      );
    case 'none':
      return <Unavailable message="No preview for this file." fallback={fallback} />;
  }
}

export function FamilyViewer(props: FamilyViewerProps): JSX.Element | null {
  if (!viewerFamily(props.version ?? props.asset)) return null;
  return <ViewerHost {...props} />;
}
