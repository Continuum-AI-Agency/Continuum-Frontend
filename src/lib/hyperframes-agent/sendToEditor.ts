'use client';

import {
  type EditorProjectV2,
  editorCommandBatchSchema,
  editorTrackSchema,
  type HyperframesStoryboard,
} from '@continuum/contracts';
import { studioVideoHref } from '@/lib/ai-studio/studioVideoHref';
import {
  applyVideoProjectCommands,
  createVideoProject,
  getVideoProject,
  resolveVideoProject,
} from '@/lib/api/videoProjects.client';
import { listAssetVersions } from '@/lib/library/versions';

export function buildHyperframesEditorTrack(input: {
  assetId: string;
  versionId: string;
  durationSeconds: number;
  storyboard?: HyperframesStoryboard;
}) {
  const scenes = input.storyboard?.scenes ?? [
    {
      id: 'film',
      on_screen: 'HyperFrames film',
      start_seconds: 0,
      duration_seconds: input.durationSeconds,
    },
  ];
  return editorTrackSchema.parse({
    id: 'hyperframes-scenes',
    name: 'HyperFrames scenes',
    kind: 'video',
    order: 0,
    enabled: true,
    locked: false,
    muted: false,
    solo: false,
    clips: scenes.map((scene) => ({
      id: `hyperframes:${scene.id}`,
      name: scene.on_screen.slice(0, 500),
      kind: 'video',
      timelineStartSec: scene.start_seconds,
      sourceInSec: scene.start_seconds,
      durationSec: scene.duration_seconds,
      source: {
        sourceType: 'library_asset',
        assetId: input.assetId,
        renditionId: input.versionId,
      },
      tags: [`scene:${scene.id}`],
    })),
  });
}

function seedProject(
  project: EditorProjectV2,
  track: ReturnType<typeof buildHyperframesEditorTrack>,
) {
  if (project.tracks.length > 0) return project;
  const supportingTracks = [
    { id: 'hyperframes-titles', name: 'Titles', kind: 'text' },
    { id: 'hyperframes-captions', name: 'Captions', kind: 'caption' },
    { id: 'hyperframes-overlays', name: 'Overlays', kind: 'overlay' },
    { id: 'hyperframes-audio', name: 'Sound', kind: 'audio' },
  ].map((value, index) =>
    editorTrackSchema.parse({
      ...value,
      order: index + 1,
      enabled: true,
      locked: false,
      muted: false,
      solo: false,
      clips: [],
    }),
  );
  const issuedAt = new Date().toISOString();
  const actor = { actorId: 'current-user', actorType: 'user' as const };
  const batchId = crypto.randomUUID();
  return applyVideoProjectCommands(
    editorCommandBatchSchema.parse({
      batchId,
      projectId: project.projectId,
      sequenceId: project.sequenceId,
      idempotencyKey: `hyperframes-editor:${batchId}`,
      expectedRevision: project.revision,
      expectedFingerprint: project.fingerprint,
      atomic: true,
      issuedAt,
      actor,
      commands: [
        { commandType: 'add_track', track },
        ...supportingTracks.map((supportingTrack) => ({
          commandType: 'add_track' as const,
          track: supportingTrack,
        })),
        { commandType: 'set_production_stage', workflowStage: 'assembly' },
      ].map((command) => {
        const commandId = crypto.randomUUID();
        return {
          ...command,
          commandId,
          idempotencyKey: `hyperframes-editor-command:${commandId}`,
          expectedRevision: project.revision,
          issuedAt,
          actor,
        };
      }),
    }),
  );
}

export async function sendHyperframesToEditor(input: {
  brandId: string;
  assetId: string;
  versionId: string;
  title: string;
  durationSeconds: number;
  width: number;
  height: number;
  storyboard?: HyperframesStoryboard;
}): Promise<string> {
  const versions = await listAssetVersions({ brandId: input.brandId, assetId: input.assetId });
  const version = versions.find((candidate) => candidate.id === input.versionId);
  if (!version || version.assetId !== input.assetId || !version.mimeType.startsWith('video/')) {
    throw new Error('The rendered video has no pinned Library version yet.');
  }
  const binding = { bindingType: 'library_asset' as const, externalId: input.assetId };
  let projectId = await resolveVideoProject({ brandId: input.brandId, binding });
  if (!projectId) {
    try {
      const created = await createVideoProject({
        brandId: input.brandId,
        title: input.title,
        width: input.width,
        height: input.height,
        binding,
      });
      projectId = created.projectId;
    } catch (error) {
      projectId = await resolveVideoProject({ brandId: input.brandId, binding });
      if (!projectId) throw error;
    }
  }
  const project = await getVideoProject(projectId);
  await seedProject(
    project,
    buildHyperframesEditorTrack({
      assetId: input.assetId,
      versionId: version.id,
      durationSeconds: input.durationSeconds,
      storyboard: input.storyboard,
    }),
  );
  return studioVideoHref({ projectId, origin: 'canvas', view: 'assembly' });
}
