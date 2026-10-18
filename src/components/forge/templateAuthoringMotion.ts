import type { TemplateAuthoringCommand, TemplateAuthoringNode } from '@continuum/contracts';

export type AuthoringMotionChannel = TemplateAuthoringNode['keyframeChannels'][number];
export type AuthoringMotionFrame = AuthoringMotionChannel['keyframes'][number];
export type AuthoredRenderNodeSample = { nodeId: string } & Partial<Pick<
  TemplateAuthoringNode,
  'position' | 'scale' | 'rotation' | 'opacity' | 'visible'
>>;
type CommandFrame = Extract<TemplateAuthoringCommand, { type: 'layer.keyframes.replace' }>['keyframes'][number];
export type MotionValue = number | readonly number[];

export type MotionSample =
  | { value: MotionValue; interpolation: 'LINEAR' | 'HOLD' | 'BEZIER' }
  | { value: null; reason: string };

export function channelLockReason(channel: AuthoringMotionChannel): string | null {
  if (channel.reason !== null) return channel.reason;
  if (channel.frameRate === null || channel.frameRate <= 0) return 'Native frame rate is unavailable.';
  if (channel.dimensions === null) return 'Native channel dimensions are unavailable.';
  if (channel.separated !== false) return 'Separated or unverified channels are not editable.';
  if ((channel.channel === 'position' || channel.channel === 'scale') && channel.dimensions !== 3)
    return 'This vector channel does not have the verified native three-value shape.';
  if ((channel.channel === 'rotation' || channel.channel === 'opacity') && channel.dimensions !== 1)
    return 'This scalar channel does not have the verified native one-value shape.';
  return null;
}

export function snapMotionTime(timeSec: number, frameRate: number): number {
  if (!Number.isFinite(timeSec) || !Number.isFinite(frameRate) || frameRate <= 0) return 0;
  return Math.round(timeSec * frameRate) / frameRate;
}

export function moveMotionKeyframe(
  frames: readonly CommandFrame[],
  keyframeId: CommandFrame['keyframeId'],
  frameDelta: number,
  frameRate: number,
): CommandFrame[] | null {
  if (!Number.isInteger(frameDelta) || !Number.isFinite(frameRate) || frameRate <= 0) return null;
  const frame = frames.find((candidate) => candidate.keyframeId === keyframeId);
  if (!frame) return null;
  const timeSec = snapMotionTime(frame.timeSec + frameDelta / frameRate, frameRate);
  if (frames.some((candidate) => candidate.keyframeId !== keyframeId && Math.abs(candidate.timeSec - timeSec) < 1e-7)) return null;
  return frames.map((candidate) => candidate.keyframeId === keyframeId ? { ...candidate, timeSec } : candidate)
    .sort((left, right) => left.timeSec - right.timeSec);
}

export function motionEaseDimensions(channel: AuthoringMotionChannel): number {
  if (channel.channel === 'position' || channel.channel === 'rotation' || channel.channel === 'opacity') return 1;
  return channel.dimensions ?? 1;
}

export function motionEaseAxisLabel(channel: AuthoringMotionChannel, axis: number): string {
  if (channel.channel === 'position') return 'Path';
  return ['X', 'Y', 'Z'][axis] ?? `Axis ${axis + 1}`;
}

function asVector(value: MotionValue): readonly number[] | null {
  return typeof value === 'number' ? null : value;
}

function interpolateNumber(from: number, to: number, ratio: number) {
  return from + (to - from) * ratio;
}

type TemporalEase = { speed: number; influence: number };

function bezierProgress(
  ratio: number,
  duration: number,
  from: number,
  to: number,
  outgoing: TemporalEase | undefined,
  incoming: TemporalEase | undefined,
): number | null {
  if (!outgoing || !incoming || !Number.isFinite(outgoing.speed) || !Number.isFinite(incoming.speed) ||
    !Number.isFinite(outgoing.influence) || !Number.isFinite(incoming.influence) ||
    outgoing.influence < 0.1 || outgoing.influence > 100 || incoming.influence < 0.1 || incoming.influence > 100)
    return null;
  const delta = to - from;
  if (Math.abs(delta) <= Number.EPSILON) return outgoing.speed === 0 && incoming.speed === 0 ? 0 : null;
  const averageSpeed = delta / duration;
  const x1 = outgoing.influence / 100;
  const x2 = 1 - incoming.influence / 100;
  const y1 = outgoing.speed * x1 / averageSpeed;
  const y2 = 1 - incoming.speed * (1 - x2) / averageSpeed;
  if (![averageSpeed, x1, x2, y1, y2].every(Number.isFinite)) return null;

  const coordinate = (t: number, first: number, second: number) => {
    const inverse = 1 - t;
    return 3 * inverse * inverse * t * first + 3 * inverse * t * t * second + t * t * t;
  };
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const parameter = (low + high) / 2;
    if (coordinate(parameter, x1, x2) < ratio) low = parameter;
    else high = parameter;
  }
  return coordinate((low + high) / 2, y1, y2);
}

