import { type CaptionStyle, resolveCaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { TimelineItem } from '../../types';
import {
  clipEffectsToCss,
  opacityFor,
  resolveAdjustments,
  resolveTextOverlays,
  resolveTransformAt,
  speedFor,
} from '../../utils/render/effectSpec';
import {
  computeOutputPlacements,
  headFadeFor,
  overlapInSecFor,
  tailFadeFor,
  transitionOverlayAt,
} from '../../utils/render/transitions';
import { type CaptionCue, findActiveCue, groupWordsIntoCues } from '../../utils/splice/captionCues';
import type { TimelineDocument } from './adapter';
import { effectiveItemDuration } from './useTimelineEditorModel';

export type TimelineSourceDurations =
  | ReadonlyMap<string, number>
  | ((sourceNodeId: string) => number | undefined);

export interface TimelineSceneLayer {
  item: TimelineItem;
  trackId: 'base' | string;
  trackKind: 'base' | 'overlay';
  zIndex: number;
  outputStartSec: number;
  outputEndSec: number;
  localOutputSec: number;
  sourceTimeSec: number;
  normalizedTime: number;
  opacity: number;
  transform: ReturnType<typeof resolveTransformAt>;
  adjustments: ReturnType<typeof resolveAdjustments>;
  textOverlays: ReturnType<typeof resolveTextOverlays>;
  cssStyle: ReturnType<typeof clipEffectsToCss>;
  transition?: {
    type: NonNullable<TimelineItem['transition']>['type'];
    phase: 'incoming' | 'outgoing';
    progress: number;
  };
}

export interface TimelineScene {
  timestampSec: number;
  totalDurationSec: number;
  baseLayers: TimelineSceneLayer[];
  overlayLayers: TimelineSceneLayer[];
  caption?: { cue: CaptionCue; style: CaptionStyle };
  colorTransition?: { color: string; alpha: number };
}

function sourceDuration(
  durations: TimelineSourceDurations | undefined,
  sourceNodeId: string,
): number | undefined {
  if (!durations) return undefined;
  return typeof durations === 'function' ? durations(sourceNodeId) : durations.get(sourceNodeId);
}

function layerFor(input: {
  item: TimelineItem;
  trackId: 'base' | string;
  trackKind: 'base' | 'overlay';
  zIndex: number;
  outputStartSec: number;
  outputDurationSec: number;
  timestampSec: number;
  transition?: TimelineSceneLayer['transition'];
}): TimelineSceneLayer {
  const localOutputSec = Math.max(0, input.timestampSec - input.outputStartSec);
  const normalizedTime =
    input.outputDurationSec > 0
      ? Math.max(0, Math.min(1, localOutputSec / input.outputDurationSec))
      : 0;
  const speed = speedFor(input.item.effects);
  const sourceTimeSec =
    input.item.kind === 'image' ? 0 : (input.item.trimStartSec ?? 0) + localOutputSec * speed;
  return {
    item: input.item,
    trackId: input.trackId,
    trackKind: input.trackKind,
    zIndex: input.zIndex,
    outputStartSec: input.outputStartSec,
    outputEndSec: input.outputStartSec + input.outputDurationSec,
    localOutputSec,
    sourceTimeSec,
    normalizedTime,
    opacity: opacityFor(input.item.effects),
    transform: resolveTransformAt(input.item.effects, normalizedTime),
    adjustments: resolveAdjustments(input.item.effects),
    textOverlays: resolveTextOverlays(input.item.effects),
    cssStyle: clipEffectsToCss(input.item.effects, normalizedTime),
    ...(input.transition ? { transition: input.transition } : {}),
  };
}

/**
 * Evaluate the render-visible scene at any output timestamp without decoding
 * media. The result is ordered bottom-to-top and includes overlap transitions,
 * every active overlay lane, caption style and interpolated effect state.
 */
export function evaluateTimelineScene(
  document: TimelineDocument,
  timestampSec: number,
  durations?: TimelineSourceDurations,
): TimelineScene {
  const timestamp = Math.max(0, Number.isFinite(timestampSec) ? timestampSec : 0);
  const baseDurations = document.items.map((item) =>
    effectiveItemDuration(item, sourceDuration(durations, item.sourceNodeId)),
  );
  const { placements, totalSec } = computeOutputPlacements(
    document.items.map((item, index) => ({
      outputDurationSec: baseDurations[index],
      crossDissolveInSec: overlapInSecFor(item.transition),
    })),
  );

  const baseLayers = document.items.flatMap((item, index): TimelineSceneLayer[] => {
    const placement = placements[index];
    if (!placement) return [];
    const end = placement.outputStartSec + placement.outputDurationSec;
    if (timestamp < placement.outputStartSec || timestamp >= end) return [];
    const local = timestamp - placement.outputStartSec;
    let transition: TimelineSceneLayer['transition'];
    if (placement.inOverlapSec > 0 && local < placement.inOverlapSec && item.transition) {
      transition = {
        type: item.transition.type,
        phase: 'incoming',
        progress: Math.max(0, Math.min(1, local / placement.inOverlapSec)),
      };
    } else if (
      placement.outOverlapSec > 0 &&
      local >= placement.outputDurationSec - placement.outOverlapSec
    ) {
      const nextTransition = document.items[index + 1]?.transition;
      if (nextTransition) {
        transition = {
          type: nextTransition.type,
          phase: 'outgoing',
          progress: Math.max(
            0,
            Math.min(
              1,
              (local - (placement.outputDurationSec - placement.outOverlapSec)) /
                placement.outOverlapSec,
            ),
          ),
        };
      }
    }
    return [
      layerFor({
        item,
        trackId: 'base',
        trackKind: 'base',
        zIndex: index,
        outputStartSec: placement.outputStartSec,
        outputDurationSec: placement.outputDurationSec,
        timestampSec: timestamp,
        transition,
      }),
    ];
  });

  const overlayLayers = (document.overlayTracks ?? []).flatMap((track, trackIndex) =>
    track.items.flatMap((item, itemIndex): TimelineSceneLayer[] => {
      const start = item.startSec ?? 0;
      const duration = effectiveItemDuration(item, sourceDuration(durations, item.sourceNodeId));
      if (timestamp < start || timestamp >= start + duration) return [];
      return [
        layerFor({
          item,
          trackId: track.id,
          trackKind: 'overlay',
          zIndex: document.items.length + trackIndex * 1_000 + itemIndex,
          outputStartSec: start,
          outputDurationSec: duration,
          timestampSec: timestamp,
        }),
      ];
    }),
  );

  const cues =
    document.captionCues ??
    (document.captionWords?.length ? groupWordsIntoCues(document.captionWords) : []);
  const activeCue = document.captionsEnabled ? findActiveCue(cues, timestamp) : null;

  let colorTransition: TimelineScene['colorTransition'];
  const primary = baseLayers[baseLayers.length - 1];
  if (primary) {
    const index = document.items.findIndex((item) => item.id === primary.item.id);
    colorTransition =
      transitionOverlayAt(
        primary.localOutputSec,
        primary.outputEndSec - primary.outputStartSec,
        headFadeFor(primary.item.transition, index === 0),
        tailFadeFor(document.items[index + 1]?.transition),
      ) ?? undefined;
  }

  return {
    timestampSec: timestamp,
    totalDurationSec: totalSec,
    baseLayers,
    overlayLayers,
    ...(activeCue
      ? {
          caption: {
            cue: activeCue,
            style: resolveCaptionStyle(document.captionStyle, activeCue.style),
          },
        }
      : {}),
    ...(colorTransition ? { colorTransition } : {}),
  };
}
