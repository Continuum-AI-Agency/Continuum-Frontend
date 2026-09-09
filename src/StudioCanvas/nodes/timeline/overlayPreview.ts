import type React from 'react';
import type { TimelineInputSource } from '../../types';
import {
  type ClipEffectSpec,
  type ResolvedTextOverlay,
  speedFor,
} from '../../utils/render/effectSpec';
import { mergeClipShaderEffects } from '../../utils/render/shaderStack';
import type { TimelineDocument } from './adapter';
import { evaluateTimelineScene } from './timelineScene';

export interface OverlayPreviewLayer {
  id: string;
  kind: 'video' | 'image';
  url: string;
  sourceSec: number;
  playbackRate: number;
  muted: boolean;
  volume: number;
  effects?: ClipEffectSpec;
  effectTimeSec: number;
  mediaStyle: React.CSSProperties;
  textOverlays: ResolvedTextOverlay[];
}

export function resolveOverlayPreviewLayers(input: {
  document: TimelineDocument;
  pool: TimelineInputSource[];
  playheadSec: number;
  sourceDurations: ReadonlyMap<string, number>;
}): OverlayPreviewLayer[] {
  const sourceById = new Map(input.pool.map((source) => [source.nodeId, source]));
  const scene = evaluateTimelineScene(input.document, input.playheadSec, input.sourceDurations);
  return scene.overlayLayers.flatMap((layer): OverlayPreviewLayer[] => {
    const source = sourceById.get(layer.item.sourceNodeId);
    if (!source?.previewUrl) return [];
    const kind = layer.item.kind ?? source.kind;
    if (kind === 'audio') return [];
    const effects = mergeClipShaderEffects(layer.item.effects, source.shaderStack);
    return [
      {
        id: layer.item.id,
        kind,
        url: source.previewUrl,
        sourceSec: layer.sourceTimeSec,
        playbackRate: speedFor(effects),
        muted: layer.item.muteAudio ?? true,
        volume: Math.max(0, Math.min(1, layer.item.volume ?? 1)),
        effects,
        effectTimeSec: layer.localOutputSec,
        mediaStyle: layer.cssStyle,
        textOverlays: layer.textOverlays,
      },
    ];
  });
}
