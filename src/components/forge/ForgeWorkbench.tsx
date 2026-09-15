'use client';

import { type TemplateSource, templateDisplayName } from '@continuum/contracts';
import { useCallback, useEffect, useState } from 'react';
import { PendingApprovals } from '@/components/forge/PendingApprovals';
import type { ForgeRenderIntent } from '@/components/forge/RenderRequestsGrid';
import { type SharedTemplate, sharedTemplateId } from '@/components/forge/TemplateCard';
import { TemplateDetail } from '@/components/forge/TemplateDetail';
import { TemplateGallery } from '@/components/forge/TemplateGallery';
import { useTemplateMorphSwap } from '@/components/forge/TemplateWireframe';
import { UploadStrip } from '@/components/library/UploadStrip';
import { useMediaUpload } from '@/components/library/useMediaUpload';
import { toast } from '@/components/ui/toast-imperative';
import {
  discoverWorkspaceTemplates,
  fetchRenderWorkspaces,
  fetchTemplateSources,
  renameTemplateSource,
  setTemplateAdoption,
} from '@/lib/library/templateSources';

// Forge — bring your own After Effects project.
//
// The Library still OWNS the file: an upload here goes through the same resumable path into the
// same `media-source` bucket and becomes the same `media.assets` row. This screen is where you
// work on it — find it in the gallery, open it, and say what its variables mean.

/**
 * What the brand's workspaces hold, split in two.
 *
 * Templates built from this brand's own uploads lend their build name to the matching card, so a
 * template nobody titled still reads as what it was built as. Everything else is "shared": discovery
 * ends at an intersection — what the workspace holds ∩ what this brand has been granted — so a brand
 * nobody granted anything sees an empty picker however much is really there, and this is that list
 * with the grant as a button. A brand with several workspaces reads each, and adoption names the one
 * a template came from.
 */
async function loadWorkspaceTemplates(
  brandId: string,
  ownAssetIds: Set<string>,
): Promise<{ shared: SharedTemplate[]; buildNames: Map<string, string> }> {
  const workspaces = await fetchRenderWorkspaces(brandId).catch(() => []);
  const reads = workspaces.length > 1 ? workspaces.map((workspace) => workspace.id) : [undefined];
  const items = (
    await Promise.all(
      reads.map((workspaceId) =>
        discoverWorkspaceTemplates(brandId, workspaceId)
          .then((result) => result.items.map((item) => ({ ...item, workspaceId })))
          // Advisory: a brand with no binding yet has no workspace to read, which is a normal state
          // for a new tenant and must not put an error on the page.
          .catch(() => []),
      ),
    )
  ).flat();
  const buildNames = new Map<string, string>();
  const shared: SharedTemplate[] = [];
  for (const item of items) {
    if (item.sourceAssetId && ownAssetIds.has(item.sourceAssetId)) {
      buildNames.set(item.sourceAssetId, templateDisplayName(item.name));
      continue;
    }
    shared.push({
      templateKey: item.templateKey,
      name: item.name,
      displayName: item.displayName ?? null,
      draft: item.draft,
      granted: item.granted,
      updatedAt: item.updatedAt,
      ...(item.workspaceId ? { workspaceId: item.workspaceId } : {}),
    });
  }
  return { shared, buildNames };
}

export function ForgeWorkbench({
  brandId,
  brandName,
  onOpenRender,
}: {
  brandId: string;
  brandName?: string;
  /** Jump to the Render tab with a template (and optionally a render set) loaded. */
  onOpenRender?: (intent: ForgeRenderIntent) => void;
}) {
  const [sources, setSources] = useState<TemplateSource[]>([]);
  const [shared, setShared] = useState<SharedTemplate[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<string | null>(null);
  const { uploads, uploadFiles, pauseUpload, resumeUpload, cancelUpload } = useMediaUpload(brandId);

  const loadSources = useCallback(async () => {
    try {
      const next = await fetchTemplateSources(brandId);
      setSources(next);
      const { shared: others, buildNames } = await loadWorkspaceTemplates(
        brandId,
        new Set(next.map((source) => source.assetId)),
      );
      setShared(others);
      // A title wins; the build name stands in only where nobody has typed one.
      setSources((current) =>
        current.map((source) =>
          source.displayName || !buildNames.has(source.assetId)
            ? source
            : { ...source, displayName: buildNames.get(source.assetId) ?? null },
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not list your templates');
    }
  }, [brandId]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  // A parse lands seconds after the upload registers, and the row that appears is `pending` until
  // it does. Re-reading when an upload finishes is what turns a just-dropped file into a card
  // with its ratios and slot count on it, without a manual refresh.
  const uploadsDone = uploads.length > 0 && uploads.every((upload) => upload.status === 'done');
  useEffect(() => {
    if (uploadsDone) void loadSources();
  }, [uploadsDone, loadSources]);

  const setDisplayName = (assetId: string, displayName: string | null) =>
    setSources((current) =>
      current.map((source) => (source.assetId === assetId ? { ...source, displayName } : source)),
    );

  // Optimistic: the new name shows at once and is put back if the server refuses it.
  const rename = async (assetId: string, title: string) => {
    const previous = sources.find((source) => source.assetId === assetId)?.displayName ?? null;
    setDisplayName(assetId, title);
    try {
      const saved = await renameTemplateSource(brandId, assetId, title);
      setDisplayName(assetId, saved.displayName ?? title);
    } catch (error) {
      setDisplayName(assetId, previous);
      toast.error(error instanceof Error ? error.message : 'Could not rename the template');
    }
  };

  const toggleShared = async (template: SharedTemplate) => {
    const name = template.displayName ?? templateDisplayName(template.name);
    setAdopting(sharedTemplateId(template));
    try {
      await setTemplateAdoption({
        brandId,
        templateKey: template.templateKey,
        enabled: !template.granted,
        ...(template.workspaceId ? { workspaceId: template.workspaceId } : {}),
      });
      await loadSources();
      toast.success(
        template.granted
          ? `${name} removed from ${brandName ?? 'this brand'}`
          : `${name} is now available to render`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change that');
    } finally {
      setAdopting(null);
    }
  };

  const morph = useTemplateMorphSwap();
  const open = (assetId: string | null) => morph(() => setSelected(assetId));

  const current = sources.find((source) => source.assetId === selected) ?? null;

  return (
    <div className="space-y-6">
      {/* Above everything: a batch waiting on a person is the most time-sensitive thing on this
          page, and it belongs to no one template. Renders nothing when there is nothing waiting. */}
      <PendingApprovals brandId={brandId} />

      {uploads.length ? (
        <UploadStrip
          uploads={uploads}
          onPause={pauseUpload}
          onResume={resumeUpload}
          onRetry={resumeUpload}
          onCancel={cancelUpload}
        />
      ) : null}

      {current ? (
        <TemplateDetail
          key={current.assetId}
          brandId={brandId}
          source={current}
          onBack={() => open(null)}
          onRename={(title) => void rename(current.assetId, title)}
          onOpenRender={onOpenRender}
          onChanged={loadSources}
        />
      ) : (
        <TemplateGallery
          brandId={brandId}
          brandName={brandName}
          sources={sources}
          shared={shared}
          adopting={adopting}
          onOpen={open}
          onRename={(assetId, title) => void rename(assetId, title)}
          onToggleShared={(template) => void toggleShared(template)}
          onOpenRender={onOpenRender}
          onFiles={(files) => void uploadFiles(files)}
          onRejected={(files) =>
            toast.error(
              `${files.map((file) => file.name).join(', ')}: use .aep, .aepx, .aet, or .zip files.`,
            )
          }
        />
      )}
    </div>
  );
}