function sampleBezier(
  channel: AuthoringMotionChannel,
  from: AuthoringMotionFrame,
  to: AuthoringMotionFrame,
  duration: number,
  ratio: number,
): MotionSample {
  const fromVector = asVector(from.value);
  const toVector = asVector(to.value);
  if ((channel.channel === 'rotation' || channel.channel === 'opacity') &&
    typeof from.value === 'number' && typeof to.value === 'number') {
    if (from.outEase.length !== 1 || to.inEase.length !== 1)
      return { value: null, reason: `Native ${channel.channel} Bezier easing requires one ease component on each segment end.` };
    const progress = bezierProgress(ratio, duration, from.value, to.value, from.outEase[0], to.inEase[0]);
    return progress === null
      ? { value: null, reason: 'Native Bezier speed or influence metadata is missing or invalid.' }
      : { value: interpolateNumber(from.value, to.value, progress), interpolation: 'BEZIER' };
  }
  if (!fromVector || !toVector || fromVector.length !== toVector.length)
    return { value: null, reason: 'The native keyframe value shapes do not match.' };

  if (channel.channel === 'position') {
    if (fromVector.length !== 3 || from.outEase.length !== 1 || to.inEase.length !== 1)
      return { value: null, reason: 'Native Position Bezier requires three-value keys and one path ease on each segment end.' };
    if (Math.abs(fromVector[2]! - toVector[2]!) > 1e-9)
      return { value: null, reason: 'Bezier playback is unavailable for Position segments that change Z.' };
    const distance = Math.hypot(toVector[0]! - fromVector[0]!, toVector[1]! - fromVector[1]!);
    const progress = bezierProgress(ratio, duration, 0, distance, from.outEase[0], to.inEase[0]);
    return progress === null
      ? { value: null, reason: 'Native Position path easing requires one valid outgoing and incoming temporal ease.' }
      : { value: fromVector.map((value, axis) => interpolateNumber(value, toVector[axis]!, progress)), interpolation: 'BEZIER' };
  }

  if (channel.channel !== 'scale')
    return { value: null, reason: `The native ${channel.channel} Bezier value shape is not scalar.` };

  const dimensions = motionEaseDimensions(channel);
  if (fromVector.length !== dimensions || toVector.length !== dimensions ||
    from.outEase.length !== dimensions || to.inEase.length !== dimensions)
    return { value: null, reason: `Native ${channel.channel} Bezier easing requires ${dimensions} ease component(s) on each segment end.` };
  const values: number[] = [];
  for (let axis = 0; axis < dimensions; axis += 1) {
    const progress = bezierProgress(ratio, duration, fromVector[axis]!, toVector[axis]!, from.outEase[axis], to.inEase[axis]);
    if (progress === null)
      return { value: null, reason: `Native ${channel.channel} Bezier ease for ${motionEaseAxisLabel(channel, axis)} is missing or invalid.` };
    values.push(interpolateNumber(fromVector[axis]!, toVector[axis]!, progress));
  }
  return { value: values, interpolation: 'BEZIER' };
}

