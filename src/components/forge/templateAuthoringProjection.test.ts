import { describe, expect, test } from 'bun:test';
import { templateAuthoringNodeSchema, type TemplateAuthoringDocument, type TemplateAuthoringNode } from '@continuum/contracts';
import {
  canMutateTemplateAuthoringSourceGroup,
  canUngroupTemplateNode,
  projectTemplateAuthoringCommands,
  supportsAnimatedDirectChildUngroup,
  templateAuthoringSourceGroupMemberIds,
} from './templateAuthoringProjection';
import { appendLayerDraftCommand, commandsFromLayerSnapshot, layerSnapshotFromCommands } from './layerDraft';
import { createLayerHistory, redoLayerHistory, undoLayerHistory, updateLayerHistory } from './layerHistory';

const capabilities = {
  transform: true, visibility: true, font: true, text: false, order: true, exposure: true,
  creation: false, duplicate: true, delete: true, grouping: false, masks: false,
  artboardMutation: false, timing: false, keyframes: false,
};
const source: TemplateAuthoringDocument = {
  scope: { brandId: '10000000-0000-4000-8000-000000000001', assetId: '10000000-0000-4000-8000-000000000002', baseVersionId: '10000000-0000-4000-8000-000000000003' },
  sourceChecksum: 'a'.repeat(64), sourceHeadVersionId: '10000000-0000-4000-8000-000000000003',
  readiness: 'ready', diagnostics: [], exposureKeys: [], fontChoices: [],
  compositions: [{ compId: 11, name: 'Main', width: 400, height: 300, frameRate: 30, durationSec: 2, clock: {}, parentCompIds: [], orderReason: null, creationReason: null, nodeIds: ['aep:11:9'] }],
  nodes: [{ nodeId: 'aep:11:9', sourceRef: { compId: 11, layerId: 9 }, sourceNodeId: null, sourceCompositionId: 11, parentNodeId: null, name: 'Title', textContent: 'Title', fontRef: null, fillColor: [1, 1, 1], kind: 'text', shape: null, size: null, pathPosition: null, fill: null, stroke: null, inSec: null, outSec: null, timingReason: null, keyframeChannels: [], index: 0, visible: true, visibilityReason: null, textReason: null, fontReason: null, font: 'Studio-Regular', fontSize: 30, position: [10, 20], rotation: 0, scale: [100, 100], opacity: 100, transformLocks: {}, capabilities, duplicateReason: null, deleteReason: null, opaqueSourceRef: { versionId: '10000000-0000-4000-8000-000000000003', checksum: 'a'.repeat(64) } }],
  opaqueSourceRef: { versionId: '10000000-0000-4000-8000-000000000003', checksum: 'a'.repeat(64), authority: 'pinned-source-package' },
};

const verifiedSourceGroup = (): TemplateAuthoringDocument => {
  const groupId = 'draft:20000000-0000-4000-8000-000000000071';
  const firstId = 'draft:20000000-0000-4000-8000-000000000072';
  const secondId = 'draft:20000000-0000-4000-8000-000000000073';
  const first = {
    ...structuredClone(source.nodes[0]!), nodeId: firstId, sourceRef: { compId: 11, layerId: 9 },
    sourceCompositionId: 11, parentNodeId: groupId, position: [10, 20] as [number, number],
    keyframeChannels: [{ channelId: `${firstId}:ADBE Opacity`, channel: 'opacity' as const,
      matchName: 'ADBE Opacity', frameRate: 30, dimensions: 1, separated: false,
      baseValue: 80, reason: null, propertyReason: null, propertyBaseValue: 80, keyframes: [] }],
  };
  const second = {
    ...structuredClone(source.nodes[0]!), nodeId: secondId, sourceRef: { compId: 11, layerId: 10 },
    sourceCompositionId: 11, parentNodeId: groupId, position: [30, 40] as [number, number],
  };
  const group = {
    ...structuredClone(source.nodes[0]!), nodeId: groupId, sourceRef: { compId: 11, layerId: 50 },
    sourceCompositionId: 11, parentNodeId: null, name: 'Committed group', textContent: null,
    fontRef: null, fillColor: null, kind: 'group' as const, shape: null, size: null, pathPosition: null,
    fill: null, stroke: null, font: null, fontSize: null, position: [50, 60] as [number, number],
    rotation: 0, scale: [100, 100] as [number, number], opacity: 100,
    keyframeChannels: [
      { channelId: `${groupId}:ADBE Position`, channel: 'position' as const, matchName: 'ADBE Position', frameRate: 30, dimensions: 3, separated: false, baseValue: [50, 60, 0] as [number, number, number], reason: null, propertyReason: null, propertyBaseValue: [50, 60, 0] as [number, number, number], keyframes: [] },
      { channelId: `${groupId}:ADBE Scale`, channel: 'scale' as const, matchName: 'ADBE Scale', frameRate: 30, dimensions: 3, separated: false, baseValue: [100, 100, 100] as [number, number, number], reason: null, propertyReason: null, propertyBaseValue: [100, 100, 100] as [number, number, number], keyframes: [] },
      { channelId: `${groupId}:ADBE Rotate Z`, channel: 'rotation' as const, matchName: 'ADBE Rotate Z', frameRate: 30, dimensions: 1, separated: false, baseValue: 0, reason: null, propertyReason: null, propertyBaseValue: 0, keyframes: [] },
    ],
  };
  return {
    ...structuredClone(source),
    sourceAuthoringContext: {
      artifactId: '10000000-0000-4000-8000-000000000008',
      versionId: source.sourceHeadVersionId,
      packageChecksum: source.sourceChecksum,
      identityMap: [{ nodeId: groupId, compId: 11, persistedUid: 50, sourceUid: 500,
        members: [
          { nodeId: firstId, persistedUid: 9, parentUid: 50 },
          { nodeId: secondId, persistedUid: 10, parentUid: 50 },
        ] }],
      freshArtboardReceipts: [],
    },
    compositions: [{ ...structuredClone(source.compositions[0]!), nodeIds: [groupId, firstId, secondId] }],
    nodes: [group, first, second],
  };
};

