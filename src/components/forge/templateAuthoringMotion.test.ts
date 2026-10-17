import { describe, expect, test } from 'bun:test';
import type { TemplateAuthoringNode } from '@continuum/contracts';
import {
  channelLockReason,
  keyframeCommandFrames,
  motionEaseAxisLabel,
  motionEaseDimensions,
  moveMotionKeyframe,
  sampleAuthoredRenderNodes,
  sampleMotionChannel,
  snapMotionTime,
  type AuthoringMotionChannel,
} from './templateAuthoringMotion';

const channel = (overrides: Partial<AuthoringMotionChannel> = {}): AuthoringMotionChannel => ({
  channelId: 'aep:11:9:ADBE Position',
  channel: 'position',
  matchName: 'ADBE Position',
  frameRate: 24,
  dimensions: 3,
  separated: false,
  reason: null,
  keyframes: [],
  ...overrides,
});
const frame = (
  keyframeId: string,
  timeSec: number,
  value: number | number[],
  interpolation: 'LINEAR' | 'HOLD' | 'BEZIER' = 'LINEAR',
) => ({
  keyframeId,
  timeSec,
  value,
  inInterpolation: interpolation,
  outInterpolation: interpolation,
  inEase: interpolation === 'BEZIER' ? [{ speed: 4, influence: 33 }] : [],
  outEase: interpolation === 'BEZIER' ? [{ speed: 4, influence: 33 }] : [],
});
const easeForCurve = (from: number, to: number, duration: number, [x1, y1, x2, y2]: [number, number, number, number]) => {
  const average = (to - from) / duration;
  return {
    out: { speed: average * y1 / x1, influence: x1 * 100 },
    in: { speed: average * (1 - y2) / (1 - x2), influence: (1 - x2) * 100 },
  };
};