/** Samples the native keyframe forms represented by exact value, interpolation, and ease metadata. */
export function sampleMotionChannel(
  channel: AuthoringMotionChannel,
  timeSec: number,
): MotionSample {
  const lockReason = channelLockReason(channel);
  if (lockReason) return { value: null, reason: lockReason };
  const frames = channel.keyframes;
  if (!frames.length) return { value: null, reason: 'This channel has no keyframes.' };
  if (!Number.isFinite(timeSec)) return { value: null, reason: 'The playhead time is unavailable.' };
  const first = frames[0]!;
  if (timeSec <= first.timeSec) return { value: first.value, interpolation: 'HOLD' };
  const last = frames[frames.length - 1]!;
  if (timeSec >= last.timeSec) return { value: last.value, interpolation: 'HOLD' };
  let index = 0;
  while (index < frames.length - 1 && timeSec >= frames[index + 1]!.timeSec) index += 1;
  const from = frames[index]!;
  const to = frames[index + 1]!;
  if (from.outInterpolation !== to.inInterpolation)
    return { value: null, reason: `This segment mixes outgoing ${from.outInterpolation} and incoming ${to.inInterpolation} interpolation.` };
  if (from.outInterpolation === 'HOLD') return { value: from.value, interpolation: 'HOLD' };
  const duration = to.timeSec - from.timeSec;
  if (duration <= 0) return { value: null, reason: 'This keyframe segment has invalid timing.' };
  const ratio = (timeSec - from.timeSec) / duration;
  if (from.outInterpolation === 'LINEAR') {
    const fromVector = asVector(from.value);
    const toVector = asVector(to.value);
    if (!fromVector && !toVector && typeof from.value === 'number' && typeof to.value === 'number')
      return { value: interpolateNumber(from.value, to.value, ratio), interpolation: 'LINEAR' };
    if (!fromVector || !toVector || fromVector.length !== toVector.length)
      return { value: null, reason: 'The native keyframe value shapes do not match.' };
    return {
      value: fromVector.map((value, component) => interpolateNumber(value, toVector[component]!, ratio)),
      interpolation: 'LINEAR',
    };
  }

  return sampleBezier(channel, from, to, duration, ratio);
}

/** Returns display-only poses for generated nodes without changing their canonical authoring rows. */
export function sampleAuthoredRenderNodes(
  nodes: readonly TemplateAuthoringNode[],
  nodeIds: readonly string[],
  timeSec: number,
): AuthoredRenderNodeSample[] {
  const included = new Set(nodeIds);
  return nodes.flatMap((node) => {
    if (node.sourceRef || !included.has(node.nodeId)) return [];
    const sample: AuthoredRenderNodeSample = { nodeId: node.nodeId };
    if (Number.isFinite(timeSec) && node.capabilities.timing && node.timingReason === null && node.inSec !== null && node.outSec !== null)
      sample.visible = timeSec >= node.inSec && timeSec < node.outSec ? node.visible : false;
    if (!node.capabilities.keyframes || !Number.isFinite(timeSec)) return sample.visible === undefined ? [] : [sample];
    for (const channel of node.keyframeChannels) {
      if (channel.reason !== null || channel.keyframes.length === 0) continue;
      const value = sampleMotionChannel(channel, timeSec).value;
      if (channel.channel === 'position' || channel.channel === 'scale') {
        if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) continue;
        sample[channel.channel] = [value[0]!, value[1]!];
      } else if ((channel.channel === 'rotation' || channel.channel === 'opacity') &&
        typeof value === 'number' && Number.isFinite(value)) {
        sample[channel.channel] = value;
      }
    }
    return Object.keys(sample).length === 1 ? [] : [sample];
  });
}

export function keyframeCommandFrames(channel: AuthoringMotionChannel): Array<{
  keyframeId: CommandFrame['keyframeId'];
  timeSec: number;
  value: number | [number, number, number];
  inInterpolation: 'LINEAR' | 'BEZIER' | 'HOLD';
  outInterpolation: 'LINEAR' | 'BEZIER' | 'HOLD';
  inEase?: Array<{ speed: number; influence: number }>;
  outEase?: Array<{ speed: number; influence: number }>;
}> {
  return channel.keyframes.map((frame) => ({
    keyframeId: frame.keyframeId as CommandFrame['keyframeId'],
    timeSec: frame.timeSec,
    value: Array.isArray(frame.value)
      ? [frame.value[0]!, frame.value[1]!, frame.value[2]!] as [number, number, number]
      : frame.value,
    inInterpolation: frame.inInterpolation,
    outInterpolation: frame.outInterpolation,
    ...(frame.inEase.length ? { inEase: frame.inEase } : {}),
    ...(frame.outEase.length ? { outEase: frame.outEase } : {}),
  }));
}
