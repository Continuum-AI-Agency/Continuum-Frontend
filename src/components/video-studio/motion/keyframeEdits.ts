// The keyframe lane's edits as pure functions: project in, command drafts out. Keys are
// clip-local seconds (the compositor and the motion presets read them that way), and each
// lane channel is one or more V2 properties keyed together — Scale is its X and Y stops at
// one time, so a uniform scale key is always a pair.

import {
  type EditorClip,
  type EditorKeyframe,
  type EditorProjectV2,
  numericKeysForProperty,
  positionKeysForProperty,
  sampleNumericTrack,
  samplePositionTrack,
} from '@continuum/contracts';
import type { EditorCommandDraft } from '@/StudioCanvas/nodes/timeline/editorProjectV2AssemblyModel';
import { currentPropertyValue } from '@/StudioCanvas/nodes/timeline/motion/motionLayers';
import { findClip, type TimelineEdit } from '@/StudioCanvas/nodes/timeline/workspace/timelineEdits';

export type KeyedClip = Extract<EditorClip, { kind: 'video' | 'overlay' | 'text' | 'audio' }>;
export const isKeyedClip = (clip: EditorClip): clip is KeyedClip =>
  clip.kind === 'video' || clip.kind === 'overlay' || clip.kind === 'text' || clip.kind === 'audio';

type LaneProperty =
  | 'transform.position'
  | 'transform.scaleX'
  | 'transform.scaleY'
  | 'transform.rotationDeg'
  | 'transform.opacity'
  | 'audio.volume';

export const LANE_CHANNELS = [
  { id: 'position', label: 'Position', properties: ['transform.position'] },
  { id: 'scale', label: 'Scale', properties: ['transform.scaleX', 'transform.scaleY'] },
  { id: 'rotation', label: 'Rotation', properties: ['transform.rotationDeg'] },
  { id: 'opacity', label: 'Opacity', properties: ['transform.opacity'] },
  { id: 'volume', label: 'Volume', properties: ['audio.volume'] },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  properties: readonly LaneProperty[];
}>;
export type LaneChannel = (typeof LANE_CHANNELS)[number];
export type LaneChannelId = LaneChannel['id'];

export const channelsFor = (clip: KeyedClip): readonly LaneChannel[] =>
  LANE_CHANNELS.filter((channel) => (clip.kind === 'audio') === (channel.id === 'volume'));

/** Stops closer than this are one key: the reducer merges same-property stops at 1 ms. */
const SAME_KEY_SEC = 0.001;
/** How near the playhead a key must be to count as "at" it — about a frame and a half. */
export const AT_PLAYHEAD_SEC = 0.05;

export type LaneKey = { timeSec: number; keyframes: EditorKeyframe[] };

const channelFor = (id: LaneChannelId): LaneChannel =>
  LANE_CHANNELS.find((channel) => channel.id === id) ?? LANE_CHANNELS[0];
const inChannel = (channel: LaneChannel, keyframe: EditorKeyframe): boolean =>
  (channel.properties as readonly string[]).includes(keyframe.property);
const roundSec = (sec: number): number => Math.round(sec * 1_000) / 1_000;

/** A channel's keys in time order, each gathering its properties' stops at that time. */
export function channelKeys(clip: KeyedClip, channelId: LaneChannelId): LaneKey[] {
  const channel = channelFor(channelId);
  const keys: LaneKey[] = [];
  const own = clip.keyframes
    .filter((keyframe) => inChannel(channel, keyframe))
    .toSorted((left, right) => left.timeSec - right.timeSec);
  for (const keyframe of own) {
    const last = keys.at(-1);
    if (last && keyframe.timeSec - last.timeSec <= SAME_KEY_SEC) last.keyframes.push(keyframe);
    else keys.push({ timeSec: keyframe.timeSec, keyframes: [keyframe] });
  }
  return keys;
}

export const keyNear = (
  keys: readonly LaneKey[],
  sec: number,
  within = SAME_KEY_SEC,
): LaneKey | undefined => keys.find((key) => Math.abs(key.timeSec - sec) <= within);

/** A property's value at a clip-local time, through the one sampler the compositor uses. */
export function valueAt(
  clip: KeyedClip,
  property: LaneProperty,
  localSec: number,
): EditorKeyframe['value'] {
  let base: EditorKeyframe['value'];
  if (property === 'audio.volume') {
    if (clip.kind !== 'audio') throw new Error('Volume lane requires an audio clip.');
    base = clip.volume;
  } else {
    if (clip.kind === 'audio') throw new Error('Audio clips only expose volume keyframes.');
    base = currentPropertyValue(clip.transform, property);
  }
  if (property === 'transform.position' && typeof base === 'object' && 'x' in base) {
    const at = samplePositionTrack(
      positionKeysForProperty(clip.keyframes, property),
      localSec,
      base as { x: number; y: number },
    );
    return { x: roundSec(at.x), y: roundSec(at.y) };
  }
  return roundSec(
    sampleNumericTrack(numericKeysForProperty(clip.keyframes, property), localSec, Number(base)),
  );
}