describe('template authoring motion helpers', () => {
  const generatedNode = (overrides: Partial<TemplateAuthoringNode> = {}) => ({
    nodeId: 'draft:rendered',
    sourceRef: null,
    sourceNodeId: null,
    capabilities: { keyframes: true, timing: true },
    timingReason: null,
    inSec: 0,
    outSec: 5,
    visible: true,
    position: [36, 36] as [number, number],
    scale: [100, 100] as [number, number],
    rotation: 0,
    opacity: 100,
    keyframeChannels: [],
    ...overrides,
  } as unknown as TemplateAuthoringNode);

  test('locks missing or separated native channel metadata and accepts only a positive exact inventory', () => {
    expect(channelLockReason(channel({ reason: 'roving keyframes are unsupported.' }))).toBe('roving keyframes are unsupported.');
    expect(channelLockReason(channel({ separated: null }))).toMatch(/Separated or unverified/);
    expect(channelLockReason(channel())).toBeNull();
  });

  test('snaps using the native rational frame rate without assuming 30 fps', () => {
    const frameRate = 24_000 / 1_001;
    expect(snapMotionTime(0.3, frameRate)).toBeCloseTo(7 / frameRate, 8);
    expect(snapMotionTime(0.5, 0)).toBe(0);
  });

  test('moves a key by exact frames, retains its identity and metadata, and blocks collisions', () => {
    const frames = [
      frame('first', 0, [1, 2, 3]),
      { ...frame('second', 1, [4, 5, 6]), outInterpolation: 'HOLD' as const },
    ] as unknown as Parameters<typeof moveMotionKeyframe>[0];
    const moved = moveMotionKeyframe(frames, 'first' as Parameters<typeof moveMotionKeyframe>[1], 1, 24);
    expect(moved?.[0]).toMatchObject({ keyframeId: 'first', timeSec: 1 / 24, value: [1, 2, 3] });
    expect(moved?.[1]).toMatchObject({ keyframeId: 'second', timeSec: 1, outInterpolation: 'HOLD' });
    expect(moveMotionKeyframe(frames, 'first' as Parameters<typeof moveMotionKeyframe>[1], 24, 24)).toBeNull();
    expect(moveMotionKeyframe(frames, 'missing' as Parameters<typeof moveMotionKeyframe>[1], 1, 24)).toBeNull();
  });

  test('samples linear three-value motion and preserves the native third component', () => {
    const sample = sampleMotionChannel(channel({ keyframes: [
      frame('source:first', 0, [0, 10, 17]),
      frame('source:second', 1, [20, 50, 19]),
    ] }), 0.5);
    expect(sample).toEqual({ value: [10, 30, 18], interpolation: 'LINEAR' });
  });

  test('samples hold segments and supported scalar Bezier metadata at endpoints and midpoint', () => {
    const hold = sampleMotionChannel(channel({ channel: 'opacity', dimensions: 1, keyframes: [
      frame('source:first', 0, 10, 'HOLD'),
      frame('source:second', 1, 90, 'HOLD'),
    ] }), 0.7);
    expect(hold).toEqual({ value: 10, interpolation: 'HOLD' });
    const ease = easeForCurve(10, 30, 2, [0.25, 0.1, 0.75, 0.9]);
    const bezierChannel = channel({ channel: 'opacity', dimensions: 1, keyframes: [
      { ...frame('source:first', 1, 10, 'BEZIER'), outEase: [ease.out] },
      { ...frame('source:second', 3, 30, 'BEZIER'), inEase: [ease.in] },
    ] });
    expect(sampleMotionChannel(bezierChannel, 1)).toEqual({ value: 10, interpolation: 'HOLD' });
    const midpoint = sampleMotionChannel(bezierChannel, 2);
    expect(midpoint.interpolation).toBe('BEZIER');
    if (midpoint.value === null) throw new Error(midpoint.reason);
    expect(midpoint.value).toBeCloseTo(20, 8);
    const quarter = sampleMotionChannel(bezierChannel, 1.5);
    const threeQuarter = sampleMotionChannel(bezierChannel, 2.5);
    if (quarter.value === null || threeQuarter.value === null || typeof quarter.value !== 'number' || typeof threeQuarter.value !== 'number')
      throw new Error('Expected scalar symmetry samples');
    expect(quarter.value + threeQuarter.value).toBeCloseTo(40, 8);
    expect(sampleMotionChannel(bezierChannel, 3)).toEqual({ value: 30, interpolation: 'HOLD' });
  });

  test('uses outgoing and incoming speed and influence to recover an asymmetric cubic curve', () => {
    const ease = easeForCurve(0, 20, 2, [0.2, 0.4, 0.8, 0.9]);
    const sample = sampleMotionChannel(channel({ channel: 'rotation', dimensions: 1, keyframes: [
      { ...frame('source:first', 0, 0, 'BEZIER'), outEase: [ease.out] },
      { ...frame('source:second', 2, 20, 'BEZIER'), inEase: [ease.in] },
    ] }), 1);
    expect(ease.out).toMatchObject({ speed: 20, influence: 20 });
    expect(ease.in.speed).toBeCloseTo(5, 8);
    expect(ease.in.influence).toBeCloseTo(20, 8);
    if (sample.value === null) throw new Error(sample.reason);
    expect(sample.value).toBeCloseTo(12.25, 8);
  });

  test('samples each Scale dimension from its own native ease and keeps a constant component', () => {
    const xEase = easeForCurve(0, 100, 1, [0.25, 0.1, 0.75, 0.9]);
    const yEase = easeForCurve(0, 10, 1, [0.25, 0.3, 0.75, 0.95]);
    const sample = sampleMotionChannel(channel({ channel: 'scale', dimensions: 3, keyframes: [
      { ...frame('source:first', 0, [0, 0, 7], 'BEZIER'), outEase: [xEase.out, yEase.out, { speed: 0, influence: 33.333 }] },
      { ...frame('source:second', 1, [100, 10, 7], 'BEZIER'), inEase: [xEase.in, yEase.in, { speed: 0, influence: 33.333 }] },
    ] }), 0.5);
    expect(sample.interpolation).toBe('BEZIER');
    if (sample.value === null || typeof sample.value === 'number') throw new Error('Expected a sampled Scale vector');
    expect(sample.value[0]).toBeCloseTo(50, 8);
    expect(sample.value[1]).toBeCloseTo(5.9375, 8);
    expect(sample.value[2]).toBe(7);
  });

  test('samples straight spatial Position with one path ease and preserves constant Z', () => {
    const ease = easeForCurve(0, 10, 1, [0.25, 0.1, 0.75, 0.9]);
    const sample = sampleMotionChannel(channel({ keyframes: [
      { ...frame('source:first', 0, [0, 2, 5], 'BEZIER'), outEase: [ease.out] },
      { ...frame('source:second', 1, [10, 2, 5], 'BEZIER'), inEase: [ease.in] },
    ] }), 0.5);
    expect(sample.interpolation).toBe('BEZIER');
    if (sample.value === null || typeof sample.value === 'number') throw new Error('Expected a sampled Position vector');
    expect(sample.value[0]).toBeCloseTo(5, 8);
    expect(sample.value[1]).toBe(2);
    expect(sample.value[2]).toBe(5);
  });

  test('projects all four supported generated-node channels into display-only poses at the playhead', () => {
    const node = generatedNode({
      keyframeChannels: [
        channel({ channel: 'position', keyframes: [frame('p0', 0, [36, 36, 0]), frame('p1', 5, [48, 42, 0])] }),
        channel({ channel: 'scale', dimensions: 3, keyframes: [frame('s0', 0, [100, 100, 100]), frame('s1', 5, [120, 140, 100])] }),
        channel({ channel: 'rotation', dimensions: 1, keyframes: [frame('r0', 0, 0), frame('r1', 5, 90)] }),
        channel({ channel: 'opacity', dimensions: 1, keyframes: [frame('o0', 0, 100), frame('o1', 5, 70)] }),
      ],
    });
    const original = structuredClone(node);
    const rows = sampleAuthoredRenderNodes([node], [node.nodeId], 2.2);
    expect(rows[0]).toMatchObject({ nodeId: node.nodeId, visible: true, position: [41.28, 38.64],
      scale: [108.8, 117.6], opacity: 86.8 });
    expect(rows[0]?.rotation).toBeCloseTo(39.6, 10);
    expect(node).toEqual(original);
    expect(sampleAuthoredRenderNodes([node], [node.nodeId], -1)[0]).toMatchObject({
      position: [36, 36], scale: [100, 100], rotation: 0, opacity: 100,
    });
    expect(sampleAuthoredRenderNodes([node], [node.nodeId], 6)[0]).toMatchObject({
      position: [48, 42], scale: [120, 140], rotation: 90, opacity: 70,
    });
  });

  test('keeps static pose when an empty channel carries a stale base value', () => {
    const emptyPositionChannel = channel({
      channel: 'position',
      keyframes: [],
      ...({ baseValue: [10, 20, 0] } as object),
    });
    const staticNode = generatedNode({
      capabilities: { keyframes: true, timing: false },
      position: [70, 80],
      keyframeChannels: [emptyPositionChannel],
    });

    expect(sampleAuthoredRenderNodes([staticNode], [staticNode.nodeId], 2.2)).toEqual([]);
    expect(staticNode.position).toEqual([70, 80]);

    const timedNode = generatedNode({
      capabilities: { keyframes: true, timing: true },
      position: [70, 80],
      keyframeChannels: [emptyPositionChannel],
    });
    expect(sampleAuthoredRenderNodes([timedNode], [timedNode.nodeId], 2.2)).toEqual([
      { nodeId: timedNode.nodeId, visible: true },
    ]);
  });

  test('keeps generated-node display sampling within verified channels, composition membership, and timing bounds', () => {
    const generated = generatedNode({
      inSec: 1,
      outSec: 3,
      keyframeChannels: [
        channel({ channel: 'position', reason: 'native expression is unsupported', keyframes: [frame('p0', 0, [0, 0, 0])] }),
        channel({ channel: 'opacity', dimensions: 1, keyframes: [frame('o0', 0, 100, 'HOLD'), frame('o1', 5, 10, 'HOLD')] }),
      ],
    });
    const source = generatedNode({ nodeId: 'aep:11:9', sourceRef: { compId: 11, layerId: 9 } });
    expect(sampleAuthoredRenderNodes([generated, source], [generated.nodeId, source.nodeId], 0.5))
      .toEqual([{ nodeId: generated.nodeId, visible: false, opacity: 100 }]);
    expect(sampleAuthoredRenderNodes([generated], [generated.nodeId], 2))
      .toEqual([{ nodeId: generated.nodeId, visible: true, opacity: 100 }]);
    expect(sampleAuthoredRenderNodes([generated], [generated.nodeId], 3))
      .toEqual([{ nodeId: generated.nodeId, visible: false, opacity: 100 }]);
    expect(sampleAuthoredRenderNodes([generated], [], 2)).toEqual([]);
  });

  test('keeps proven group and child motion visible when static transform or visibility edits are locked', () => {
    const group = generatedNode({
      kind: 'group',
      transformLocks: { position: 'Animated group position is read-only.' },
      capabilities: { keyframes: true, timing: true, transform: false, visibility: false },
      keyframeChannels: [channel({ keyframes: [frame('g0', 0, [10, 20, 0]), frame('g1', 1, [30, 40, 0])] })],
    });
    const child = generatedNode({
      nodeId: 'draft:rendered-child',
      parentNodeId: group.nodeId,
      transformLocks: { position: 'The animated parent locks static child transforms.' },
      capabilities: { keyframes: true, timing: true, transform: false, visibility: false },
      keyframeChannels: [channel({ channel: 'opacity', dimensions: 1, keyframes: [frame('c0', 0, 100), frame('c1', 1, 40)] })],
    });
    const unsupported = generatedNode({
      nodeId: 'draft:unsupported-channel',
      keyframeChannels: [channel({ reason: 'native expression is unsupported', keyframes: [frame('u0', 0, [1, 2, 0])] })],
    });
    const samples = sampleAuthoredRenderNodes([group, child, unsupported], [group.nodeId, child.nodeId, unsupported.nodeId], 0.5);
    expect(samples).toEqual([
      { nodeId: group.nodeId, visible: true, position: [20, 30] },
      { nodeId: child.nodeId, visible: true, opacity: 70 },
      { nodeId: unsupported.nodeId, visible: true },
    ]);
  });

  test('uses the shared sampler for authored HOLD and Bezier display values', () => {
    const ease = easeForCurve(0, 20, 2, [0.2, 0.4, 0.8, 0.9]);
    const node = generatedNode({
      keyframeChannels: [
        channel({ channel: 'position', keyframes: [frame('p0', 0, [4, 5, 0], 'HOLD'), frame('p1', 2, [8, 9, 0], 'HOLD')] }),
        channel({ channel: 'rotation', dimensions: 1, keyframes: [
          { ...frame('r0', 0, 0, 'BEZIER'), outEase: [ease.out] },
          { ...frame('r1', 2, 20, 'BEZIER'), inEase: [ease.in] },
        ] }),
      ],
    });
    const sample = sampleAuthoredRenderNodes([node], [node.nodeId], 1)[0];
    expect(sample).toMatchObject({ position: [4, 5] });
    expect(sample?.rotation).toBeCloseTo(12.25, 8);
  });

  test('keeps mixed endpoint modes and unsupported Position Z motion unavailable with specific reasons', () => {
    const mixed = sampleMotionChannel(channel({ keyframes: [
      { ...frame('source:first', 0, [0, 0, 5], 'BEZIER'), outInterpolation: 'BEZIER' },
      { ...frame('source:second', 1, [10, 10, 5], 'LINEAR'), inInterpolation: 'LINEAR' },
    ] }), 0.5);
    expect(mixed.value).toBeNull();
    expect(mixed.reason).toContain('mixes outgoing BEZIER and incoming LINEAR');
    const zMotion = sampleMotionChannel(channel({ keyframes: [
      { ...frame('source:first', 0, [0, 0, 0], 'BEZIER'), outEase: [{ speed: 4, influence: 33 }] },
      { ...frame('source:second', 1, [10, 10, 1], 'BEZIER'), inEase: [{ speed: 4, influence: 33 }] },
    ] }), 0.5);
    expect(zMotion.value).toBeNull();
    expect(zMotion.reason).toContain('change Z');
  });

  test('reports malformed native easing instead of coercing it', () => {
    const sample = sampleMotionChannel(channel({ channel: 'opacity', dimensions: 1, keyframes: [
      { ...frame('source:first', 0, 10, 'BEZIER'), outEase: [] },
      { ...frame('source:second', 1, 90, 'BEZIER'), inEase: [{ speed: 4, influence: 0 }] },
    ] }), 0.5);
    expect(sample.value).toBeNull();
    expect(sample.reason).toMatch(/missing or invalid|one ease component/);
    const extraEase = sampleMotionChannel(channel({ channel: 'opacity', dimensions: 1, keyframes: [
      { ...frame('source:first', 0, 10, 'BEZIER'), outEase: [{ speed: 1, influence: 25 }, { speed: 1, influence: 25 }] },
      { ...frame('source:second', 1, 90, 'BEZIER'), inEase: [{ speed: 1, influence: 25 }] },
    ] }), 0.5);
    expect(extraEase.value).toBeNull();
    expect(extraEase.reason).toContain('one ease component');
  });

  test('uses native ease cardinality and a single Path control for Position', () => {
    expect(motionEaseDimensions(channel())).toBe(1);
    expect(motionEaseDimensions(channel({ channel: 'scale', dimensions: 3 }))).toBe(3);
    expect(motionEaseDimensions(channel({ channel: 'rotation', dimensions: 1 }))).toBe(1);
    expect(motionEaseAxisLabel(channel(), 0)).toBe('Path');
    expect(motionEaseAxisLabel(channel({ channel: 'scale', dimensions: 3 }), 1)).toBe('Y');
  });

  test('a replacement preserves imported source IDs and existing draft IDs', () => {
    const sourceId = `source:${'a'.repeat(64)}:aep:11:9:ADBE Position:0`;
    const channelWithKeys = channel({ keyframes: [
      frame(sourceId, 0, [1, 2, 3]),
      frame('draft:00000000-0000-4000-8000-000000000001', 1, [4, 5, 6]),
    ] as TemplateAuthoringNode['keyframeChannels'][number]['keyframes'] });
    const result = keyframeCommandFrames(channelWithKeys);
    expect(result[0]?.keyframeId).toBe(sourceId);
    expect(result[1]?.keyframeId).toBe('draft:00000000-0000-4000-8000-000000000001');
    expect(result[0]?.value).toEqual([1, 2, 3]);
  });
});
