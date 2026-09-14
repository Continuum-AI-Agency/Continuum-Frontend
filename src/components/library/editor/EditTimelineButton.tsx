'use client';

// Opens the Video Editor on a Library video. The editor's Dialog stacks over the
// asset detail modal; Radix hands Escape to the topmost dismissable layer, so the
// editor closes first and the detail view stays put.

import { editorCommandBatchSchema, type MediaAsset } from '@continuum/contracts';
import { Loader2, Scissors } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { studioVideoHref } from '@/lib/ai-studio/studioVideoHref';
import {
  applyVideoProjectCommands,
  createVideoProject,
  getVideoProject,
  resolveVideoProject,
} from '@/lib/api/videoProjects.client';

export type EditTimelineButtonProps = {
  brandId: string;
  asset: MediaAsset;
  onAssetChanged?: () => void;
};

export function EditTimelineButton({ brandId, asset, onAssetChanged }: EditTimelineButtonProps) {
  const router = useRouter();
  const { show } = useToast();
  const [opening, setOpening] = useState(false);

  if (asset.kind !== 'video') return null;

  const openStudio = async () => {
    if (!asset.headVersionId) {
      show({
        title: 'Video version unavailable',
        description: 'Create a stored version before editing.',
        variant: 'warning',
      });
      return;
    }
    setOpening(true);
    try {
      const binding = { bindingType: 'library_asset' as const, externalId: asset.id };
      let projectId = await resolveVideoProject({ brandId, binding });
      let project = projectId ? await getVideoProject(projectId) : null;
      if (!project) {
        project = await createVideoProject({
          brandId,
          title: asset.title?.trim() || asset.fileName,
          width: asset.width ?? 1920,
          height: asset.height ?? 1080,
          binding,
        });
        projectId = project.projectId;
      }
      if (project.tracks.length === 0) {
        const durationSec = Math.max(0.1, (asset.durationMs ?? 5_000) / 1_000);
        const issuedAt = new Date().toISOString();
        const batchId = crypto.randomUUID();
        const actor = { actorId: 'current-user', actorType: 'user' as const };
        await applyVideoProjectCommands(
          editorCommandBatchSchema.parse({
            batchId,
            projectId: project.projectId,
            sequenceId: project.sequenceId,
            idempotencyKey: `library-seed:${batchId}`,
            expectedRevision: project.revision,
            expectedFingerprint: project.fingerprint,
            atomic: true,
            issuedAt,
            actor,
            commands: [
              {
                commandId: crypto.randomUUID(),
                commandType: 'set_project_metadata',
                durationSec,
                idempotencyKey: `library-duration:${batchId}`,
                expectedRevision: project.revision,
                issuedAt,
                actor,
              },
              {
                commandId: crypto.randomUUID(),
                commandType: 'add_track',
                idempotencyKey: `library-track:${batchId}`,
                expectedRevision: project.revision,
                issuedAt,
                actor,
                track: {
                  id: 'video-main',
                  name: 'Main video',
                  kind: 'video',
                  order: 0,
                  enabled: true,
                  locked: false,
                  muted: false,
                  solo: false,
                  clips: [
                    {
                      id: `asset:${asset.id}`,
                      name: asset.title ?? asset.fileName,
                      kind: 'video',
                      timelineStartSec: 0,
                      durationSec,
                      enabled: true,
                      locked: false,
                      tags: ['library-source'],
                      source: {
                        sourceType: 'library_asset',
                        assetId: asset.id,
                        renditionId: asset.headVersionId,
                        sourceRole: 'primary',
                      },
                      sourceInSec: 0,
                      playbackRate: 1,
                      reverse: false,
                      transform: {
                        position: { x: 0.5, y: 0.5, unit: 'normalized' },
                        scaleX: 1,
                        scaleY: 1,
                        rotationDeg: 0,
                        anchorX: 0.5,
                        anchorY: 0.5,
                        opacity: 1,
                      },
                      crop: { left: 0, top: 0, right: 0, bottom: 0 },
                      blendMode: 'normal',
                      audioEnabled: true,
                      effects: [],
                      keyframes: [],
                    },
                  ],
                },
              },
            ],
          }),
        );
      }
      onAssetChanged?.();
      router.push(studioVideoHref({ projectId, origin: 'library', view: 'assembly' }));
    } catch (error) {
      show({
        title: 'Could not open video studio',
        description: error instanceof Error ? error.message : 'Project setup failed.',
        variant: 'error',
      });
    } finally {
      setOpening(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={opening}
      onClick={() => void openStudio()}
    >
      {opening ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Scissors className="size-3.5" aria-hidden />
      )}
      Edit video
    </Button>
  );
}