describe('projectTemplateAuthoringCommands', () => {
  test('reopens a receipt-verified source group, histories static transform, and ungroups exact source members', () => {
    const document = verifiedSourceGroup();
    const groupId = document.sourceAuthoringContext!.identityMap[0]!.nodeId;
    const members = templateAuthoringSourceGroupMemberIds(document, groupId)!;
    expect(members).toHaveLength(2);
    expect(canMutateTemplateAuthoringSourceGroup(document, groupId)).toBe(true);
    expect(canUngroupTemplateNode([], groupId, document)).toBe(true);
    const serverLockedGroup = structuredClone(document);
    serverLockedGroup.nodes.find((node) => node.nodeId === groupId)!.capabilities.transform = false;
    expect(canMutateTemplateAuthoringSourceGroup(serverLockedGroup, groupId)).toBe(false);
    expect(canUngroupTemplateNode([], groupId, serverLockedGroup)).toBe(false);
    const partiallyLockedGroup = structuredClone(document);
    partiallyLockedGroup.nodes.find((node) => node.nodeId === groupId)!.transformLocks.position = 'unknown_native_position_lock';
    expect(canMutateTemplateAuthoringSourceGroup(partiallyLockedGroup, groupId)).toBe(false);
    expect(canUngroupTemplateNode([], groupId, partiallyLockedGroup)).toBe(false);

    const transform = { type: 'layer.group.transform' as const, nodeId: groupId,
      transform: { position: [70, 80] as [number, number], rotation: 15 } };
    const initial = createLayerHistory({ edits: {}, orders: {}, nodeOrders: {}, exposures: {}, operations: [] });
    const changed = updateLayerHistory(initial, appendLayerDraftCommand(initial.present, transform));
    const reloadedCommands = commandsFromLayerSnapshot(layerSnapshotFromCommands(commandsFromLayerSnapshot(changed.present)));
    expect(reloadedCommands).toEqual([transform]);
    expect(projectTemplateAuthoringCommands(document, reloadedCommands).nodes.find((node) => node.nodeId === groupId))
      .toMatchObject({ position: [70, 80], rotation: 15, sourceRef: { compId: 11, layerId: 50 } });
    expect(commandsFromLayerSnapshot(undoLayerHistory(changed).present)).toEqual([]);
    expect(commandsFromLayerSnapshot(redoLayerHistory(undoLayerHistory(changed)).present)).toEqual([transform]);

    const projected = projectTemplateAuthoringCommands(document, [transform, { type: 'layer.ungroup', nodeId: groupId }]);
    expect(projected.nodes.some((node) => node.nodeId === groupId)).toBe(false);
    for (const [index, nodeId] of members.entries()) {
      const member = projected.nodes.find((node) => node.nodeId === nodeId)!;
      expect(member).toMatchObject({
        nodeId, parentNodeId: null,
        sourceRef: { compId: 11, layerId: index === 0 ? 9 : 10 },
      });
    }
    expect(projected.nodes.find((node) => node.nodeId === members[0])?.keyframeChannels).toContainEqual(
      expect.objectContaining({ channel: 'opacity', baseValue: 80, keyframes: [] }),
    );
    expect(document.sourceAuthoringContext).toEqual(verifiedSourceGroup().sourceAuthoringContext);
  });

  test('keeps parented committed groups locked for static transform and ungroup', () => {
    const document = verifiedSourceGroup();
    const groupId = document.sourceAuthoringContext!.identityMap[0]!.nodeId;
    const parentId = 'draft:20000000-0000-4000-8000-000000000091';
    const extraId = 'draft:20000000-0000-4000-8000-000000000092';
    const group = document.nodes.find((node) => node.nodeId === groupId)!;
    group.capabilities.transform = false;
    group.transformLocks = {
      position: 'native_parent_hierarchy_unsupported_for_transform_edits',
      scale: 'native_parent_hierarchy_unsupported',
      opacity: 'preserve native opacity lock',
    };
    const extra = {
      ...structuredClone(document.nodes.find((node) => node.nodeId !== groupId)!),
      nodeId: extraId, sourceRef: { compId: 11, layerId: 12 }, parentNodeId: parentId,
    };
    const parent = {
      ...structuredClone(group), nodeId: parentId, sourceRef: { compId: 11, layerId: 60 },
      sourceNodeId: null, parentNodeId: null, capabilities: { ...group.capabilities, transform: true }, transformLocks: {},
    };
    group.parentNodeId = parentId;
    document.nodes.push(parent, extra);
    document.compositions[0]!.nodeIds = [parentId, groupId, ...document.sourceAuthoringContext!.identityMap[0]!.members!.map((member) => member.nodeId), extraId];
    document.sourceAuthoringContext!.identityMap.push({
      nodeId: parentId, compId: 11, persistedUid: 60, sourceUid: 600,
      members: [
        { nodeId: groupId, persistedUid: 50, parentUid: 60 },
        { nodeId: extraId, persistedUid: 12, parentUid: 60 },
      ],
    });
    document.sourceAuthoringContext!.freshArtboardReceipts.push({ compId: 11, sourceCompId: null, name: 'Fresh composition',
      width: 640, height: 480, frameRate: 30, durationSec: 5, layerUidMap: [] });
    expect(templateAuthoringSourceGroupMemberIds(document, groupId)).toEqual(expect.any(Array));
    expect(canMutateTemplateAuthoringSourceGroup(document, groupId)).toBe(false);
    expect(canUngroupTemplateNode([], groupId, document)).toBe(false);
    const replayed = projectTemplateAuthoringCommands(document, [
      { type: 'layer.ungroup', nodeId: parentId },
      { type: 'layer.group.transform', nodeId: groupId, transform: { rotation: 18 } },
      { type: 'layer.ungroup', nodeId: groupId },
    ]);
    expect(replayed.nodes.find((node) => node.nodeId === groupId)).toBeUndefined();
    const restoredGroup = projectTemplateAuthoringCommands(document, [{ type: 'layer.ungroup', nodeId: parentId }])
      .nodes.find((node) => node.nodeId === groupId)!;
    expect(restoredGroup).toMatchObject({ parentNodeId: null, capabilities: { transform: true }, rotation: 0 });
    expect(restoredGroup.transformLocks).toMatchObject({ opacity: 'preserve native opacity lock' });
    const unknownLock = structuredClone(document);
    unknownLock.nodes.find((node) => node.nodeId === groupId)!.transformLocks.position = 'unknown native restriction';
    const unknownLockProjection = projectTemplateAuthoringCommands(unknownLock, [{ type: 'layer.ungroup', nodeId: parentId }]);
    expect(unknownLockProjection.nodes.find((node) => node.nodeId === groupId)).toMatchObject({
      capabilities: { transform: false }, transformLocks: { position: 'unknown native restriction' },
    });
  });

  test('refuses static source group edits when provenance is missing or mismatched, while preserving verified animated channels', () => {
    const sourceGroup = verifiedSourceGroup();
    const groupId = sourceGroup.sourceAuthoringContext!.identityMap[0]!.nodeId;
    const transform = { type: 'layer.group.transform' as const, nodeId: groupId, transform: { position: [90, 100] as [number, number] } };
    const ungroup = { type: 'layer.ungroup' as const, nodeId: groupId };
    for (const invalid of [
      (() => { const value = structuredClone(sourceGroup); delete value.sourceAuthoringContext; return value; })(),
      (() => { const value = structuredClone(sourceGroup); value.sourceAuthoringContext!.versionId = '10000000-0000-4000-8000-000000000009'; return value; })(),
      (() => { const value = structuredClone(sourceGroup); value.sourceAuthoringContext!.identityMap[0]!.members![0]!.persistedUid = 99; return value; })(),
    ]) {
      expect(canMutateTemplateAuthoringSourceGroup(invalid, groupId)).toBe(false);
      expect(canUngroupTemplateNode([transform], groupId, invalid)).toBe(false);
      expect(projectTemplateAuthoringCommands(invalid, [transform, ungroup]).nodes.some((node) => node.nodeId === groupId)).toBe(true);
    }
    const animated = structuredClone(sourceGroup);
    const animatedGroup = animated.nodes.find((node) => node.nodeId === groupId)!;
    animatedGroup.capabilities = { ...animatedGroup.capabilities, keyframes: true, transform: true };
    animatedGroup.keyframeChannels[0]!.keyframes.push({
      keyframeId: 'draft:20000000-0000-4000-8000-000000000074', timeSec: 1, value: [60, 60, 0],
      inInterpolation: 'LINEAR', outInterpolation: 'LINEAR',
    });
    const animatedProjection = projectTemplateAuthoringCommands(animated, []);
    const projectedAnimatedGroup = animatedProjection.nodes.find((node) => node.nodeId === groupId)!;
    expect(projectedAnimatedGroup.capabilities).toMatchObject({ keyframes: true, transform: true });
    expect(projectedAnimatedGroup.keyframeChannels.find((channel) => channel.channel === 'position'))
      .toMatchObject({ reason: null, keyframes: [expect.any(Object)] });
    expect(canMutateTemplateAuthoringSourceGroup(animated, groupId)).toBe(false);
    expect(canUngroupTemplateNode([transform], groupId, animated)).toBe(false);
    expect(projectTemplateAuthoringCommands(animated, [transform, ungroup]).nodes.some((node) => node.nodeId === groupId)).toBe(true);
  });

  test('ungroups receipt-backed direct-child motion by translating Position base and keys only', () => {
    const document = verifiedSourceGroup();
    const groupId = document.sourceAuthoringContext!.identityMap[0]!.nodeId;
    const firstId = document.sourceAuthoringContext!.identityMap[0]!.members![0]!.nodeId;
    const group = document.nodes.find((node) => node.nodeId === groupId)!;
    group.position = [50, 60];
    group.opacity = 0;
    group.ungroupTranslationReason = null;
    group.positionSource = { kind: 'explicit', value: [50.004, 60.004, 0], reason: null };
    group.keyframeChannels[0]!.baseValue = [50.004, 60.004, 0];
    group.transformLocks = { position: 'authoring_animated_group_static_transform_locked',
      rotation: 'authoring_animated_group_static_transform_locked', scale: 'authoring_animated_group_static_transform_locked' };
    const first = document.nodes.find((node) => node.nodeId === firstId)!;
    first.ungroupTranslationReason = null;
    first.positionSource = { kind: 'keyframed', value: null, reason: null };
    first.keyframeChannels = [
      { channelId: `${firstId}:ADBE Position`, channel: 'position', matchName: 'ADBE Position', frameRate: 30,
        dimensions: 3, separated: false, baseValue: null, reason: null, propertyReason: null, propertyBaseValue: null, keyframes: [
          { keyframeId: 'position-1', timeSec: 0.25, value: [1, 2, 7], inInterpolation: 'BEZIER', outInterpolation: 'BEZIER',
            inEase: [{ speed: 2, influence: 33 }], outEase: [{ speed: 4, influence: 44 }], nativeFrame: 7 },
          { keyframeId: 'position-2', timeSec: 1.5, value: [30, 40, 7], inInterpolation: 'LINEAR', outInterpolation: 'HOLD',
            inEase: [], outEase: [], nativeFrameIndex: 45 },
        ] },
      { channelId: `${firstId}:ADBE Scale`, channel: 'scale', matchName: 'ADBE Scale', frameRate: 30,
        dimensions: 3, separated: false, baseValue: [100, 100, 100], reason: null, propertyReason: null, propertyBaseValue: [100, 100, 100], keyframes: [
          { keyframeId: 'scale-1', timeSec: 0.5, value: [120, 110, 100], inInterpolation: 'LINEAR', outInterpolation: 'BEZIER', inEase: [], outEase: [{ speed: 0, influence: 50 }] },
        ] },
      { channelId: `${firstId}:ADBE Rotate Z`, channel: 'rotation', matchName: 'ADBE Rotate Z', frameRate: 30,
        dimensions: 1, separated: false, baseValue: 0, reason: null, propertyReason: null, propertyBaseValue: 0, keyframes: [
          { keyframeId: 'rotation-1', timeSec: 0.75, value: 15, inInterpolation: 'LINEAR', outInterpolation: 'LINEAR', inEase: [], outEase: [] },
        ] },
      { channelId: `${firstId}:ADBE Opacity`, channel: 'opacity', matchName: 'ADBE Opacity', frameRate: 30,
        dimensions: 1, separated: false, baseValue: 100, reason: null, propertyReason: null, propertyBaseValue: 100, keyframes: [
          { keyframeId: 'opacity-1', timeSec: 1, value: 65, inInterpolation: 'HOLD', outInterpolation: 'HOLD', inEase: [], outEase: [] },
        ] },
    ];
    document.nodes.find((node) => node.nodeId === document.sourceAuthoringContext!.identityMap[0]!.members![1]!.nodeId)!.ungroupTranslationReason = null;
    expect(canMutateTemplateAuthoringSourceGroup(document, groupId)).toBe(false);
    expect(supportsAnimatedDirectChildUngroup(document, groupId)).toBe(true);
    expect(canUngroupTemplateNode([], groupId, document)).toBe(true);

    const command = { type: 'layer.ungroup' as const, nodeId: groupId };
    const history = updateLayerHistory(
      createLayerHistory({ edits: {}, orders: {}, nodeOrders: {}, exposures: {}, operations: [] }),
      appendLayerDraftCommand({ edits: {}, orders: {}, nodeOrders: {}, exposures: {}, operations: [] }, command),
    );
    const beforeUndo = projectTemplateAuthoringCommands(document, commandsFromLayerSnapshot(history.present));
    const undoneCommands = commandsFromLayerSnapshot(undoLayerHistory(history).present);
    expect(undoneCommands).toEqual([]);
    expect(projectTemplateAuthoringCommands(document, undoneCommands).nodes.some((node) => node.nodeId === groupId)).toBe(true);
    const redoneCommands = commandsFromLayerSnapshot(redoLayerHistory(undoLayerHistory(history)).present);
    expect(redoneCommands).toEqual([command]);
    const projected = projectTemplateAuthoringCommands(document, redoneCommands);
    expect(projected.nodes.some((node) => node.nodeId === groupId)).toBe(false);
    const ungrouped = projected.nodes.find((node) => node.nodeId === firstId)!;
    expect(ungrouped).toMatchObject({ parentNodeId: null, positionSource: { kind: 'keyframed', value: null } });
    expect(ungrouped.position?.[0]).toBeCloseTo(60.004, 10);
    expect(ungrouped.position?.[1]).toBeCloseTo(80.004, 10);
    expect(ungrouped.keyframeChannels.find((channel) => channel.channel === 'position')).toMatchObject({
      baseValue: null, keyframes: [
        { keyframeId: 'position-1', timeSec: 0.25, value: [51.004, 62.004, 7], inInterpolation: 'BEZIER', outInterpolation: 'BEZIER',
          inEase: [{ speed: 2, influence: 33 }], outEase: [{ speed: 4, influence: 44 }], nativeFrame: 7 },
        { keyframeId: 'position-2', timeSec: 1.5, nativeFrameIndex: 45 },
      ],
    });
    const shiftedLastPosition = ungrouped.keyframeChannels.find((channel) => channel.channel === 'position')?.keyframes[1]?.value;
    expect(Array.isArray(shiftedLastPosition) ? shiftedLastPosition[0] : NaN).toBeCloseTo(80.004, 10);
    expect(Array.isArray(shiftedLastPosition) ? shiftedLastPosition[1] : NaN).toBeCloseTo(100.004, 10);
    expect(ungrouped.keyframeChannels.find((channel) => channel.channel === 'scale')?.keyframes[0]?.value).toEqual([120, 110, 100]);
    expect(ungrouped.keyframeChannels.find((channel) => channel.channel === 'rotation')?.keyframes[0]?.value).toBe(15);
    expect(ungrouped.keyframeChannels.find((channel) => channel.channel === 'opacity')?.keyframes[0]?.value).toBe(65);
    expect(beforeUndo.nodes.some((node) => node.nodeId === groupId)).toBe(false);
    expect(document.sourceAuthoringContext).toEqual(verifiedSourceGroup().sourceAuthoringContext);

    const parentAnimated = structuredClone(document);
    parentAnimated.nodes.find((node) => node.nodeId === groupId)!.keyframeChannels[0]!.keyframes.push({
      keyframeId: 'group-position-key', timeSec: 0.5, value: [55, 60, 0], inInterpolation: 'LINEAR', outInterpolation: 'LINEAR',
    });
    expect(supportsAnimatedDirectChildUngroup(parentAnimated, groupId)).toBe(false);
    expect(canUngroupTemplateNode([], groupId, parentAnimated)).toBe(false);
    expect(canMutateTemplateAuthoringSourceGroup(parentAnimated, groupId)).toBe(false);
    const transformed = structuredClone(document);
    transformed.nodes.find((node) => node.nodeId === groupId)!.scale = [110, 100];
    expect(supportsAnimatedDirectChildUngroup(transformed, groupId)).toBe(false);
    const unknownLock = structuredClone(document);
    unknownLock.nodes.find((node) => node.nodeId === groupId)!.transformLocks.position = 'unknown_native_lock';
    expect(supportsAnimatedDirectChildUngroup(unknownLock, groupId)).toBe(false);
    const unsupported = structuredClone(document);
    unsupported.nodes.find((node) => node.nodeId === firstId)!.keyframeChannels[0]!.reason = 'position expression unsupported';
    expect(supportsAnimatedDirectChildUngroup(unsupported, groupId)).toBe(false);
    const nested = structuredClone(document);
    nested.nodes.push({ ...nested.nodes[2]!, nodeId: 'draft:20000000-0000-4000-8000-000000000099', parentNodeId: firstId });
    expect(supportsAnimatedDirectChildUngroup(nested, groupId)).toBe(false);
  });

  test('accepts only source-proven parent-only keyframe locks and restores unkeyed property bases after ungroup', () => {
    const document = verifiedSourceGroup();
    const [receipt] = document.sourceAuthoringContext!.identityMap;
    const groupId = receipt!.nodeId;
    const firstId = receipt!.members![0]!.nodeId;
    const secondId = receipt!.members![1]!.nodeId;
    const parentLock = (layerId: number) =>
      `layer UID ${layerId} is parented or has child layers; transform keyframe editing this rig is locked`;
    const channel = (nodeId: string, layerId: number, name: string, kind: 'position' | 'scale' | 'rotation' | 'opacity',
      propertyBaseValue: number | [number, number, number] | null, keyframes: TemplateAuthoringNode['keyframeChannels'][number]['keyframes'] = []) => ({
      channelId: `${nodeId}:${name}`, channel: kind, matchName: name, frameRate: 30,
      dimensions: kind === 'position' || kind === 'scale' ? 3 : 1, separated: false,
      baseValue: null, reason: parentLock(layerId),
      propertyReason: null, propertyBaseValue, keyframes,
    });
    const group = document.nodes.find((node) => node.nodeId === groupId)!;
    group.position = [50, 60];
    group.opacity = 0;
    group.positionSource = { kind: 'explicit', value: [50.004, 60.004, 0], reason: null };
    group.ungroupTranslationReason = null;
    group.transformLocks = {
      position: 'native_parent_hierarchy_unsupported',
      rotation: 'native_parent_hierarchy_unsupported_for_transform_edits',
      scale: 'native_parent_hierarchy_unsupported',
    };
    group.keyframeChannels = [
      channel(groupId, 50, 'ADBE Position', 'position', [50.004, 60.004, 0]),
      channel(groupId, 50, 'ADBE Scale', 'scale', [100, 100, 100]),
      channel(groupId, 50, 'ADBE Rotate Z', 'rotation', 0),
      { ...channel(groupId, 50, 'ADBE Opacity', 'opacity', 0), reason: 'authoring_group_opacity_locked' },
    ];
    const first = document.nodes.find((node) => node.nodeId === firstId)!;
    first.ungroupTranslationReason = null;
    first.positionSource = { kind: 'keyframed', value: null, reason: null };
    first.keyframeChannels = [
      channel(firstId, 9, 'ADBE Position', 'position', null, [{ keyframeId: 'source-position', timeSec: 0.5,
        nativeTimeSec: 0.5002, value: [1, 2, 7], inInterpolation: 'BEZIER', outInterpolation: 'LINEAR',
        inEase: [{ speed: 2, influence: 30 }], outEase: [], nativeFrameIndex: 15, nativeFrame: 15 }]),
      channel(firstId, 9, 'ADBE Scale', 'scale', [100, 100, 100]),
      channel(firstId, 9, 'ADBE Rotate Z', 'rotation', 0),
      channel(firstId, 9, 'ADBE Opacity', 'opacity', 100),
    ];
    const second = document.nodes.find((node) => node.nodeId === secondId)!;
    second.ungroupTranslationReason = null;
    second.positionSource = { kind: 'explicit', value: [30, 40, 0], reason: null };
    second.keyframeChannels = [
      channel(secondId, 10, 'ADBE Position', 'position', [30, 40, 0]),
      channel(secondId, 10, 'ADBE Scale', 'scale', [100, 100, 100]),
      channel(secondId, 10, 'ADBE Rotate Z', 'rotation', 0),
      channel(secondId, 10, 'ADBE Opacity', 'opacity', 100),
    ];
    expect(supportsAnimatedDirectChildUngroup(document, groupId)).toBe(true);
    expect(canUngroupTemplateNode([], groupId, document)).toBe(true);

    const projected = projectTemplateAuthoringCommands(document, [{ type: 'layer.ungroup', nodeId: groupId }]);
    const ungrouped = projected.nodes.find((node) => node.nodeId === firstId)!;
    expect(ungrouped.positionSource).toEqual({ kind: 'keyframed', value: null, reason: null });
    expect(ungrouped.keyframeChannels.map((item) => item.reason)).toEqual([null, null, null, null]);
    expect(ungrouped.keyframeChannels.find((item) => item.channel === 'position')).toMatchObject({
      baseValue: null, propertyBaseValue: null,
      keyframes: [{ keyframeId: 'source-position', timeSec: 0.5, nativeTimeSec: 0.5002, value: [51.004, 62.004, 7],
        inInterpolation: 'BEZIER', outInterpolation: 'LINEAR', nativeFrameIndex: 15 }],
    });
    expect(ungrouped.keyframeChannels.find((item) => item.channel === 'scale'))
      .toMatchObject({ baseValue: [100, 100, 100], propertyBaseValue: [100, 100, 100] });

    const unsupported = structuredClone(document);
    unsupported.nodes.find((node) => node.nodeId === firstId)!.keyframeChannels[0]!.propertyReason = 'native_expression_unsupported';
    expect(supportsAnimatedDirectChildUngroup(unsupported, groupId)).toBe(false);
    const unknownParentReason = structuredClone(document);
    unknownParentReason.nodes.find((node) => node.nodeId === firstId)!.keyframeChannels[0]!.reason = 'some other native lock';
    expect(supportsAnimatedDirectChildUngroup(unknownParentReason, groupId)).toBe(false);
  });

  test('ungroups a same-draft group after a child Position track is added', () => {
    const artboardId = '20000000-0000-4000-8000-000000000081';
    const firstId = 'draft:20000000-0000-4000-8000-000000000082';
    const secondId = 'draft:20000000-0000-4000-8000-000000000083';
    const groupId = 'draft:20000000-0000-4000-8000-000000000084';
    const commands = [
      { type: 'artboard.create', artboardId, name: 'Motion pair', width: 400, height: 300, frameRate: 30, durationSec: 2 },
      ...[firstId, secondId].map((nodeId, index) => ({
        type: 'shape.create' as const, nodeId, artboardId, shape: 'rectangle' as const, name: `Shape ${index}`,
        position: [100 + index * 40, 100] as [number, number], size: [30, 20] as [number, number],
        fill: { type: 'none' as const }, stroke: { type: 'none' as const },
      })),
      { type: 'layer.group', nodeId: groupId, artboardId, name: 'Motion pair', memberNodeIds: [firstId, secondId] },
      { type: 'layer.group.transform', nodeId: groupId, transform: { position: [0.125, 0.25] as [number, number] } },
      { type: 'layer.keyframes.replace', nodeId: firstId, channel: 'position', channelId: `authoring:${firstId}:ADBE Position`,
        keyframes: [{ keyframeId: 'draft:20000000-0000-4000-8000-000000000085', timeSec: 0.5, value: [110, 120, 0],
          inInterpolation: 'BEZIER' as const, outInterpolation: 'LINEAR' as const, inEase: [{ speed: 3, influence: 40 }],
          outEase: [], nativeFrameIndex: 15 }] },
    ] as const;
    const beforeUngroup = projectTemplateAuthoringCommands(structuredClone(source), commands);
    expect(supportsAnimatedDirectChildUngroup(beforeUngroup, groupId)).toBe(true);
    const projected = projectTemplateAuthoringCommands(structuredClone(source), [...commands, { type: 'layer.ungroup', nodeId: groupId }]);
    expect(projected.nodes.some((node) => node.nodeId === groupId)).toBe(false);
    expect(projected.nodes.find((node) => node.nodeId === firstId)).toMatchObject({ parentNodeId: null, position: [100.125, 100.25],
      positionSource: { kind: 'keyframed', value: null } });
    expect(projected.nodes.find((node) => node.nodeId === firstId)?.keyframeChannels.find((channel) => channel.channel === 'position'))
      .toMatchObject({ baseValue: null, keyframes: [{ value: [110.125, 120.25, 0],
        inInterpolation: 'BEZIER', outInterpolation: 'LINEAR', inEase: [{ speed: 3, influence: 40 }], nativeFrameIndex: 15 }] });
    expect(projected.nodes.find((node) => node.nodeId === secondId)).toMatchObject({ parentNodeId: null, position: [140.125, 100.25] });
  });

  test('ungroup requires generated group provenance and permits supported transform edits', () => {
    const groupId = 'draft:20000000-0000-4000-8000-000000000020' as const;
    const commands = [
      { type: 'layer.group' as const, nodeId: groupId, compId: 11, name: 'Group', memberNodeIds: ['aep:11:9', 'draft:20000000-0000-4000-8000-000000000021'] },
      { type: 'layer.edit' as const, nodeId: groupId, edit: { position: [12, 9] as [number, number] } },
    ];
    expect(canUngroupTemplateNode(commands, groupId)).toBe(true);
    expect(canUngroupTemplateNode(commands.slice(1), groupId)).toBe(false);
    expect(canUngroupTemplateNode([
      ...commands,
      { type: 'layer.group.transform' as const, nodeId: groupId, transform: { rotation: 90, scale: [120, 100] as [number, number] } },
    ], groupId)).toBe(true);
  });

  test('projects group transform and exact 2D static world compensation on ungroup', () => {
    const document = structuredClone(source);
    const second = structuredClone(document.nodes[0]!);
    second.nodeId = 'aep:11:10';
    second.sourceRef = { compId: 11, layerId: 10 };
    second.sourceNodeId = null;
    second.position = [30, 40];
    second.rotation = 90;
    second.scale = [80, 60];
    document.nodes.push(second);
    document.compositions[0]!.nodeIds.push(second.nodeId);
    document.nodes[0]!.keyframeChannels = [{
      channelId: 'aep:11:9:ADBE Scale', channel: 'scale', matchName: 'ADBE Scale', frameRate: 30,
      dimensions: 3, separated: false, baseValue: [27, 54, 100], reason: null, keyframes: [],
    }];
    const groupId = 'draft:20000000-0000-4000-8000-000000000020' as const;
    const projected = projectTemplateAuthoringCommands(document, [
      { type: 'layer.group', nodeId: groupId, compId: 11, name: 'Group', memberNodeIds: ['aep:11:9', 'aep:11:10'] },
      { type: 'layer.group.transform', nodeId: groupId, transform: { position: [5, 7], scale: [150, 50], rotation: 90 } },
      { type: 'layer.ungroup', nodeId: groupId },
    ]);
    const first = projected.nodes.find((node) => node.nodeId === 'aep:11:9')!;
    const secondAfter = projected.nodes.find((node) => node.nodeId === 'aep:11:10')!;
    expect(first).toMatchObject({ parentNodeId: null, scale: [40.5, 27], rotation: 90 });
    expect(first.position?.[0]).toBeCloseTo(-5, 9);
    expect(first.position?.[1]).toBeCloseTo(22, 9);
    expect(first.keyframeChannels[0]?.baseValue).toEqual([40.5, 27, 100]);
    expect(secondAfter).toMatchObject({ parentNodeId: null, scale: [40, 90], rotation: 180 });
    expect(secondAfter.position?.[0]).toBeCloseTo(-15, 9);
    expect(secondAfter.position?.[1]).toBeCloseTo(52, 9);
    expect(projected.nodes.some((node) => node.nodeId === groupId)).toBe(false);
  });

  test('projects created, duplicated, edited, deleted and ordered nodes using stable identities', () => {
    const created = 'draft:20000000-0000-4000-8000-000000000001' as const;
    const duplicate = 'draft:20000000-0000-4000-8000-000000000002' as const;
    const fontRef = { fontId: '10000000-0000-4000-8000-000000000004', postScriptName: 'Studio-Regular', sha256: 'b'.repeat(64) };
    const document = projectTemplateAuthoringCommands(source, [
      { type: 'text.create', nodeId: created, compId: 11, name: 'New title', text: 'Hello', fontRef, fontSize: 36, fillColor: [1, 1, 1], position: [30, 40] },
      { type: 'layer.edit', nodeId: created, edit: { position: [32, 42] } },
      { type: 'layer.duplicate', nodeId: duplicate, sourceNodeId: 'aep:11:9', name: 'Copy' },
      { type: 'layer.delete', nodeId: 'aep:11:9' },
      { type: 'composition.order', compId: 11, nodeIds: [duplicate, created] },
    ]);
    expect(document.compositions[0]?.nodeIds).toEqual([duplicate, created]);
    expect(document.nodes.map((node) => node.nodeId)).toEqual(expect.arrayContaining([duplicate, created]));
    expect(document.nodes).toHaveLength(2);
    expect(document.nodes.find((node) => node.nodeId === duplicate)?.sourceNodeId).toBe('aep:11:9');
    expect(document.nodes.find((node) => node.nodeId === created)?.textContent).toBe('Hello');
    expect(document.nodes.find((node) => node.nodeId === created)?.position).toEqual([32, 42]);
    expect(document.nodes.find((node) => node.nodeId === created)?.sourceRef).toBeNull();
    expect(document.nodes.find((node) => node.nodeId === created)).toMatchObject({
      inSec: 0, outSec: 2, timingReason: null, capabilities: { timing: true, keyframes: true },
    });
    expect(document.nodes.find((node) => node.nodeId === created)?.keyframeChannels.map((channel) => channel.channelId)).toEqual([
      `authoring:${created}:ADBE Position`, `authoring:${created}:ADBE Scale`,
      `authoring:${created}:ADBE Rotate Z`, `authoring:${created}:ADBE Opacity`,
    ]);
    expect(source.nodes).toHaveLength(1);
  });

  test('projects grouping for fresh static text and artwork while keeping the source node lock', () => {
    const fontRef = { fontId: '10000000-0000-4000-8000-000000000004', postScriptName: 'Studio-Regular', sha256: 'b'.repeat(64) };
    const document = { ...structuredClone(source), fontChoices: [{ ...fontRef, scope: 'brand' as const }] };
    const textId = 'draft:20000000-0000-4000-8000-000000000031' as const;
    const artworkId = 'draft:20000000-0000-4000-8000-000000000032' as const;
    const groupId = 'draft:20000000-0000-4000-8000-000000000033' as const;
    const projected = projectTemplateAuthoringCommands(document, [
      { type: 'text.create', nodeId: textId, compId: 11, name: 'Fresh caption', text: 'Hello', fontRef, fontSize: 24, fillColor: [0, 0, 0], position: [20, 30] },
      { type: 'artwork.create', nodeId: artworkId, compId: 11, name: 'Fresh image', position: [40, 50], size: [60, 40], assetRef: {
        assetId: '10000000-0000-4000-8000-000000000006', versionId: '10000000-0000-4000-8000-000000000007', sha256: 'c'.repeat(64),
      } },
      { type: 'layer.group', nodeId: groupId, compId: 11, name: 'Fresh group', memberNodeIds: [textId, artworkId] },
    ]);
    expect(projected.nodes.find((node) => node.nodeId === groupId)?.kind).toBe('group');
    for (const nodeId of [textId, artworkId]) {
      expect(projected.nodes.find((node) => node.nodeId === nodeId)).toMatchObject({
        sourceRef: null, sourceNodeId: null, parentNodeId: groupId, capabilities: { grouping: false },
      });
    }
    expect(projected.nodes.find((node) => node.nodeId === 'aep:11:9')?.capabilities.grouping).toBe(false);
  });

  test('projects receipt-backed nested generated groups with native motion channels', () => {
    const artboardId = '20000000-0000-4000-8000-000000000041';
    const a = 'draft:20000000-0000-4000-8000-000000000042';
    const b = 'draft:20000000-0000-4000-8000-000000000043';
    const c = 'draft:20000000-0000-4000-8000-000000000044';
    const inner = 'draft:20000000-0000-4000-8000-000000000045';
    const outer = 'draft:20000000-0000-4000-8000-000000000046';
    const projected = projectTemplateAuthoringCommands(structuredClone(source), [
      { type: 'artboard.create', artboardId, name: 'Nested', width: 640, height: 360, frameRate: 30, durationSec: 4 },
      ...[a, b, c].map((nodeId, index) => ({
        type: 'shape.create' as const, nodeId, artboardId, shape: 'rectangle' as const, name: `Shape ${index}`,
        position: [100 + index * 40, 100] as [number, number], size: [40, 30] as [number, number],
        fill: { type: 'none' as const }, stroke: { type: 'none' as const },
      })),
      { type: 'layer.group', nodeId: inner, artboardId, name: 'Inner', memberNodeIds: [a, b] },
      { type: 'layer.group', nodeId: outer, artboardId, name: 'Outer', memberNodeIds: [inner, c] },
    ]);
    expect(projected.nodes.find((node) => node.nodeId === inner)).toMatchObject({
      parentNodeId: outer, capabilities: { grouping: false }, groupedCapabilities: { grouping: true },
    });
    expect(projected.nodes.find((node) => node.nodeId === outer)).toMatchObject({
      capabilities: { grouping: true, timing: false, keyframes: true }, groupingReason: null,
      timingReason: 'authoring_generated_group_timing_unsupported',
      keyframeChannels: [{ channel: 'position' }, { channel: 'scale' }, { channel: 'rotation' }],
    });
  });

  test('locks static group transform and ungroup after a generated group gains transform keys', () => {
    const artboardId = '20000000-0000-4000-8000-000000000061';
    const a = 'draft:20000000-0000-4000-8000-000000000062';
    const b = 'draft:20000000-0000-4000-8000-000000000063';
    const group = 'draft:20000000-0000-4000-8000-000000000064';
    const projected = projectTemplateAuthoringCommands(structuredClone(source), [
      { type: 'artboard.create', artboardId, name: 'Animated group', width: 640, height: 360, frameRate: 30, durationSec: 4 },
      ...[a, b].map((nodeId, index) => ({ type: 'shape.create' as const, nodeId, artboardId, shape: 'rectangle' as const,
        name: `Shape ${index}`, position: [100 + index * 40, 100] as [number, number], size: [40, 30] as [number, number],
        fill: { type: 'none' as const }, stroke: { type: 'none' as const } })),
      { type: 'layer.group', nodeId: group, artboardId, name: 'Group', memberNodeIds: [a, b] },
      { type: 'layer.keyframes.replace', nodeId: group, channel: 'position', channelId: `authoring:${group}:ADBE Position`,
        keyframes: [{ keyframeId: 'draft:20000000-0000-4000-8000-000000000065', timeSec: 0.5, value: [20, 30, 0],
          inInterpolation: 'LINEAR', outInterpolation: 'LINEAR' }] },
      { type: 'layer.group.transform', nodeId: group, transform: { position: [40, 50] } },
      { type: 'layer.ungroup', nodeId: group },
    ]);
    expect(projected.nodes.find((node) => node.nodeId === group)).toMatchObject({
      capabilities: { transform: false, grouping: false },
      groupingReason: 'authoring_animated_group_regroup_locked',
      deleteReason: 'authoring_animated_group_ungroup_bake_unsupported',
    });
    expect(projected.nodes.find((node) => node.nodeId === group)?.position).toEqual([0, 0]);
    expect(projected.nodes.find((node) => node.nodeId === a)?.parentNodeId).toBe(group);
  });

  test('artboard resize changes only the positively eligible composition dimensions', () => {
    const eligible = structuredClone(source);
    eligible.compositions[0]!.artboardReason = null;
    const resized = projectTemplateAuthoringCommands(eligible, [
      { type: 'artboard.resize', compId: 11, width: 640, height: 360 },
    ]);
    expect(resized.compositions[0]).toMatchObject({ width: 640, height: 360 });
    expect(resized.nodes).toEqual(source.nodes);
    expect(resized.compositions[0]?.nodeIds).toEqual(source.compositions[0]?.nodeIds);

    const pending = structuredClone(eligible);
    pending.compositions[0]!.artboardReason = 'Writer geometry pending.';
    const locked = projectTemplateAuthoringCommands(pending, [
      { type: 'artboard.resize', compId: 11, width: 640, height: 360 },
    ]);
    expect(locked.compositions[0]).toMatchObject({ width: 400, height: 300 });
  });

  test('projects stable draft artboards and routes subsequent layer commands through their UUID selector', () => {
    const artboardId = '20000000-0000-4000-8000-000000000010';
    const nodeId = 'draft:20000000-0000-4000-8000-000000000011' as const;
    const projected = projectTemplateAuthoringCommands(source, [
      { type: 'artboard.duplicate', artboardId, sourceCompId: 11, name: 'Main copy' },
      {
        type: 'shape.create', nodeId, artboardId, shape: 'rectangle', name: 'Overlay',
        position: [40, 60], size: [120, 80], fill: { type: 'none' }, stroke: { type: 'none' },
      },
      { type: 'layer.edit', nodeId, edit: { position: [55, 75] } },
      { type: 'artboard.resize', artboardId, width: 640, height: 480 },
    ]);
    const duplicate = projected.compositions.find((composition) => composition.artboardId === artboardId);
    expect(duplicate).toMatchObject({ compId: null, sourceCompId: 11, name: 'Main copy', width: 640, height: 480 });
    expect(duplicate?.nodeIds).toContain(nodeId);
    const copiedNode = projected.nodes.find((node) => node.sourceNodeId === 'aep:11:9');
    expect(copiedNode).toMatchObject({ sourceRef: null, sourceNodeId: 'aep:11:9' });
    expect(projected.nodes.find((node) => node.nodeId === nodeId)).toMatchObject({ sourceRef: null, position: [55, 75] });
    expect(projected.compositions.find((composition) => composition.compId === 11)).toEqual(source.compositions[0]);
  });

  test('duplicate projection preserves source composition order and child channel locks', () => {
    const lockedSource = structuredClone(source);
    lockedSource.compositions[0]!.orderReason = 'native_index_expression_unsupported';
    lockedSource.compositions[0]!.creationReason = 'native_creation_stack_unsupported';
    lockedSource.compositions[0]!.shapeCreationReason = 'native_shape_stack_unsupported';
    lockedSource.compositions[0]!.artboardReason = 'native_artboard_metadata_unsupported';
    lockedSource.nodes[0]!.capabilities = {
      ...lockedSource.nodes[0]!.capabilities,
      order: false,
      grouping: false,
      timing: false,
      keyframes: false,
    };
    lockedSource.nodes[0]!.timingReason = 'native_control_layer_timing_locked';
    lockedSource.nodes[0]!.keyframeChannels = [{
      channelId: 'aep:11:9:opacity', channel: 'opacity', matchName: 'ADBE Opacity',
      frameRate: 30, dimensions: 1, separated: false, baseValue: 100,
      reason: 'native_control_channel_unsupported', keyframes: [],
    }];
    const artboardId = '20000000-0000-4000-8000-000000000012';
    const projected = projectTemplateAuthoringCommands(lockedSource, [
      { type: 'artboard.duplicate', artboardId, sourceCompId: 11, name: 'Locked copy' },
    ]);
    const duplicate = projected.compositions.find((composition) => composition.artboardId === artboardId);
    const copiedNode = projected.nodes.find((node) => node.sourceNodeId === 'aep:11:9');
    expect(duplicate).toMatchObject({
      orderReason: 'native_index_expression_unsupported',
      creationReason: 'native_creation_stack_unsupported',
      shapeCreationReason: 'native_shape_stack_unsupported',
      artboardReason: 'native_artboard_metadata_unsupported',
    });
    expect(copiedNode?.capabilities).toMatchObject({ order: false, grouping: false, timing: false, keyframes: false });
    expect(copiedNode?.timingReason).toBe('native_control_layer_timing_locked');
    expect(copiedNode?.keyframeChannels[0]).toMatchObject({ reason: 'native_control_channel_unsupported' });
  });

  test('hydrated backend-shaped create keeps null native source composition and authoritative containing comp membership', () => {
    const created = 'draft:20000000-0000-4000-8000-000000000003' as const;
    const duplicate = 'draft:20000000-0000-4000-8000-000000000004' as const;
    const fontRef = { fontId: '10000000-0000-4000-8000-000000000004', postScriptName: 'Studio-Regular', sha256: 'b'.repeat(64) };
    const document = projectTemplateAuthoringCommands(source, [
      { type: 'text.create', nodeId: created, compId: 11, name: 'New title', text: 'Original', fontRef, fontSize: 36, fillColor: [1, 1, 1], position: [30, 40] },
      { type: 'layer.duplicate', nodeId: duplicate, sourceNodeId: created, name: 'Snapshot' },
      { type: 'layer.edit', nodeId: created, edit: { position: [80, 90], text: 'Later edit' } },
    ]);
    expect(document.compositions[0]?.nodeIds).toEqual([duplicate, created, 'aep:11:9']);
    expect(document.nodes.find((node) => node.nodeId === created)?.sourceCompositionId).toBeNull();
    expect(document.nodes.find((node) => node.nodeId === duplicate)?.sourceCompositionId).toBeNull();
    expect(document.nodes.find((node) => node.nodeId === duplicate)?.textContent).toBe('Original');
    expect(document.nodes.find((node) => node.nodeId === duplicate)?.position).toEqual([30, 40]);
  });

  test('projects a shape.create with workspace-pinned expected geometry and shape-specific capabilities', () => {
    const nodeId = 'draft:20000000-0000-4000-8000-000000000005' as const;
    const document = projectTemplateAuthoringCommands(source, [
      {
        type: 'shape.create', nodeId, compId: 11, shape: 'ellipse', name: 'Ellipse',
        position: [200, 150], size: [240, 140],
        fill: { type: 'solid', color: [0.12, 0.55, 0.7], opacity: 0.24 },
        stroke: { type: 'solid', color: [0.12, 0.55, 0.7], opacity: 1, width: 2 },
      },
    ]);
    const shape = document.nodes.find((node) => node.nodeId === nodeId);
    expect(document.compositions[0]?.nodeIds).toEqual([nodeId, 'aep:11:9']);
    expect(shape).toMatchObject({
      kind: 'shape', shape: 'ellipse', size: [240, 140], pathPosition: [0, 0],
      position: [200, 150], inSec: 0, outSec: 2, sourceRef: null,
      timingReason: null,
      capabilities: { transform: true, duplicate: true, delete: true, font: false, text: false, timing: true, keyframes: true, grouping: true, masks: true },
      maskReason: null, maskGeometryReason: null,
    });
    expect(shape?.maskSourceGeometry).toMatchObject({
      status: 'authored', draftNodeId: nodeId.slice('draft:'.length), workspaceChecksum: source.sourceChecksum,
      target: { compId: 11, artboardId: null }, bounds: { x: -120, y: -70, width: 240, height: 140 },
    });
    expect(shape?.keyframeChannels.map((channel) => channel.channelId)).toEqual([
      `authoring:${nodeId}:ADBE Position`, `authoring:${nodeId}:ADBE Scale`,
      `authoring:${nodeId}:ADBE Rotate Z`, `authoring:${nodeId}:ADBE Opacity`,
    ]);
  });

  test('duplicates a created shape with geometry and stable channels rebound to the duplicate identity', () => {
    const created = 'draft:20000000-0000-4000-8000-000000000025' as const;
    const duplicate = 'draft:20000000-0000-4000-8000-000000000026' as const;
    const document = projectTemplateAuthoringCommands(source, [
      { type: 'shape.create', nodeId: created, compId: 11, shape: 'rectangle', name: 'Original',
        position: [200, 150], size: [240, 140], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'layer.duplicate', nodeId: duplicate, sourceNodeId: created, name: 'Copy' },
    ]);
    const node = templateAuthoringNodeSchema.parse(document.nodes.find((entry) => entry.nodeId === duplicate));
    expect(node).toMatchObject({ sourceRef: null, kind: 'shape', capabilities: { masks: true } });
    expect(node.maskSourceGeometry).toMatchObject({
      status: 'authored', draftNodeId: duplicate.slice('draft:'.length),
      workspaceChecksum: source.sourceChecksum, target: { compId: 11, artboardId: null },
      bounds: { width: 240, height: 140 }, position: [200, 150, 0],
    });
    expect(node.keyframeChannels.map((channel) => channel.channelId)).toEqual([
      `authoring:${duplicate}:ADBE Position`, `authoring:${duplicate}:ADBE Scale`,
      `authoring:${duplicate}:ADBE Rotate Z`, `authoring:${duplicate}:ADBE Opacity`,
    ]);
  });

  test('only enables grouping for a static duplicate of a top-level same-draft generated node', () => {
    const artboardId = '20000000-0000-4000-8000-000000000094';
    const original = 'draft:20000000-0000-4000-8000-000000000095' as const;
    const duplicate = 'draft:20000000-0000-4000-8000-000000000096' as const;
    const companion = 'draft:20000000-0000-4000-8000-000000000097' as const;
    const grouped = 'draft:20000000-0000-4000-8000-000000000098' as const;
    const project = projectTemplateAuthoringCommands(source, [
      { type: 'artboard.duplicate', artboardId, sourceCompId: 11, name: 'Generated board' },
      { type: 'shape.create', nodeId: original, artboardId, shape: 'rectangle', name: 'Generated', position: [10, 20], size: [30, 40], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'layer.duplicate', nodeId: duplicate, sourceNodeId: original, name: 'Generated copy' },
      { type: 'shape.create', nodeId: companion, artboardId, shape: 'ellipse', name: 'Companion', position: [60, 70], size: [20, 20], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'layer.group', nodeId: grouped, artboardId, name: 'Static pair', memberNodeIds: [duplicate, companion] },
    ]);
    expect(project.nodes.find((node) => node.nodeId === grouped)).toMatchObject({ kind: 'group', capabilities: { grouping: true } });
    expect(project.nodes.find((node) => node.nodeId === duplicate)).toMatchObject({ parentNodeId: grouped, sourceNodeId: original });

    const importedDuplicate = 'draft:20000000-0000-4000-8000-000000000099' as const;
    const importedGroup = 'draft:20000000-0000-4000-8000-000000000100' as const;
    const importedAttempt = projectTemplateAuthoringCommands(source, [
      { type: 'artboard.duplicate', artboardId, sourceCompId: 11, name: 'Imported board' },
      { type: 'layer.duplicate', nodeId: importedDuplicate, sourceNodeId: 'aep:11:9', name: 'Imported copy' },
      { type: 'shape.create', nodeId: companion, artboardId, shape: 'ellipse', name: 'Companion', position: [60, 70], size: [20, 20], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'layer.group', nodeId: importedGroup, artboardId, name: 'Unsupported pair', memberNodeIds: [importedDuplicate, companion] },
    ]);
    expect(importedAttempt.nodes.find((node) => node.nodeId === importedGroup)?.capabilities.grouping).toBe(false);

    const animatedDuplicate = 'draft:20000000-0000-4000-8000-000000000101' as const;
    const animatedGroup = 'draft:20000000-0000-4000-8000-000000000102' as const;
    const animatedAttempt = projectTemplateAuthoringCommands(source, [
      { type: 'artboard.duplicate', artboardId, sourceCompId: 11, name: 'Animated board' },
      { type: 'shape.create', nodeId: original, artboardId, shape: 'rectangle', name: 'Animated source', position: [10, 20], size: [30, 40], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'layer.keyframes.replace', nodeId: original, channelId: `authoring:${original}:ADBE Position`, channel: 'position', keyframes: [
        { keyframeId: 'draft:20000000-0000-4000-8000-000000000103', timeSec: 0.5, value: [20, 30, 0], inInterpolation: 'LINEAR', outInterpolation: 'LINEAR' },
      ] },
      { type: 'layer.duplicate', nodeId: animatedDuplicate, sourceNodeId: original, name: 'Animated copy' },
      { type: 'shape.create', nodeId: companion, artboardId, shape: 'ellipse', name: 'Companion', position: [60, 70], size: [20, 20], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'layer.group', nodeId: animatedGroup, artboardId, name: 'Unsupported animated pair', memberNodeIds: [animatedDuplicate, companion] },
    ]);
    expect(animatedAttempt.nodes.find((node) => node.nodeId === animatedGroup)?.capabilities.grouping).toBe(false);
  });

  test('duplicate of an imported shape keeps masks and opaque source but waits for geometry readback', () => {
    const imported = structuredClone(source);
    const sourceNode = imported.nodes[0]!;
    sourceNode.kind = 'shape';
    sourceNode.shape = 'rectangle';
    sourceNode.size = [40, 20];
    sourceNode.fill = { type: 'none' };
    sourceNode.stroke = { type: 'none' };
    sourceNode.capabilities.masks = true;
    sourceNode.maskReason = null;
    sourceNode.maskGeometryReason = null;
    sourceNode.maskSourceGeometry = {
      status: 'verified', coordinateSpace: 'layer-source-pixels', sourceKind: 'shape-path',
      sourceRef: { kind: 'native-path', id: 4, name: 'Path' },
      bounds: { x: -20, y: -10, width: 40, height: 20 }, anchor: [0, 0, 0],
      position: [10, 20, 0], scale: [100, 100, 100], rotation: 0,
      localToComp: { matrix: [1, 0, 0, 1, 10, 20], corners: [[-20, -10], [20, -10], [20, 10], [-20, 10]], verifiedWithPyAep: true },
      measurement: 'test', packageSha256: source.sourceChecksum, sourceAepSha256: 'b'.repeat(64), compId: 11, layerUid: 9,
    };
    sourceNode.masks = [{ draftMaskId: '20000000-0000-4000-8000-000000000027', name: 'Existing', shape: 'rectangle',
      center: [0, 0], size: [10, 10], mode: 'add', opacity: 100, feather: [0, 0] }];
    const validSource = imported;
    const duplicate = 'draft:20000000-0000-4000-8000-000000000028' as const;
    const projected = projectTemplateAuthoringCommands(validSource, [
      { type: 'layer.duplicate', nodeId: duplicate, sourceNodeId: sourceNode.nodeId, name: 'Copy' },
    ]);
    const node = templateAuthoringNodeSchema.parse(projected.nodes.find((entry) => entry.nodeId === duplicate));
    expect(node).toMatchObject({
      sourceRef: null, maskSourceGeometry: null, capabilities: { masks: false },
      maskReason: 'authoring_mask_geometry_duplicate_reinventory_pending',
      maskGeometryReason: 'authoring_mask_geometry_duplicate_reinventory_pending',
      masks: sourceNode.masks,
    });
    expect(node.opaqueSourceRef).toMatchObject({ checksum: validSource.opaqueSourceRef.checksum });
  });

  test('locks fresh shape grouping while authored keyframes are present', () => {
    const nodeId = 'draft:20000000-0000-4000-8000-000000000015' as const;
    const keyframeId = 'draft:20000000-0000-4000-8000-000000000016' as const;
    const document = projectTemplateAuthoringCommands(source, [
      { type: 'shape.create', nodeId, compId: 11, shape: 'rectangle', name: 'Animated shape',
        position: [200, 150], size: [240, 140], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'layer.keyframes.replace', nodeId, channelId: `authoring:${nodeId}:ADBE Position`, channel: 'position',
        keyframes: [{ keyframeId, timeSec: 1, value: [210, 160, 0], inInterpolation: 'LINEAR', outInterpolation: 'LINEAR' }] },
    ]);
    expect(document.nodes.find((node) => node.nodeId === nodeId)).toMatchObject({
      capabilities: { grouping: false, masks: false }, groupingReason: 'authoring_group_member_keyframed',
      maskGeometryReason: 'authoring_mask_geometry_animated_shape_unsupported',
    });
  });

  test('projects same-draft masks for created shapes and refreshes static pose geometry', () => {
    const nodeId = 'draft:20000000-0000-4000-8000-000000000035' as const;
    const maskId = '20000000-0000-4000-8000-000000000036';
    const document = projectTemplateAuthoringCommands(source, [
      { type: 'shape.create', nodeId, compId: 11, shape: 'rectangle', name: 'Card',
        position: [200, 150], size: [240, 140], fill: { type: 'none' }, stroke: { type: 'none' } },
      { type: 'layer.edit', nodeId, edit: { position: [220, 170], scale: [125, 90], rotation: 20 } },
      { type: 'mask.create', nodeId, draftMaskId: maskId, name: 'Card mask', shape: 'rectangle',
        center: [0, 0], size: [100, 80], mode: 'add', opacity: 100, feather: [0, 0] },
    ]);
    const shape = document.nodes.find((node) => node.nodeId === nodeId)!;
    expect(shape.capabilities.masks).toBe(true);
    expect(shape.masks[0]?.draftMaskId).toBe(maskId);
    expect(shape.maskSourceGeometry).toMatchObject({ status: 'authored', position: [220, 170, 0],
      scale: [125, 90, 100], rotation: 20 });
  });

  test('projects artwork against the immutable Library version and composition membership', () => {
    const nodeId = 'draft:20000000-0000-4000-8000-000000000006' as const;
    const assetRef = {
      assetId: '10000000-0000-4000-8000-000000000006',
      versionId: '10000000-0000-4000-8000-000000000007',
      sha256: 'c'.repeat(64),
    };
    const document = projectTemplateAuthoringCommands(source, [{
      type: 'artwork.create', nodeId, compId: 11, name: 'Pinned logo',
      position: [200, 150], size: [240, 135], assetRef,
    }]);
    expect(document.compositions[0]?.nodeIds).toEqual([nodeId, 'aep:11:9']);
    expect(document.nodes.find((node) => node.nodeId === nodeId)).toMatchObject({
      kind: 'artwork', artworkAssetRef: assetRef, sourceRef: null, sourceCompositionId: null,
      position: [200, 150], size: [240, 135], inSec: 0, outSec: 2, timingReason: null,
      capabilities: { timing: true, keyframes: true },
    });
    expect(document.nodes.find((node) => node.nodeId === nodeId)?.keyframeChannels.map((channel) => channel.channelId)).toEqual([
      `authoring:${nodeId}:ADBE Position`, `authoring:${nodeId}:ADBE Scale`,
      `authoring:${nodeId}:ADBE Rotate Z`, `authoring:${nodeId}:ADBE Opacity`,
    ]);
  });

  test('projects mask.create only for positively verified, pinned source geometry', () => {
    const eligible = structuredClone(source);
    const sourceNode = eligible.nodes[0]!;
    sourceNode.capabilities.masks = true;
    sourceNode.maskReason = null;
    sourceNode.maskGeometryReason = null;
    sourceNode.maskSourceGeometry = {
      status: 'verified', coordinateSpace: 'layer-source-pixels', sourceKind: 'shape-path',
      sourceRef: { kind: 'native-path', id: 4, name: 'Path' },
      bounds: { x: -20, y: -10, width: 40, height: 20 }, anchor: [0, 0, 0],
      position: [10, 20, 0], scale: [100, 100, 100], rotation: 0,
      localToComp: { matrix: [1, 0, 0, 1, 10, 20], corners: [[-20, -10], [20, -10], [20, 10], [-20, 10]], verifiedWithPyAep: true },
      measurement: 'test', packageSha256: source.sourceChecksum, sourceAepSha256: 'b'.repeat(64), compId: 11, layerUid: 9,
    };
    const maskCommand = {
      type: 'mask.create' as const, draftMaskId: '20000000-0000-4000-8000-000000000009',
      nodeId: 'aep:11:9' as const, name: 'Inset', shape: 'ellipse' as const,
      center: [0, 0] as [number, number], size: [16, 8] as [number, number], mode: 'add' as const,
      opacity: 80, feather: [2, 3] as [number, number],
    };
    expect(projectTemplateAuthoringCommands(eligible, [maskCommand]).nodes[0]?.masks).toEqual([{
      draftMaskId: maskCommand.draftMaskId, name: 'Inset', shape: 'ellipse', center: [0, 0],
      size: [16, 8], mode: 'add', opacity: 80, feather: [2, 3],
    }]);
    const locked = structuredClone(eligible);
    locked.nodes[0]!.capabilities.masks = false;
    expect(projectTemplateAuthoringCommands(locked, [maskCommand]).nodes[0]?.masks ?? []).toEqual([]);
    const wrongPin = structuredClone(eligible);
    wrongPin.nodes[0]!.maskSourceGeometry!.status === 'verified' && (wrongPin.nodes[0]!.maskSourceGeometry!.packageSha256 = 'c'.repeat(64));
    expect(projectTemplateAuthoringCommands(wrongPin, [maskCommand]).nodes[0]?.masks ?? []).toEqual([]);
  });

  test('updates and deletes only a created mask on its original node and snapshots its value on duplicate', () => {
    const eligible = structuredClone(source);
    const sourceNode = eligible.nodes[0]!;
    sourceNode.capabilities.masks = true;
    sourceNode.maskReason = null;
    sourceNode.maskGeometryReason = null;
    sourceNode.maskSourceGeometry = {
      status: 'verified', coordinateSpace: 'layer-source-pixels', sourceKind: 'shape-path',
      sourceRef: { kind: 'native-path', id: 4, name: 'Path' },
      bounds: { x: -20, y: -10, width: 40, height: 20 }, anchor: [0, 0, 0],
      position: [10, 20, 0], scale: [100, 100, 100], rotation: 0,
      localToComp: { matrix: [1, 0, 0, 1, 10, 20], corners: [[-20, -10], [20, -10], [20, 10], [-20, 10]], verifiedWithPyAep: true },
      measurement: 'test', packageSha256: source.sourceChecksum, sourceAepSha256: 'b'.repeat(64), compId: 11, layerUid: 9,
    };
    const maskId = '20000000-0000-4000-8000-000000000010';
    const duplicateId = 'draft:20000000-0000-4000-8000-000000000011' as const;
    const commands = [
      { type: 'mask.create' as const, draftMaskId: maskId, nodeId: 'aep:11:9' as const,
        name: 'Inset', shape: 'rectangle' as const, center: [-8, 4] as [number, number], size: [18, 10] as [number, number],
        mode: 'subtract' as const, opacity: 80, feather: [1, 2] as [number, number] },
      { type: 'mask.update' as const, nodeId: 'aep:11:9' as const, draftMaskId: maskId, patch: { name: 'Snapshot name', center: [-7, 5] as [number, number] } },
      { type: 'layer.duplicate' as const, nodeId: duplicateId, sourceNodeId: 'aep:11:9' as const, name: 'Copy' },
      { type: 'mask.update' as const, nodeId: 'aep:11:9' as const, draftMaskId: maskId, patch: { name: 'Later name', center: [-6, 4] as [number, number] } },
      { type: 'mask.update' as const, nodeId: duplicateId, draftMaskId: maskId, patch: { name: 'Invalid duplicate edit' } },
      { type: 'mask.delete' as const, nodeId: duplicateId, draftMaskId: maskId },
    ];
    const projected = projectTemplateAuthoringCommands(eligible, commands);
    expect(projected.nodes.find((node) => node.nodeId === 'aep:11:9')?.masks[0]).toMatchObject({
      draftMaskId: maskId, name: 'Later name', center: [-6, 4],
    });
    expect(projected.nodes.find((node) => node.nodeId === duplicateId)?.masks[0]).toMatchObject({
      draftMaskId: maskId, name: 'Snapshot name', center: [-7, 5],
    });

    const deleted = projectTemplateAuthoringCommands(eligible, [
      ...commands.slice(0, 4),
      { type: 'mask.delete' as const, nodeId: 'aep:11:9' as const, draftMaskId: maskId },
      { type: 'mask.update' as const, nodeId: 'aep:11:9' as const, draftMaskId: maskId, patch: { name: 'After delete' } },
    ]);
    expect(deleted.nodes.find((node) => node.nodeId === 'aep:11:9')?.masks).toEqual([]);
    expect(deleted.nodes.find((node) => node.nodeId === duplicateId)?.masks[0]).toMatchObject({ name: 'Snapshot name' });
  });
});
