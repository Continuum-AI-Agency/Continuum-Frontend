import { PUBLISH_VIDEO_INPUT_HANDLE } from '@continuum/contracts';
import { useCallback, useMemo, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  type PublishCanvasResponse,
  publishCanvasResponseSchema,
} from '@/lib/organic/publish-canvas';
import { useStudioStore } from '../../stores/useStudioStore';
import type { PublishToPlannerNodeData, StudioNode } from '../../types';

// Durable, re-signable location of an upstream node's produced video. Only nodes
// that persist a media-library asset (the Video Editor / generators) or a stored
// Video Reference expose these — an in-memory object URL alone can't be published.
interface PublishVideoSource {
  bucket: string;
  storagePath: string;
  signedUrl?: string;
  mimeType?: string;
}

const trimmed = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

// Read durable storage coords from the source node feeding the publish handle.
// Editor/generator outputs land as generatedVideo*; a stored Video Reference as
// sourcePath/bucket. Returns null when only a transient object URL exists.
export function resolvePublishVideoSource(node: StudioNode | undefined): PublishVideoSource | null {
  if (!node) return null;
  const data = node.data as Record<string, unknown>;

  const generatedBucket = trimmed(data.generatedVideoBucket);
  const generatedPath = trimmed(data.generatedVideoStoragePath);
  if (generatedBucket && generatedPath) {
    return {
      bucket: generatedBucket,
      storagePath: generatedPath,
      signedUrl: trimmed(data.generatedVideoUrl) ?? trimmed(data.generatedVideo),
      mimeType: 'video/mp4',
    };
  }

  const sourceBucket = trimmed(data.bucket);
  const sourcePath = trimmed(data.sourcePath);
  if (sourceBucket && sourcePath) {
    return {
      bucket: sourceBucket,
      storagePath: sourcePath,
      signedUrl: trimmed(data.sourceUrl),
    };
  }
  return null;
}

function findPublishSourceNode(nodeId: string): StudioNode | undefined {
  const state = useStudioStore.getState();
  const edge = state.edges.find(
    (candidate) =>
      candidate.target === nodeId && (candidate.targetHandle ?? '') === PUBLISH_VIDEO_INPUT_HANDLE,
  );
  if (!edge) return undefined;
  return (state.nodes as StudioNode[]).find((candidate) => candidate.id === edge.source);
}

export interface UsePublishToPlannerResult {
  publish: () => Promise<boolean>;
  isPublishing: boolean;
  hasSource: boolean;
}

export function usePublishToPlanner(nodeId: string): UsePublishToPlannerResult {
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);
  const edges = useStudioStore((state) => state.edges);
  const nodes = useStudioStore((state) => state.nodes);
  const { show } = useToast();
  const [isPublishing, setIsPublishing] = useState(false);

  // Reactive presence check derived from the subscribed wiring + node data, so the
  // Publish button enables/disables as the upstream video is rendered or rewired.
  const hasSource = useMemo(() => {
    const edge = edges.find(
      (candidate) =>
        candidate.target === nodeId &&
        (candidate.targetHandle ?? '') === PUBLISH_VIDEO_INPUT_HANDLE,
    );
    if (!edge) return false;
    const sourceNode = (nodes as StudioNode[]).find((candidate) => candidate.id === edge.source);
    return resolvePublishVideoSource(sourceNode) !== null;
  }, [nodeId, edges, nodes]);

  const publish = useCallback(async (): Promise<boolean> => {
    const state = useStudioStore.getState();
    const brandId = state.brandId;
    const node = (state.nodes as StudioNode[]).find((candidate) => candidate.id === nodeId);
    const data = (node?.data ?? {}) as PublishToPlannerNodeData;

    if (!brandId || brandId === 'default-brand') {
      show({
        title: 'Select a brand first',
        description: 'Publishing to the Planner needs an active brand.',
        variant: 'warning',
      });
      return false;
    }

    const source = resolvePublishVideoSource(findPublishSourceNode(nodeId));
    if (!source) {
      show({
        title: 'Nothing to publish',
        description: 'Connect a rendered video and render it first so it is saved to the library.',
        variant: 'warning',
      });
      return false;
    }

    setIsPublishing(true);
    try {
      const requestBody = {
        brandId,
        ...(data.draftId ? { draftId: data.draftId } : {}),
        ...(data.clientKey ? { clientKey: data.clientKey } : {}),
        bucket: source.bucket,
        storagePath: source.storagePath,
        ...(source.mimeType ? { mimeType: source.mimeType } : {}),
        ...(data.platform ? { platform: data.platform } : {}),
        ...(data.scheduledAt ? { scheduledAt: data.scheduledAt } : {}),
        ...(data.caption ? { caption: data.caption } : {}),
        ...(data.status ? { status: data.status } : {}),
      };

      const res = await fetch('/api/organic/publish-canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Publish failed (${res.status}).`);
      }

      const result: PublishCanvasResponse = publishCanvasResponseSchema.parse(await res.json());

      updateNode(nodeId, (current) => ({
        ...current,
        data: {
          ...(current.data as PublishToPlannerNodeData),
          draftId: result.draftId,
          weekStartId: result.weekStartId,
          publishedStoragePath: result.storagePath,
          publishedBucket: result.bucket,
          publishedUrl: result.signedUrl,
          publishedAt: new Date().toISOString(),
          isComplete: true,
          error: undefined,
        },
      }));
      triggerSave();

      show({
        title: result.createdDraft ? 'Draft created' : 'Draft updated',
        description: 'The edited video is now attached to a Planner draft.',
        variant: 'success',
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Publish failed';
      updateNode(nodeId, (current) => ({
        ...current,
        data: { ...(current.data as PublishToPlannerNodeData), error: message },
      }));
      show({ title: 'Publish failed', description: message, variant: 'warning' });
      return false;
    } finally {
      setIsPublishing(false);
    }
  }, [nodeId, show, triggerSave, updateNode]);

  return { publish, isPublishing, hasSource };
}