function locate(project: EditorProjectV2, clipId: string) {
  const found = findClip(project, clipId);
  if (!found || found.track.locked || found.clip.locked || !isKeyedClip(found.clip)) return null;
  return { trackId: found.track.id, clip: found.clip };
}

const upsert = (trackId: string, clipId: string, keyframe: EditorKeyframe): EditorCommandDraft => ({
  commandType: 'upsert_keyframe',
  trackId,
  clipId,
  keyframe,
});

/** Drop the easing fields an interpolation does not read, so the keyframe stays valid. */
function tidy(keyframe: EditorKeyframe): EditorKeyframe {
  const { easing, spring, expression, ...rest } = keyframe;
  return {
    ...rest,
    ...(keyframe.interpolation === 'bezier' && easing ? { easing } : {}),
    ...(keyframe.interpolation === 'spring' && spring ? { spring } : {}),
    ...(expression ? { expression } : {}),
  };
}

/** A key at `localSec` holding what the clip shows there now; an existing key keeps its id. */
export function addKeyEdit(
  project: EditorProjectV2,
  clipId: string,
  channelId: LaneChannelId,
  localSec: number,
): TimelineEdit | null {
  const at = locate(project, clipId);
  if (!at || !channelsFor(at.clip).some((channel) => channel.id === channelId)) return null;
  const channel = channelFor(channelId);
  const timeSec = roundSec(Math.min(at.clip.durationSec, Math.max(0, localSec)));
  const existing = keyNear(channelKeys(at.clip, channelId), timeSec);
  return {
    label: `Add ${channel.label.toLowerCase()} keyframe`,
    forward: channel.properties.map((property) => {
      const same = existing?.keyframes.find((keyframe) => keyframe.property === property);
      return upsert(at.trackId, clipId, {
        ...(same ?? { interpolation: 'linear' as const }),
        id: same?.id ?? crypto.randomUUID(),
        property,
        timeSec,
        value: valueAt(at.clip, property, timeSec),
      });
    }),
  };
}

/** Slide a key to `toSec`; a key already there on the same channel gives way. */
export function moveKeyEdit(
  project: EditorProjectV2,
  clipId: string,
  channelId: LaneChannelId,
  fromSec: number,
  toSec: number,
): TimelineEdit | null {
  const at = locate(project, clipId);
  if (!at) return null;
  const keys = channelKeys(at.clip, channelId);
  const moving = keyNear(keys, fromSec);
  const timeSec = roundSec(Math.min(at.clip.durationSec, Math.max(0, toSec)));
  if (!moving || Math.abs(moving.timeSec - timeSec) <= SAME_KEY_SEC) return null;
  const displaced = keyNear(
    keys.filter((key) => key !== moving),
    timeSec,
  );
  return {
    label: `Move ${channelFor(channelId).label.toLowerCase()} keyframe`,
    forward: [
      ...(displaced
        ? [
            {
              commandType: 'remove_keyframes' as const,
              trackId: at.trackId,
              clipId,
              keyframeIds: displaced.keyframes.map((keyframe) => keyframe.id),
            },
          ]
        : []),
      ...moving.keyframes.map((keyframe) => upsert(at.trackId, clipId, { ...keyframe, timeSec })),
    ],
  };
}

/** How a key eases into the next one: linear, a bezier curve, a spring, hold. */
export function easeKeyEdit(
  project: EditorProjectV2,
  clipId: string,
  channelId: LaneChannelId,
  atSec: number,
  patch: Partial<Pick<EditorKeyframe, 'interpolation' | 'easing' | 'spring' | 'expression'>>,
): TimelineEdit | null {
  const at = locate(project, clipId);
  const key = at && keyNear(channelKeys(at.clip, channelId), atSec);
  if (!at || !key) return null;
  return {
    label: 'Change easing',
    forward: key.keyframes.map((keyframe) =>
      upsert(at.trackId, clipId, tidy({ ...keyframe, ...patch })),
    ),
  };
}

/** Set a key's value. Scale writes X and Y alike: the lane keys a uniform scale. */
export function valueKeyEdit(
  project: EditorProjectV2,
  clipId: string,
  channelId: LaneChannelId,
  atSec: number,
  value: EditorKeyframe['value'],
): TimelineEdit | null {
  const at = locate(project, clipId);
  const key = at && keyNear(channelKeys(at.clip, channelId), atSec);
  if (!at || !key) return null;
  return {
    label: `Set ${channelFor(channelId).label.toLowerCase()}`,
    forward: key.keyframes.map((keyframe) => upsert(at.trackId, clipId, { ...keyframe, value })),
  };
}

export function removeKeyEdit(
  project: EditorProjectV2,
  clipId: string,
  channelId: LaneChannelId,
  atSec: number,
): TimelineEdit | null {
  const at = locate(project, clipId);
  const key = at && keyNear(channelKeys(at.clip, channelId), atSec);
  if (!at || !key) return null;
  return {
    label: 'Delete keyframe',
    forward: [
      {
        commandType: 'remove_keyframes',
        trackId: at.trackId,
        clipId,
        keyframeIds: key.keyframes.map((keyframe) => keyframe.id),
      },
    ],
  };
}
