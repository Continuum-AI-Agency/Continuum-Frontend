import type {
  TemplateAuthoringCommand,
  TemplateAuthoringDocument,
  TemplateAuthoringNode,
} from '@continuum/contracts';
import { authoredShapeMaskGeometry, createdAuthoringMotionChannels, templateAuthoringArtboardDraftNodeId } from '@continuum/contracts';
import { maskDraftFitsSource } from './templateAuthoringMasks';

export function templateArtworkPreviewKey(ref: { assetId: string; versionId: string; sha256: string }) {
  return `${ref.assetId}:${ref.versionId}:${ref.sha256.toLowerCase()}`;
}

function sourceGroupMembers(
  document: TemplateAuthoringDocument,
  nodeId: string,
  currentNodes: readonly TemplateAuthoringNode[] = document.nodes,
  seen = new Set<string>(),
): { entry: NonNullable<TemplateAuthoringDocument['sourceAuthoringContext']>['identityMap'][number]; members: TemplateAuthoringNode[] } | null {
  const context = document.sourceAuthoringContext;
  if (!context || context.versionId !== document.scope.baseVersionId ||
      context.versionId !== document.sourceHeadVersionId ||
      context.versionId !== document.opaqueSourceRef.versionId ||
      context.packageChecksum.toLowerCase() !== document.sourceChecksum.toLowerCase() ||
      context.packageChecksum.toLowerCase() !== document.opaqueSourceRef.checksum.toLowerCase()) return null;
  const entry = context.identityMap.find((candidate) => candidate.nodeId === nodeId && candidate.members);
  const group = currentNodes.find((node) => node.nodeId === nodeId);
  if (!entry?.members || !group || group.kind !== 'group' || !group.sourceRef ||
      group.sourceRef.compId !== entry.compId || group.sourceRef.layerId !== entry.persistedUid || seen.has(nodeId)) return null;
  const members = entry.members.map((identity) => currentNodes.find((node) => node.nodeId === identity.nodeId));
  if (members.some((node) => !node)) return null;
  const resolved = members as TemplateAuthoringNode[];
  if (resolved.some((node, index) => {
    const identity = entry.members![index]!;
    return node.parentNodeId !== nodeId || node.sourceRef?.compId !== entry.compId ||
      node.sourceRef.layerId !== identity.persistedUid || identity.parentUid !== entry.persistedUid;
  })) return null;
  const directChildren = currentNodes.filter((node) => node.parentNodeId === nodeId);
  if (directChildren.length !== resolved.length ||
      directChildren.some((node) => !entry.members!.some((identity) => identity.nodeId === node.nodeId))) return null;
  const nextSeen = new Set(seen).add(nodeId);
  if (group.parentNodeId !== null) {
    const parentEntry = context.identityMap.find((candidate) => candidate.nodeId === group.parentNodeId && candidate.members);
    const parent = currentNodes.find((node) => node.nodeId === group.parentNodeId);
    const parentChildren = currentNodes.filter((node) => node.parentNodeId === group.parentNodeId);
    if (!parentEntry?.members || parent?.kind !== 'group' || !parent.sourceRef ||
        parent.sourceRef.compId !== parentEntry.compId || parent.sourceRef.layerId !== parentEntry.persistedUid ||
        parentChildren.length !== parentEntry.members.length ||
        parentChildren.some((child) => !parentEntry.members!.some((identity) => identity.nodeId === child.nodeId &&
          identity.persistedUid === child.sourceRef?.layerId && identity.parentUid === parentEntry.persistedUid)) ||
        !parentEntry.members.some((identity) => identity.nodeId === nodeId && identity.persistedUid === entry.persistedUid && identity.parentUid === parentEntry.persistedUid)) return null;
  }
  const receiptRequired = group.parentNodeId !== null || resolved.some((node) => node.kind === 'group');
  if (receiptRequired && !context.freshArtboardReceipts.some((receipt) => receipt.compId === entry.compId)) return null;
  if (resolved.some((node) => node.kind === 'group' && !nextSeen.has(node.nodeId) &&
      !sourceGroupMembers(document, node.nodeId, currentNodes, nextSeen))) return null;
  return { entry, members: resolved };
}

/** Returns only native members whose parent and UID match trusted committed-artifact metadata. */
export function templateAuthoringSourceGroupMemberIds(
  document: TemplateAuthoringDocument,
  nodeId: string,
): string[] | null {
  const match = sourceGroupMembers(document, nodeId);
  return match ? match.entry.members!.map((member) => member.nodeId) : null;
}

export function templateAuthoringGroupHasMotion(document: TemplateAuthoringDocument, nodeId: string): boolean {
  return templateAuthoringGroupHasMotionInNodes(document.nodes, nodeId);
}

const hasVerifiedPropertyPreflight = (node: TemplateAuthoringNode, channel: TemplateAuthoringNode['keyframeChannels'][number]) =>
  channel.propertyReason === null || (channel.propertyReason === undefined && node.sourceRef === null);

function parentOnlyRigLock(node: TemplateAuthoringNode): string | null {
  return node.sourceRef
    ? `layer UID ${node.sourceRef.layerId} is parented or has child layers; transform keyframe editing this rig is locked`
    : null;
}

function channelReasonCanBeIgnoredForUngroup(node: TemplateAuthoringNode, channel: TemplateAuthoringNode['keyframeChannels'][number]) {
  const parentLock = parentOnlyRigLock(node);
  return channel.reason === null || (parentLock !== null && channel.reason === parentLock && channel.propertyReason === null);
}

function channelBaseForUngroup(channel: TemplateAuthoringNode['keyframeChannels'][number]) {
  return channel.baseValue ?? (channel.keyframes.length === 0 ? channel.propertyBaseValue ?? null : null);
}

function groupTransformLockCanBeIgnoredForUngroup(group: TemplateAuthoringNode, reason: string | undefined) {
  return reason === undefined || (group.sourceRef !== null &&
    (reason === 'native_parent_hierarchy_unsupported' || reason === 'native_parent_hierarchy_unsupported_for_transform_edits'));
}

function animatedGroupPositionBase(group: TemplateAuthoringNode): [number, number] | null {
  const channel = group.keyframeChannels.find((candidate) => candidate.channel === 'position');
  const baseValue = channel ? channelBaseForUngroup(channel) : null;
  if (!channel || channel.matchName !== 'ADBE Position' || !channelReasonCanBeIgnoredForUngroup(group, channel) ||
      !hasVerifiedPropertyPreflight(group, channel) || channel.keyframes.length > 0 ||
      channel.separated !== false || channel.dimensions !== 3 || channel.frameRate === null ||
      !Number.isFinite(channel.frameRate) || channel.frameRate <= 0 || !Array.isArray(baseValue) ||
      baseValue.length !== 3 || !baseValue.every(Number.isFinite) || baseValue[2] !== 0 ||
      !group.position || !group.position.every(Number.isFinite) ||
      (baseValue[0] !== group.position[0] && Math.round(baseValue[0]! * 100) / 100 !== group.position[0]) ||
      (baseValue[1] !== group.position[1] && Math.round(baseValue[1]! * 100) / 100 !== group.position[1])) return null;
  if (group.positionSource?.value &&
      (group.positionSource.value[0] !== baseValue[0] || group.positionSource.value[1] !== baseValue[1] ||
        group.positionSource.value[2] !== baseValue[2])) return null;
  return [baseValue[0]!, baseValue[1]!];
}

/** True only when ungroup can bake constant XY translation into verified direct-child tracks. */
export function supportsAnimatedDirectChildUngroup(
  document: TemplateAuthoringDocument,
  nodeId: string,
): boolean {
  const group = document.nodes.find((node) => node.nodeId === nodeId);
  if (!group || group.kind !== 'group' || group.parentNodeId !== null ||
      (group.sourceRef !== null && !sourceGroupMembers(document, nodeId)) ||
      group.ungroupTranslationReason !== null ||
      !group.scale || group.scale[0] !== 100 || group.scale[1] !== 100 || group.rotation !== 0 ||
      group.opacity !== 0 || ['position', 'rotation', 'scale'].some((property) => {
        const reason = group.transformLocks[property as 'position' | 'rotation' | 'scale'];
        return reason !== undefined && reason !== 'authoring_animated_group_static_transform_locked' &&
          !groupTransformLockCanBeIgnoredForUngroup(group, reason);
      }) ||
      (group.sourceRef ? group.positionSource?.value?.[2] !== 0 :
        group.positionSource?.value && group.positionSource.value[2] !== 0) ||
      !group.position || !group.position.every(Number.isFinite)) return false;
  const positionBase = animatedGroupPositionBase(group);
  if (!positionBase) return false;
  const expectedGroupChannels = {
    position: { matchName: 'ADBE Position', dimensions: 3, baseValue: [positionBase[0], positionBase[1], 0] },
    scale: { matchName: 'ADBE Scale', dimensions: 3, baseValue: [100, 100, 100] },
    rotation: { matchName: 'ADBE Rotate Z', dimensions: 1, baseValue: 0 },
  } as const;
  for (const channel of ['position', 'scale', 'rotation'] as const) {
    const value = group.keyframeChannels.find((candidate) => candidate.channel === channel);
    const expected = expectedGroupChannels[channel];
    const baseValue = value ? channelBaseForUngroup(value) : null;
    if (!value || value.matchName !== expected.matchName || !channelReasonCanBeIgnoredForUngroup(group, value) ||
        !hasVerifiedPropertyPreflight(group, value) || value.keyframes.length > 0 ||
        value.separated !== false || value.dimensions !== expected.dimensions || value.frameRate === null ||
        !Number.isFinite(value.frameRate) || value.frameRate <= 0) return false;
    const expectedBaseValue = expected.baseValue;
    if (Array.isArray(expectedBaseValue)) {
      if (!Array.isArray(baseValue) || baseValue.length !== expectedBaseValue.length ||
          baseValue.some((number, index) => number !== expectedBaseValue[index])) return false;
    } else if (baseValue !== expectedBaseValue) return false;
  }
  if (group.keyframeChannels.some((channel) => channel.keyframes.length > 0 ||
      !hasVerifiedPropertyPreflight(group, channel) ||
      (channel.channel === 'opacity' ? channel.reason !== null && channel.reason !== 'authoring_group_opacity_locked' &&
        !channelReasonCanBeIgnoredForUngroup(group, channel)
        : channel.channel !== 'position' && channel.channel !== 'scale' && channel.channel !== 'rotation' &&
          channel.reason !== null && !channelReasonCanBeIgnoredForUngroup(group, channel)))) return false;
  const opacityChannel = group.keyframeChannels.find((channel) => channel.channel === 'opacity');
  if (opacityChannel && ((channelReasonCanBeIgnoredForUngroup(group, opacityChannel) && channelBaseForUngroup(opacityChannel) !== 0) ||
      (opacityChannel.reason === 'authoring_group_opacity_locked' && channelBaseForUngroup(opacityChannel) !== 0))) return false;
  const children = document.nodes.filter((node) => node.parentNodeId === nodeId);
  if (children.length < 2 || children.some((node) => node.kind === 'group' || (node.masks?.length ?? 0) > 0) ||
      document.nodes.some((node) => children.some((child) => node.parentNodeId === child.nodeId))) return false;
  let hasAnimatedChild = false;
  const matchNames = { position: 'ADBE Position', scale: 'ADBE Scale', rotation: 'ADBE Rotate Z', opacity: 'ADBE Opacity' };
  for (const child of children) {
    if (child.ungroupTranslationReason !== null || !child.position?.every(Number.isFinite) ||
        !child.scale?.every(Number.isFinite) || !Number.isFinite(child.rotation ?? NaN)) return false;
    for (const channel of child.keyframeChannels) {
      if (!channelReasonCanBeIgnoredForUngroup(child, channel) || !hasVerifiedPropertyPreflight(child, channel)) return false;
      const expectedDimensions = channel.channel === 'position' || channel.channel === 'scale' ? 3 : 1;
      const vectorChannel = channel.channel === 'position' || channel.channel === 'scale';
      if (channel.matchName !== matchNames[channel.channel] ||
          channel.separated !== false || channel.dimensions !== expectedDimensions ||
          channel.frameRate === null || !Number.isFinite(channel.frameRate) || channel.frameRate <= 0) return false;
      if (channel.keyframes.length === 0) {
        const baseValue = channelBaseForUngroup(channel);
        if (vectorChannel
          ? !Array.isArray(baseValue) || baseValue.length !== 3 || !baseValue.every(Number.isFinite)
          : typeof baseValue !== 'number' || !Number.isFinite(baseValue)) return false;
        continue;
      }
      hasAnimatedChild = true;
      const keyframedPositionWithoutBase = channel.channel === 'position' && channel.keyframes.length > 0 &&
        channel.baseValue === null && child.positionSource?.kind === 'keyframed' && child.positionSource.value === null;
      if (vectorChannel && channel.channel === 'position' && channel.baseValue === null && !keyframedPositionWithoutBase) return false;
      const baseValue = channel.baseValue;
      if (baseValue !== null && (vectorChannel
        ? !Array.isArray(baseValue) || baseValue.length !== 3 || !baseValue.every(Number.isFinite)
        : typeof baseValue !== 'number' || !Number.isFinite(baseValue))) return false;
      if (channel.keyframes.some((frame) => vectorChannel
        ? !Array.isArray(frame.value) || frame.value.length !== 3 || !frame.value.every(Number.isFinite)
        : typeof frame.value !== 'number' || !Number.isFinite(frame.value))) return false;
    }
  }
  return hasAnimatedChild;
}

function templateAuthoringGroupHasMotionInNodes(nodes: readonly TemplateAuthoringNode[], nodeId: string): boolean {
  const descendants = new Map<string, TemplateAuthoringNode[]>();
  for (const node of nodes) {
    if (node.parentNodeId) descendants.set(node.parentNodeId, [...(descendants.get(node.parentNodeId) ?? []), node]);
  }
  const visit = (id: string, seen: Set<string>): boolean => {
    if (seen.has(id)) return true;
    const node = nodes.find((candidate) => candidate.nodeId === id);
    if (!node) return true;
    if (node.keyframeChannels.some((channel) => channel.keyframes.length > 0)) return true;
    const next = new Set(seen).add(id);
    return (descendants.get(id) ?? []).some((child) => visit(child.nodeId, next));
  };
  return visit(nodeId, new Set());
}

export function canMutateTemplateAuthoringSourceGroup(
  document: TemplateAuthoringDocument,
  nodeId: string,
  currentNodes: readonly TemplateAuthoringNode[] = document.nodes,
): boolean {
  const match = sourceGroupMembers(document, nodeId, currentNodes);
  if (!match || templateAuthoringGroupHasMotionInNodes(currentNodes, nodeId)) return false;
  const group = currentNodes.find((node) => node.nodeId === nodeId)!;
  return group.parentNodeId === null && group.capabilities.transform === true &&
    (['position', 'rotation', 'scale'] as const).every((channel) => group.transformLocks[channel] === undefined) &&
    group.position !== null && group.scale !== null && group.rotation !== null &&
    [...group.position, ...group.scale, group.rotation].every(Number.isFinite) &&
    match.members.every((member) => member.position !== null && member.scale !== null && member.rotation !== null &&
      [...member.position, ...member.scale, member.rotation].every(Number.isFinite));
}

const authoredNodeSourceRef = (source: TemplateAuthoringDocument) => {
  const workspacePackage = source.workspacePackage;
  if (!workspacePackage) return {
    versionId: source.opaqueSourceRef.versionId,
    checksum: source.opaqueSourceRef.checksum,
  };
  return workspacePackage.kind === 'hyperframes_seed'
    ? { versionId: null, checksum: workspacePackage.packageChecksum, workspacePackage }
    : { versionId: source.opaqueSourceRef.versionId, checksum: workspacePackage.packageChecksum, workspacePackage };
};

export function canUngroupTemplateNode(
  commands: readonly TemplateAuthoringCommand[],
  nodeId: string,
  source?: TemplateAuthoringDocument,
): boolean {
  const groupIndex = commands.findIndex((command) => command.type === 'layer.group' && command.nodeId === nodeId);
  if (groupIndex < 0) {
    if (!source || !sourceGroupMembers(source, nodeId)) return false;
    const memberIds = new Set(templateAuthoringSourceGroupMemberIds(source, nodeId) ?? []);
    const staticGroup = canMutateTemplateAuthoringSourceGroup(source, nodeId);
    const animatedChildGroup = supportsAnimatedDirectChildUngroup(source, nodeId);
    if (!staticGroup && !animatedChildGroup) return false;
    return commands.every((command) => {
      if ('nodeId' in command && command.nodeId === nodeId) {
        if (command.type === 'layer.group.transform') return true;
        return command.type === 'layer.edit' && Object.keys(command.edit).every((key) => key === 'position');
      }
      if (animatedChildGroup && command.type === 'layer.keyframes.replace' && memberIds.has(command.nodeId))
        return true;
      return !('nodeId' in command) || !memberIds.has(command.nodeId);
    });
  }
  const projected = source
    ? source.nodes.some((node) => node.nodeId === nodeId)
      ? source
      : projectTemplateAuthoringCommands(source, commands)
    : undefined;
  const animatedChildGroup = Boolean(projected && supportsAnimatedDirectChildUngroup(projected, nodeId));
  return commands.slice(groupIndex + 1).every((command) => {
    if (command.type === 'layer.group.transform' && command.nodeId === nodeId) return true;
    if (animatedChildGroup && command.type === 'layer.keyframes.replace' &&
        projected?.nodes.some((node) => node.nodeId === command.nodeId && node.parentNodeId === nodeId)) return true;
    if (command.type !== 'layer.edit' || command.nodeId !== nodeId) return false;
    const edit = command.edit;
    return Object.keys(edit).every((key) => key === 'position');
  });
}

const createdCapabilities: TemplateAuthoringNode['capabilities'] = {
  transform: false,
  visibility: false,
  font: false,
  text: false,
  order: false,
  exposure: false,
  creation: false,
  duplicate: false,
  delete: false,
  grouping: false,
  masks: false,
  artboardMutation: false,
  timing: false,
  keyframes: false,
};

const authoredShapeCapabilities: TemplateAuthoringNode['capabilities'] = {
  transform: true,
  visibility: true,
  font: false,
  text: false,
  order: true,
  exposure: false,
  creation: false,
  duplicate: true,
  delete: true,
  grouping: true,
  masks: false,
  artboardMutation: false,
  timing: false,
  keyframes: false,
};

function refreshFreshGrouping(node: TemplateAuthoringNode): TemplateAuthoringNode {
  if (node.sourceRef !== null || node.sourceNodeId !== null ||
      !(node.kind === 'shape' || node.kind === 'text' || node.kind === 'artwork')) return node;
  const hasAuthoredKeys = node.keyframeChannels.some((channel) => channel.reason === null && channel.keyframes.length > 0);
  const groupingReason = node.parentNodeId !== null
    ? 'authoring_group_member_already_parented'
    : node.masks.length > 0
      ? 'authoring_group_member_masked'
      : hasAuthoredKeys ? 'authoring_group_member_keyframed' : null;
  node.groupingReason = groupingReason;
  node.capabilities = { ...node.capabilities, grouping: groupingReason === null };
  return node;
}

/** Optimistic view for local commands; persisted server projections replace it after CAS. */
export function projectTemplateAuthoringCommands(
  source: TemplateAuthoringDocument,
  commands: readonly TemplateAuthoringCommand[],
): TemplateAuthoringDocument {
  const document = structuredClone(source);
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  // Rehydrate the member lock bookkeeping from the immutable committed-artifact receipt.
  // This is a projection-only cache; it never invents group commands or changes source IDs.
  for (const node of [...document.nodes]) {
    if (node.kind !== 'group') continue;
    const members = sourceGroupMembers(document, node.nodeId)?.members;
    if (!members) continue;
    for (const member of members) {
      const groupedCapabilities = member.groupedCapabilities ?? member.capabilities;
      if (member.kind === 'group') {
        nodes.set(member.nodeId, { ...member, groupedCapabilities });
        continue;
      }
      const next = {
        ...member,
        groupedCapabilities,
        transformLocks: {
          ...member.transformLocks,
          position: 'This layer is moved with its group.',
          rotation: 'This layer is moved with its group.',
          scale: 'This layer is moved with its group.',
          opacity: 'This layer is controlled by its group.',
        },
        visibilityReason: 'This layer is controlled by its group.',
        capabilities: {
          ...member.capabilities,
          transform: false,
          visibility: false,
          duplicate: false,
          delete: false,
          order: false,
          grouping: false,
        },
        duplicateReason: 'This layer is a member of a group.',
        deleteReason: 'Ungroup the parent group to remove this layer.',
        groupingReason: 'This layer is already in a group.',
      };
      nodes.set(member.nodeId, next);
    }
  }
  const compositionKey = (composition: TemplateAuthoringDocument['compositions'][number]) =>
    composition.artboardId ? `draft:${composition.artboardId}` : `aep:${composition.compId}`;
  const targetKey = (target: { compId?: number; artboardId?: string }) =>
    target.artboardId ? `draft:${target.artboardId}` : `aep:${target.compId}`;
  const findComposition = (target: { compId?: number; artboardId?: string }) =>
    document.compositions.find((composition) => compositionKey(composition) === targetKey(target));
  const createdMotion = (node: Pick<TemplateAuthoringNode, 'nodeId' | 'kind' | 'position' | 'scale' | 'rotation' | 'opacity'>,
    composition: TemplateAuthoringDocument['compositions'][number]) => {
    const keyframeChannels = createdAuthoringMotionChannels(node, composition.frameRate);
    const timingAvailable = keyframeChannels.length === 4 && typeof composition.durationSec === 'number' &&
      Number.isFinite(composition.durationSec) && composition.durationSec > 0;
    return {
      keyframeChannels,
      inSec: timingAvailable ? 0 : null,
      outSec: timingAvailable ? composition.durationSec : null,
      timingReason: timingAvailable ? null : 'authoring_created_motion_clock_unavailable',
      timing: timingAvailable,
      keyframes: keyframeChannels.some((channel) => channel.reason === null),
    };
  };
  const createdGroupMotion = (nodeId: string, composition: TemplateAuthoringDocument['compositions'][number]) => {
    const keyframeChannels = createdAuthoringMotionChannels({ nodeId, kind: 'shape', position: [0, 0],
      scale: [100, 100], rotation: 0, opacity: 100 }, composition.frameRate)
      .filter((channel) => channel.channel !== 'opacity');
    return { keyframeChannels, timingAvailable: false };
  };
  const nodeIdsByComp = new Map(document.compositions.map((composition) => [compositionKey(composition), [...composition.nodeIds]]));
  const containingComp = new Map<string, string>();
  const authoredMaskTargets = new Map<string, string>();
  const generatedDuplicateNodes = new Set<string>();
  const refreshGeneratedGroupMotionLocks = (nodeId: string) => {
    const hasMotionInTree = (groupId: string, seen = new Set<string>()): boolean => {
      if (seen.has(groupId)) return true;
      const next = new Set(seen).add(groupId);
      const group = nodes.get(groupId);
      if (!group) return true;
      if (group.keyframeChannels.some((channel) => channel.keyframes.length > 0)) return true;
      return [...nodes.values()].filter((child) => child.parentNodeId === groupId)
        .some((child) => hasMotionInTree(child.nodeId, next));
    };
    let current = nodes.get(nodeId);
    const visited = new Set<string>();
    while (current && !visited.has(current.nodeId)) {
      visited.add(current.nodeId);
      if (current.kind === 'group') {
        const animated = hasMotionInTree(current.nodeId);
        // A committed source group keeps the backend's exact channel capabilities and
        // reasons. Animation only locks static group transforms and ungroup in the UI.
        const verifiedSourceGroup = current.sourceRef !== null && current.sourceRef !== undefined &&
          sourceGroupMembers(document, current.nodeId, [...nodes.values()]) !== null;
        if (animated && !verifiedSourceGroup) nodes.set(current.nodeId, { ...current,
          transformLocks: { ...current.transformLocks, position: 'authoring_animated_group_static_transform_locked',
            scale: 'authoring_animated_group_static_transform_locked', rotation: 'authoring_animated_group_static_transform_locked' },
          capabilities: { ...current.capabilities, transform: false, grouping: false },
          groupingReason: 'authoring_animated_group_regroup_locked',
          deleteReason: 'authoring_animated_group_ungroup_bake_unsupported',
        });
        else if (current.groupingReason === 'authoring_animated_group_regroup_locked') nodes.set(current.nodeId, { ...current,
          transformLocks: Object.fromEntries(Object.entries(current.transformLocks).filter(([, reason]) => reason !== 'authoring_animated_group_static_transform_locked')),
          capabilities: { ...current.capabilities, transform: true },
          deleteReason: 'authoring_group_has_children',
        });
      }
      current = current.parentNodeId ? nodes.get(current.parentNodeId) : undefined;
    }
  };
  for (const [compId, ids] of nodeIdsByComp) for (const nodeId of ids) containingComp.set(nodeId, compId);
  for (const command of commands) {
    if (command.type === 'artboard.create') {
      if (document.compositions.some((composition) => composition.artboardId === command.artboardId)) continue;
      document.compositions.push({
        compId: null, artboardId: command.artboardId, sourceCompId: null, sourceArtboardId: null,
        name: command.name, width: command.width, height: command.height, frameRate: command.frameRate,
        durationSec: command.durationSec, clock: {}, parentCompIds: [], orderReason: null,
        // The create operation itself is optimistic, but this operation family
        // has a native writer/readback path. Keep subsequent same-draft edits
        // available; compilation still validates the exact native receipt.
        creationReason: null,
        shapeCreationReason: null,
        artboardReason: null, nodeIds: [],
      });
      nodeIdsByComp.set(`draft:${command.artboardId}`, []);
    } else if (command.type === 'artboard.duplicate') {
      if (document.compositions.some((composition) => composition.artboardId === command.artboardId)) continue;
      const original = command.sourceArtboardId
        ? document.compositions.find((composition) => composition.artboardId === command.sourceArtboardId)
        : document.compositions.find((composition) => composition.compId === command.sourceCompId);
      if (!original) continue;
      const originalKey = compositionKey(original);
      const originalNodeIds = nodeIdsByComp.get(originalKey) ?? [...original.nodeIds];
      const duplicatedNodeIds = originalNodeIds.map((nodeId) => templateAuthoringArtboardDraftNodeId(command.artboardId, nodeId));
      if (new Set(duplicatedNodeIds).size !== duplicatedNodeIds.length || duplicatedNodeIds.some((id) => nodes.has(id))) continue;
      const duplicatedByOriginal = new Map(originalNodeIds.map((id, index) => [id, duplicatedNodeIds[index]!]));
      for (const [index, sourceNodeId] of originalNodeIds.entries()) {
        const sourceNode = nodes.get(sourceNodeId);
        const nodeId = duplicatedNodeIds[index];
        if (!sourceNode || !nodeId) continue;
        const copiedGeometry = sourceNode.maskSourceGeometry?.status === 'authored' && sourceNode.kind === 'shape'
          ? authoredShapeMaskGeometry({
            draftNodeId: nodeId.slice('draft:'.length),
            workspaceChecksum: sourceNode.maskSourceGeometry.workspaceChecksum,
            target: { compId: null, artboardId: command.artboardId },
            position: sourceNode.position ?? sourceNode.maskSourceGeometry.position.slice(0, 2) as [number, number],
            size: sourceNode.size ?? [sourceNode.maskSourceGeometry.bounds.width, sourceNode.maskSourceGeometry.bounds.height],
            scale: sourceNode.scale ?? [100, 100], rotation: sourceNode.rotation ?? 0,
          })
          : sourceNode.maskSourceGeometry;
        nodes.set(nodeId, {
          ...sourceNode, nodeId, sourceRef: null, sourceNodeId,
          sourceCompositionId: null, parentNodeId: sourceNode.parentNodeId
            ? duplicatedByOriginal.get(sourceNode.parentNodeId) ?? null : null,
          index,
          ...(copiedGeometry ? { maskSourceGeometry: copiedGeometry } : {}),
        });
        containingComp.set(nodeId, `draft:${command.artboardId}`);
      }
      document.compositions.push({
        ...original, compId: null, artboardId: command.artboardId, sourceCompId: original.compId,
        sourceArtboardId: original.artboardId, name: command.name, parentCompIds: [],
        orderReason: original.orderReason,
        creationReason: original.creationReason,
        shapeCreationReason: original.shapeCreationReason,
        artboardReason: original.artboardReason, nodeIds: duplicatedNodeIds,
      });
      nodeIdsByComp.set(`draft:${command.artboardId}`, duplicatedNodeIds);
    } else if (command.type === 'mask.create') {
      const node = nodes.get(command.nodeId);
      if (!node || !maskDraftFitsSource(node, document.sourceChecksum, command)) continue;
      if (authoredMaskTargets.has(command.draftMaskId)) continue;
      const masks = node.masks ?? [];
      if (masks.some((mask) => mask.draftMaskId === command.draftMaskId)) continue;
      node.masks = [...masks, {
        draftMaskId: command.draftMaskId,
        name: command.name,
        shape: command.shape,
        center: command.center,
        size: command.size,
        mode: command.mode,
        opacity: command.opacity,
        feather: command.feather,
      }];
      refreshFreshGrouping(node);
      authoredMaskTargets.set(command.draftMaskId, command.nodeId);
    } else if (command.type === 'mask.update') {
      const node = nodes.get(command.nodeId);
      if (authoredMaskTargets.get(command.draftMaskId) !== command.nodeId || !node) continue;
      node.masks = (node.masks ?? []).map((mask) => {
        if (mask.draftMaskId !== command.draftMaskId) return mask;
        const updated = { ...mask, ...command.patch };
        return maskDraftFitsSource(node, document.sourceChecksum, updated) ? updated : mask;
      });
      refreshFreshGrouping(node);
    } else if (command.type === 'mask.delete') {
      const node = nodes.get(command.nodeId);
      if (authoredMaskTargets.get(command.draftMaskId) !== command.nodeId || !node) continue;
      node.masks = (node.masks ?? []).filter((mask) => mask.draftMaskId !== command.draftMaskId);
      refreshFreshGrouping(node);
      authoredMaskTargets.delete(command.draftMaskId);
    } else if (command.type === 'layer.timing') {
      const node = nodes.get(command.nodeId);
      if (node?.kind !== 'group' && node?.capabilities.timing && node.timingReason === null) {
        node.inSec = command.inSec;
        node.outSec = command.outSec;
      }
    } else if (command.type === 'layer.keyframes.replace') {
      const node = nodes.get(command.nodeId);
      if (!node?.capabilities.keyframes || (node.kind === 'group' && node.sourceRef !== null &&
          (sourceGroupMembers(document, node.nodeId, [...nodes.values()]) === null ||
            !(['position', 'scale', 'rotation'] as const).includes(command.channel as 'position' | 'scale' | 'rotation')))) continue;
      let keyframeChannels = node.keyframeChannels.map((channel) => channel.channelId !== command.channelId ||
        channel.channel !== command.channel || channel.reason !== null
        ? channel
        : { ...channel, keyframes: command.keyframes.map((frame) => ({
            ...frame,
            inEase: frame.inEase ?? [],
            outEase: frame.outEase ?? [],
          })) });
      let updatedNode = { ...node, keyframeChannels };
      if (command.channel === 'position') {
        const existing = node.keyframeChannels.find((channel) => channel.channelId === command.channelId);
        const lastValue = command.keyframes.length === 0 ? existing?.keyframes.at(-1)?.value : null;
        keyframeChannels = keyframeChannels.map((channel) => channel.channelId !== command.channelId
          ? channel
          : { ...channel, baseValue: command.keyframes.length === 0 && Array.isArray(lastValue) && lastValue.length === 3
              ? [lastValue[0]!, lastValue[1]!, lastValue[2]!] as [number, number, number]
              : command.keyframes.length === 0 ? channel.baseValue : null });
        updatedNode = { ...updatedNode, keyframeChannels };
        if (Array.isArray(lastValue) && lastValue.length === 3) {
          updatedNode = { ...updatedNode, position: [lastValue[0]!, lastValue[1]!],
            positionSource: { kind: 'explicit', value: [lastValue[0]!, lastValue[1]!, lastValue[2]!], reason: null } };
        } else if (command.keyframes.length > 0) {
          updatedNode = { ...updatedNode, positionSource: { kind: 'keyframed', value: null, reason: null } };
        } else {
          updatedNode = { ...updatedNode, positionSource: { kind: 'pending', value: null,
            reason: 'authoring_position_after_keyframe_clear_unavailable' } };
        }
      }
      updatedNode = refreshFreshGrouping(updatedNode);
      if (node.maskSourceGeometry?.status === 'authored' && command.keyframes.length > 0) {
        updatedNode = { ...updatedNode, capabilities: { ...updatedNode.capabilities, masks: false },
          maskGeometryReason: 'authoring_mask_geometry_animated_shape_unsupported' };
      }
      nodes.set(command.nodeId, updatedNode);
      refreshFreshGrouping(node);
      refreshGeneratedGroupMotionLocks(command.nodeId);
    } else if (command.type === 'artboard.resize') {
      const composition = findComposition(command);
      if (composition && (composition.artboardReason === null || (command.artboardId && composition.compId === null))) {
        composition.width = command.width;
        composition.height = command.height;
      }
    } else if (command.type === 'artwork.create') {
      const key = targetKey(command);
      const composition = findComposition(command);
      if (!composition) continue;
      const motion = createdMotion({ nodeId: command.nodeId, kind: 'artwork', position: command.position,
        scale: [100, 100], rotation: 0, opacity: 100 }, composition);
      nodes.set(command.nodeId, {
        nodeId: command.nodeId,
        sourceRef: null,
        sourceNodeId: null,
        sourceCompositionId: null,
        ungroupTranslationReason: null,
        artworkAssetRef: command.assetRef,
        parentNodeId: null,
        name: command.name,
        textContent: null,
        fontRef: null,
        fillColor: null,
        kind: 'artwork',
        shape: null,
        size: command.size,
        pathPosition: null,
        fill: null,
        stroke: null,
        inSec: motion.inSec,
        outSec: motion.outSec,
        timingReason: motion.timingReason,
        keyframeChannels: motion.keyframeChannels,
        index: 0,
        visible: true,
        visibilityReason: null,
        textReason: 'Artwork has no text content.',
        fontReason: 'Artwork has no font.',
        font: null,
        fontSize: null,
        position: command.position,
        rotation: 0,
        scale: [100, 100],
        opacity: 100,
        transformLocks: {},
        capabilities: { ...createdCapabilities, grouping: true, timing: motion.timing, keyframes: motion.keyframes },
        duplicateReason: 'Waiting for server writer verification.',
        deleteReason: 'Waiting for server writer verification.',
        groupingReason: null,
        maskReason: 'Mask relationships are not supported for authored nodes.',
        maskGeometryReason: 'authoring_mask_source_geometry_pending',
        masks: [],
        opaqueSourceRef: document.opaqueSourceRef,
      });
      const ids = nodeIdsByComp.get(key) ?? [];
      nodeIdsByComp.set(key, [command.nodeId, ...ids.filter((id) => id !== command.nodeId)]);
      containingComp.set(command.nodeId, key);
    } else if (command.type === 'shape.create') {
      const key = targetKey(command);
      const composition = findComposition(command);
      if (!composition) continue;
      const motion = createdMotion({ nodeId: command.nodeId, kind: 'shape', position: command.position,
        scale: [100, 100], rotation: 0, opacity: 100 }, composition);
      const maskSourceGeometry = authoredShapeMaskGeometry({
        draftNodeId: command.nodeId.slice('draft:'.length),
        workspaceChecksum: source.workspacePackage?.packageChecksum ?? source.sourceChecksum,
        target: command.artboardId
          ? { compId: null, artboardId: command.artboardId }
          : { compId: command.compId!, artboardId: null },
        position: command.position,
        size: command.size,
      });
      const node: TemplateAuthoringNode = {
        nodeId: command.nodeId,
        sourceRef: null,
        sourceNodeId: null,
        sourceCompositionId: null,
        ungroupTranslationReason: null,
        artworkAssetRef: null,
        parentNodeId: null,
        name: command.name,
        textContent: null,
        fontRef: null,
        fillColor: null,
        kind: 'shape',
        shape: command.shape,
        size: command.size,
        pathPosition: [0, 0],
        fill: command.fill,
        stroke: command.stroke,
        inSec: motion.inSec,
        outSec: motion.outSec,
        timingReason: motion.timingReason,
        keyframeChannels: motion.keyframeChannels,
        index: 0,
        visible: true,
        visibilityReason: null,
        textReason: 'authoring_shape_has_no_source_text',
        fontReason: 'authoring_shape_has_no_font',
        font: null,
        fontSize: null,
        position: command.position,
        rotation: 0,
        scale: [100, 100],
        opacity: 100,
        transformLocks: {},
        capabilities: { ...authoredShapeCapabilities, masks: true, timing: motion.timing, keyframes: motion.keyframes },
        duplicateReason: null,
        deleteReason: null,
        groupingReason: null,
        maskReason: null,
        maskGeometryReason: null,
        maskSourceGeometry,
        masks: [],
        opaqueSourceRef: authoredNodeSourceRef(document),
      };
      nodes.set(node.nodeId, node);
      const ids = nodeIdsByComp.get(key) ?? [];
      nodeIdsByComp.set(key, [command.nodeId, ...ids.filter((id) => id !== command.nodeId)]);
      containingComp.set(command.nodeId, key);
    } else if (command.type === 'text.create') {
      const key = targetKey(command);
      const composition = findComposition(command);
      if (!composition) continue;
      const motion = createdMotion({ nodeId: command.nodeId, kind: 'text', position: command.position,
        scale: [100, 100], rotation: 0, opacity: 100 }, composition);
      const node: TemplateAuthoringNode = {
        nodeId: command.nodeId,
        sourceRef: null,
        sourceNodeId: null,
        sourceCompositionId: null,
        ungroupTranslationReason: null,
        artworkAssetRef: null,
        parentNodeId: null,
        name: command.name,
        textContent: command.text,
        fontRef: command.fontRef,
        fillColor: command.fillColor,
        kind: 'text',
        shape: null,
        size: null,
        pathPosition: null,
        fill: null,
        stroke: null,
        inSec: motion.inSec,
        outSec: motion.outSec,
        timingReason: motion.timingReason,
        keyframeChannels: motion.keyframeChannels,
        index: 0,
        visible: true,
        visibilityReason: null,
        textReason: 'Waiting for server writer verification.',
        fontReason: 'Waiting for server writer verification.',
        font: command.fontRef.postScriptName,
        fontSize: command.fontSize,
        position: command.position,
        rotation: 0,
        scale: [100, 100],
        opacity: 100,
        transformLocks: { position: 'Waiting for server writer verification.' },
        capabilities: { ...createdCapabilities, grouping: true, timing: motion.timing, keyframes: motion.keyframes },
        duplicateReason: 'Waiting for server writer verification.',
        deleteReason: 'Waiting for server writer verification.',
        groupingReason: null,
        maskReason: 'Mask relationships are not supported for authored nodes.',
        maskGeometryReason: 'authoring_mask_source_geometry_pending',
        masks: [],
        opaqueSourceRef: document.opaqueSourceRef,
      };
      nodes.set(node.nodeId, node);
      const ids = nodeIdsByComp.get(key) ?? [];
      nodeIdsByComp.set(key, [command.nodeId, ...ids.filter((id) => id !== command.nodeId)]);
      containingComp.set(command.nodeId, key);
    } else if (command.type === 'layer.group') {
      const key = targetKey(command);
      const composition = findComposition(command);
      if (!composition) continue;
      const members = command.memberNodeIds.map((nodeId) => nodes.get(nodeId)).filter((node): node is TemplateAuthoringNode => node !== undefined);
      const isFreshStaticLeaf = (member: TemplateAuthoringNode, expectedParent: string | null = null) => {
        const capabilities = expectedParent ? member.groupedCapabilities ?? member.capabilities : member.capabilities;
        return (member.kind === 'shape' || member.kind === 'text' || member.kind === 'artwork') &&
          member.sourceRef === null && (member.sourceNodeId === null || generatedDuplicateNodes.has(member.nodeId)) &&
          member.parentNodeId === expectedParent && capabilities.transform === true && capabilities.grouping === true &&
          (expectedParent !== null || member.groupingReason === null) &&
          member.position !== null && member.scale !== null && member.rotation !== null &&
          [...member.position, ...member.scale, member.rotation].every(Number.isFinite) &&
          member.masks.length === 0 && member.keyframeChannels.every((channel) => channel.keyframes.length === 0);
      };
      const isFreshStaticGroup = (member: TemplateAuthoringNode, seen = new Set<string>()): boolean => {
        if (member.kind !== 'group' || member.sourceRef !== null || member.sourceNodeId !== null ||
            member.parentNodeId !== null || member.keyframeChannels.some((channel) => channel.keyframes.length > 0) ||
            seen.has(member.nodeId)) return false;
        const descendants = [...nodes.values()].filter((node) => node.parentNodeId === member.nodeId);
        if (descendants.length < 2) return false;
        const next = new Set(seen).add(member.nodeId);
        return descendants.every((child) => isFreshStaticLeaf(child, member.nodeId) || isFreshStaticGroup(child, next));
      };
      const groupable = command.artboardId !== undefined && members.length >= 2 && members.every((member) =>
        isFreshStaticLeaf(member) || isFreshStaticGroup(member));
      const groupMotion = createdGroupMotion(command.nodeId, composition);
      const group: TemplateAuthoringNode = {
        nodeId: command.nodeId,
        sourceRef: null,
        sourceNodeId: null,
        sourceCompositionId: null,
        ungroupTranslationReason: null,
        artworkAssetRef: null,
        parentNodeId: null,
        name: command.name,
        textContent: null,
        fontRef: null,
        fillColor: null,
        kind: 'group',
        shape: null,
        size: null,
        pathPosition: null,
        fill: null,
        stroke: null,
        inSec: 0,
        outSec: composition.durationSec,
        timingReason: 'authoring_generated_group_timing_unsupported',
        keyframeChannels: groupMotion.keyframeChannels,
        index: 0,
        visible: true,
        visibilityReason: 'Group visibility is not editable in this draft.',
        textReason: 'Groups do not contain editable text.',
        fontReason: 'Groups do not have a font.',
        font: null,
        fontSize: null,
        position: [0, 0],
        rotation: 0,
        scale: [100, 100],
        opacity: 0,
        transformLocks: { opacity: 'Group opacity is not editable in this draft.' },
        capabilities: {
          ...createdCapabilities,
          transform: true,
          grouping: groupable,
          timing: groupMotion.timingAvailable,
          keyframes: groupMotion.keyframeChannels.length === 3,
        },
        duplicateReason: 'Groups cannot be duplicated in this draft.',
        deleteReason: 'Ungroup this generated group instead.',
        groupingReason: groupable ? null : 'Nested groups are not supported.',
        maskReason: 'Mask relationships are not supported for authored nodes.',
        maskGeometryReason: 'authoring_mask_source_geometry_pending',
        masks: [],
        opaqueSourceRef: document.opaqueSourceRef,
      };
      nodes.set(command.nodeId, group);
      for (const memberNodeId of command.memberNodeIds) {
        const member = nodes.get(memberNodeId);
        if (!member) continue;
        nodes.set(memberNodeId, {
          ...member,
          parentNodeId: command.nodeId,
          groupedCapabilities: member.groupedCapabilities ?? member.capabilities,
          transformLocks: {
            ...member.transformLocks,
            position: 'This layer is moved with its group.',
            rotation: 'This layer is moved with its group.',
            scale: 'This layer is moved with its group.',
            opacity: 'This layer is controlled by its group.',
          },
          visibilityReason: 'This layer is controlled by its group.',
          capabilities: {
            ...member.capabilities,
            transform: false,
            visibility: false,
            duplicate: false,
            delete: false,
            order: false,
            grouping: false,
            ...(member.maskSourceGeometry?.status === 'authored' ? { masks: false } : {}),
          },
          duplicateReason: 'This layer is a member of a group.',
          deleteReason: 'Ungroup the parent group to remove this layer.',
          groupingReason: 'This layer is already in a group.',
          ...(member.maskSourceGeometry?.status === 'authored'
            ? { maskGeometryReason: 'authoring_mask_geometry_parented_shape_unsupported' } : {}),
        });
      }
      const ids = nodeIdsByComp.get(key) ?? [];
      nodeIdsByComp.set(key, [command.nodeId, ...ids]);
      containingComp.set(command.nodeId, key);
      composition.orderReason = 'Refresh layer order after grouping.';
    } else if (command.type === 'layer.group.transform') {
      const group = nodes.get(command.nodeId);
      const sourceGroup = group?.sourceRef !== null && group?.sourceRef !== undefined;
      const projectedNodes = [...nodes.values()];
      const projectedDocument = { ...document, nodes: projectedNodes };
      if (!group || group.kind !== 'group' || templateAuthoringGroupHasMotionInNodes(projectedNodes, command.nodeId) ||
          (sourceGroup && (!sourceGroupMembers(document, command.nodeId, projectedNodes) || !canMutateTemplateAuthoringSourceGroup(projectedDocument, command.nodeId, projectedNodes)))) continue;
      if (command.transform.position !== undefined) group.position = command.transform.position;
      if (command.transform.rotation !== undefined) group.rotation = command.transform.rotation;
      if (command.transform.scale !== undefined) group.scale = command.transform.scale;
      group.keyframeChannels = group.keyframeChannels.map((channel) => {
        if (channel.reason !== null || channel.keyframes.length > 0) return channel;
        if (channel.channel === 'position' && command.transform.position !== undefined)
          return { ...channel, baseValue: [command.transform.position[0], command.transform.position[1], 0] as [number, number, number] };
        if (channel.channel === 'scale' && command.transform.scale !== undefined)
          return { ...channel, baseValue: [command.transform.scale[0], command.transform.scale[1], 100] as [number, number, number] };
        if (channel.channel === 'rotation' && command.transform.rotation !== undefined)
          return { ...channel, baseValue: command.transform.rotation };
        return channel;
      });
    } else if (command.type === 'layer.ungroup') {
      const group = nodes.get(command.nodeId);
      const compId = containingComp.get(command.nodeId);
      const projectedNodes = [...nodes.values()];
      const sourceMembers = group?.sourceRef ? sourceGroupMembers(document, command.nodeId, projectedNodes)?.members : null;
      const generatedInDraft = commands.some((candidate) => candidate.type === 'layer.group' && candidate.nodeId === command.nodeId);
      const projectedDocument = { ...document, nodes: projectedNodes };
      const hasMotion = templateAuthoringGroupHasMotionInNodes(projectedNodes, command.nodeId);
      const animatedDirectChildren = supportsAnimatedDirectChildUngroup(projectedDocument, command.nodeId);
      if (!group || group.kind !== 'group' || compId === undefined ||
          (hasMotion && !animatedDirectChildren) ||
          (group.sourceRef ? !sourceMembers || (!canMutateTemplateAuthoringSourceGroup(projectedDocument, command.nodeId, projectedNodes) && !animatedDirectChildren) : !generatedInDraft)) continue;
      const authoritativeGroupPosition = animatedDirectChildren ? animatedGroupPositionBase(group) : null;
      const [gx, gy] = authoritativeGroupPosition ?? group.position ?? [0, 0];
      const [gsx, gsy] = group.scale ?? [100, 100];
      const radians = (group.rotation ?? 0) * Math.PI / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const sx = gsx / 100;
      const sy = gsy / 100;
      const membersToUngroup = sourceMembers ?? [...nodes.values()].filter((member) => member.parentNodeId === command.nodeId);
      for (const member of membersToUngroup) {
        if (nodes.get(member.nodeId)?.parentNodeId !== command.nodeId) continue;
        const { groupedCapabilities, ...rest } = member;
        const [mx, my] = member.position ?? [0, 0];
        const scaleChannel = member.keyframeChannels.find((channel) => channel.channel === 'scale' &&
          channelReasonCanBeIgnoredForUngroup(member, channel) && channel.keyframes.length === 0);
        const scaleBase = scaleChannel ? channelBaseForUngroup(scaleChannel) : null;
        const effectiveScale = Array.isArray(scaleBase)
          ? [scaleBase[0]!, scaleBase[1]!] as [number, number]
          : member.scale;
        const [msx, msy] = effectiveScale ?? [100, 100];
        const rotationChannel = member.keyframeChannels.find((channel) => channel.channel === 'rotation' &&
          channelReasonCanBeIgnoredForUngroup(member, channel) && channel.keyframes.length === 0);
        const rotationBase = rotationChannel ? channelBaseForUngroup(rotationChannel) : null;
        const memberRotation = typeof rotationBase === 'number' ? rotationBase : member.rotation ?? 0;
        const swappedAxes = Math.abs(Math.sin(memberRotation * Math.PI / 180)) > 1e-7;
        const translatedPosition = member.position
          ? [gx + cos * sx * mx - sin * sy * my, gy + sin * sx * mx + cos * sy * my] as [number, number]
          : member.position;
        const positionZ = member.positionSource?.value?.[2];
        const translatedScale = member.scale
          ? (swappedAxes ? [msx * sy, msy * sx] : [msx * sx, msy * sy]) as [number, number]
          : member.scale;
        const translatedRotation = member.rotation === null ? null : memberRotation + (group.rotation ?? 0);
        const keyframeChannels = member.keyframeChannels.map((channel) => {
          const parentLock = parentOnlyRigLock(member);
          const ungroupedChannel = channel.reason === parentLock && parentLock !== null && channel.propertyReason === null
            ? { ...channel, reason: channel.propertyReason,
              ...(channel.keyframes.length === 0 && channel.propertyBaseValue !== undefined
                ? { baseValue: channel.propertyBaseValue } : {}) }
            : channel;
          if (ungroupedChannel.channel === 'position' && translatedPosition && ungroupedChannel.reason === null &&
              (Array.isArray(ungroupedChannel.baseValue) && ungroupedChannel.baseValue.length === 3 ||
                ungroupedChannel.baseValue === null && member.positionSource?.kind === 'keyframed' && member.positionSource.value === null)) {
            if (ungroupedChannel.keyframes.length > 0) {
              const dx = gx;
              const dy = gy;
              return {
                ...ungroupedChannel,
                baseValue: Array.isArray(ungroupedChannel.baseValue)
                  ? [ungroupedChannel.baseValue[0] + dx, ungroupedChannel.baseValue[1] + dy, ungroupedChannel.baseValue[2]!] as [number, number, number]
                  : null,
                keyframes: ungroupedChannel.keyframes.map((frame) => Array.isArray(frame.value) && frame.value.length === 3
                  ? { ...frame, value: [frame.value[0]! + dx, frame.value[1]! + dy, frame.value[2]!] }
                  : frame),
              };
            }
            return { ...ungroupedChannel, baseValue: [translatedPosition[0], translatedPosition[1], ungroupedChannel.baseValue![2]!] as [number, number, number] };
          }
          if (ungroupedChannel.reason !== null || ungroupedChannel.keyframes.length !== 0) return ungroupedChannel;
          if (ungroupedChannel.channel === 'scale' && translatedScale && Array.isArray(ungroupedChannel.baseValue) && ungroupedChannel.baseValue.length === 3)
            return { ...ungroupedChannel, baseValue: [translatedScale[0], translatedScale[1], ungroupedChannel.baseValue[2]!] as [number, number, number] };
          if (ungroupedChannel.channel === 'rotation' && translatedRotation !== null && typeof ungroupedChannel.baseValue === 'number')
            return { ...ungroupedChannel, baseValue: translatedRotation };
          return ungroupedChannel;
        });
        const ungroupedNode: TemplateAuthoringNode = {
          ...rest,
          parentNodeId: null,
          position: translatedPosition,
          positionSource: member.positionSource?.kind === 'keyframed' && member.positionSource.value === null
            ? member.positionSource
            : translatedPosition && typeof positionZ === 'number'
            ? { kind: 'explicit', value: [translatedPosition[0], translatedPosition[1], positionZ], reason: null }
            : { kind: 'pending', value: null, reason: 'authoring_position_z_unavailable_after_ungroup' },
          rotation: translatedRotation,
          scale: translatedScale,
          keyframeChannels,
          transformLocks: Object.fromEntries(Object.entries(member.transformLocks).filter(([, reason]) => reason !== 'This layer is moved with its group.' && reason !== 'This layer is controlled by its group.')),
          capabilities: groupedCapabilities ?? member.capabilities,
          visibilityReason: null,
          duplicateReason: null,
          deleteReason: null,
          groupingReason: null,
        };
        const nativeParentTransformLocks = new Set([
          'authoring_group_member_transform_locked',
          'native_parent_hierarchy_unsupported_for_transform_edits',
          'native_parent_hierarchy_unsupported',
        ]);
        const hierarchyTransformLockReasons = (['position', 'rotation', 'scale'] as const)
          .map((channel) => member.transformLocks[channel]);
        if (member.kind === 'group' && member.sourceRef && member.capabilities.transform === false &&
            hierarchyTransformLockReasons.every((reason) => reason === undefined || nativeParentTransformLocks.has(reason))) {
          const projectedMemberNodes = [...nodes.values()].map((node) => node.nodeId === member.nodeId ? ungroupedNode : node);
          const sourceMembership = sourceGroupMembers(document, member.nodeId, projectedMemberNodes);
          const staticGroup = sourceMembership && !templateAuthoringGroupHasMotionInNodes(projectedMemberNodes, member.nodeId) &&
            ungroupedNode.position !== null && ungroupedNode.scale !== null && ungroupedNode.rotation !== null &&
            sourceMembership.members.every((child) => child.position !== null && child.scale !== null && child.rotation !== null);
          if (staticGroup) {
            ungroupedNode.transformLocks = Object.fromEntries(Object.entries(ungroupedNode.transformLocks)
              .filter(([, reason]) => !nativeParentTransformLocks.has(reason)));
            const transformLocksCleared = (['position', 'rotation', 'scale'] as const)
              .every((channel) => ungroupedNode.transformLocks[channel] === undefined);
            ungroupedNode.capabilities = { ...ungroupedNode.capabilities, transform: transformLocksCleared };
          }
        }
        if (member.maskSourceGeometry?.status === 'authored' && translatedPosition && translatedScale && translatedRotation !== null &&
            keyframeChannels.every((channel) => channel.keyframes.length === 0)) {
          const geometry = member.maskSourceGeometry;
          ungroupedNode.maskSourceGeometry = authoredShapeMaskGeometry({
            draftNodeId: geometry.draftNodeId, workspaceChecksum: geometry.workspaceChecksum, target: geometry.target,
            position: translatedPosition, size: member.size ?? [geometry.bounds.width, geometry.bounds.height],
            scale: translatedScale, rotation: translatedRotation,
          });
          ungroupedNode.maskGeometryReason = null;
          ungroupedNode.maskReason = null;
          ungroupedNode.capabilities = { ...ungroupedNode.capabilities, masks: true };
        }
        nodes.set(member.nodeId, ungroupedNode);
      }
      nodes.delete(command.nodeId);
      containingComp.delete(command.nodeId);
      nodeIdsByComp.set(compId, (nodeIdsByComp.get(compId) ?? []).filter((id) => id !== command.nodeId));
      const composition = document.compositions.find((item) => compositionKey(item) === compId);
      if (composition) composition.orderReason = 'Refresh layer order after ungrouping.';
    } else if (command.type === 'layer.duplicate') {
      const sourceNode = nodes.get(command.sourceNodeId);
      if (!sourceNode) continue;
      const compId = containingComp.get(command.sourceNodeId);
      if (compId === undefined) continue;
      const composition = document.compositions.find((item) => compositionKey(item) === compId);
      const sourceGeometry = sourceNode.maskSourceGeometry;
      const geometryTargetMatches = sourceGeometry?.status === 'authored' && composition &&
        (sourceGeometry.target.compId !== null
          ? composition.compId === sourceGeometry.target.compId && (composition.artboardId ?? null) === null
          : composition.artboardId === sourceGeometry.target.artboardId && (composition.compId ?? null) === null);
      const canRebindAuthoredGeometry = sourceGeometry?.status === 'authored' && sourceNode.kind === 'shape' &&
        sourceNode.sourceRef === null && sourceNode.nodeId === `draft:${sourceGeometry.draftNodeId}` && sourceNode.parentNodeId === null &&
        sourceGeometry.workspaceChecksum.toLowerCase() === (source.workspacePackage?.packageChecksum ?? source.sourceChecksum).toLowerCase() &&
        geometryTargetMatches && sourceNode.size?.[0] === sourceGeometry.bounds.width && sourceNode.size?.[1] === sourceGeometry.bounds.height &&
        sourceNode.keyframeChannels.every((channel) => channel.keyframes.length === 0);
      const duplicateGeometry = canRebindAuthoredGeometry && sourceGeometry?.status === 'authored'
        ? authoredShapeMaskGeometry({
            draftNodeId: command.nodeId.slice('draft:'.length),
            workspaceChecksum: sourceGeometry.workspaceChecksum,
            target: sourceGeometry.target,
            position: sourceNode.position ?? [sourceGeometry.position[0], sourceGeometry.position[1]],
            size: sourceNode.size ?? [sourceGeometry.bounds.width, sourceGeometry.bounds.height],
            scale: sourceNode.scale ?? [100, 100],
            rotation: sourceNode.rotation ?? 0,
          })
        : null;
      const geometryNeedsReadback = Boolean(sourceGeometry && !duplicateGeometry);
      const duplicateKeyframeChannels = sourceNode.keyframeChannels.map((channel) => {
        const prefix = `authoring:${sourceNode.nodeId}:`;
        return channel.channelId.startsWith(prefix)
          ? { ...channel, channelId: `authoring:${command.nodeId}:${channel.channelId.slice(prefix.length)}` }
          : channel;
      });
      const duplicateIsGroupable = command.nodeId.startsWith('draft:') && sourceNode.sourceRef === null &&
        sourceNode.nodeId.startsWith('draft:') && sourceNode.sourceNodeId === null && sourceNode.parentNodeId === null &&
        (sourceNode.kind === 'shape' || sourceNode.kind === 'text' || sourceNode.kind === 'artwork') &&
        sourceNode.capabilities.transform === true && sourceNode.capabilities.grouping === true && sourceNode.groupingReason === null &&
        sourceNode.position !== null && sourceNode.scale !== null && sourceNode.rotation !== null &&
        [...sourceNode.position, ...sourceNode.scale, sourceNode.rotation].every(Number.isFinite) &&
        sourceNode.masks.length === 0 && sourceNode.keyframeChannels.every((channel) => channel.keyframes.length === 0);
      nodes.set(command.nodeId, {
        ...structuredClone(sourceNode),
        nodeId: command.nodeId,
        sourceRef: null,
        sourceNodeId: command.sourceNodeId,
        sourceCompositionId: null,
        name: command.name,
        index: sourceNode.index,
        keyframeChannels: duplicateKeyframeChannels,
        ...(sourceGeometry ? {
          maskSourceGeometry: duplicateGeometry,
          maskGeometryReason: geometryNeedsReadback ? 'authoring_mask_geometry_duplicate_reinventory_pending' : null,
          maskReason: geometryNeedsReadback ? 'authoring_mask_geometry_duplicate_reinventory_pending' : null,
        } : {}),
        capabilities: {
          ...(duplicateIsGroupable ? authoredShapeCapabilities : createdCapabilities),
          masks: sourceGeometry ? !geometryNeedsReadback && sourceNode.capabilities.masks : createdCapabilities.masks,
        },
        textReason: 'Waiting for server writer verification.',
        duplicateReason: 'Waiting for server writer verification.',
        deleteReason: 'Waiting for server writer verification.',
        groupingReason: duplicateIsGroupable ? null : 'Waiting for server writer verification.',
        maskReason: sourceGeometry
          ? geometryNeedsReadback ? 'authoring_mask_geometry_duplicate_reinventory_pending' : null
          : 'Mask relationships are not supported for authored nodes.',
      });
      if (duplicateIsGroupable) generatedDuplicateNodes.add(command.nodeId);
      const ids = nodeIdsByComp.get(compId) ?? [];
      const at = ids.indexOf(command.sourceNodeId);
      ids.splice(at < 0 ? ids.length : at, 0, command.nodeId);
      nodeIdsByComp.set(compId, ids);
      containingComp.set(command.nodeId, compId);
    } else if (command.type === 'layer.delete') {
      nodes.delete(command.nodeId);
      const compId = containingComp.get(command.nodeId);
      if (compId !== undefined) nodeIdsByComp.set(compId, (nodeIdsByComp.get(compId) ?? []).filter((id) => id !== command.nodeId));
      containingComp.delete(command.nodeId);
    } else if (command.type === 'layer.edit') {
      const node = nodes.get(command.nodeId);
      if (node) {
        const edit = 'compId' in command.edit
          ? (({ compId: _compId, layerId: _layerId, ...rest }) => rest)(command.edit)
          : command.edit;
        const nextNode: TemplateAuthoringNode = {
          ...node,
          fontRef: ('fontRef' in edit ? edit.fontRef : undefined) ?? node.fontRef,
          font: ('fontRef' in edit ? edit.fontRef?.postScriptName : undefined) ?? ('font' in edit ? edit.font : undefined) ?? node.font,
          fontSize: edit.fontSize ?? node.fontSize,
          textContent: edit.text ?? node.textContent,
          visible: edit.visible ?? node.visible,
          position: edit.position ?? node.position,
          rotation: edit.rotation ?? node.rotation,
          scale: edit.scale ?? node.scale,
          opacity: edit.opacity ?? node.opacity,
          keyframeChannels: node.keyframeChannels.map((channel) => {
            if (edit.scale !== undefined && channel.channel === 'scale' && channel.reason === null &&
                channel.keyframes.length === 0 && Array.isArray(channel.baseValue) && channel.baseValue.length === 3)
              return { ...channel, baseValue: [edit.scale[0], edit.scale[1], channel.baseValue[2]!] as [number, number, number] };
            if (edit.rotation !== undefined && channel.channel === 'rotation' && channel.reason === null &&
                channel.keyframes.length === 0 && typeof channel.baseValue === 'number')
              return { ...channel, baseValue: edit.rotation };
            if (edit.position !== undefined && channel.channel === 'position' && channel.reason === null &&
                channel.keyframes.length === 0 && Array.isArray(channel.baseValue) && channel.baseValue.length === 3)
              return { ...channel, baseValue: [edit.position[0], edit.position[1], channel.baseValue[2]!] as [number, number, number] };
            return channel;
          }),
        };
        if (node.maskSourceGeometry?.status === 'authored') {
          const geometry = node.maskSourceGeometry;
          const canRefresh = nextNode.kind === 'shape' && nextNode.parentNodeId === null && nextNode.position !== null &&
            nextNode.scale !== null && nextNode.rotation !== null && nextNode.keyframeChannels.every((channel) => channel.keyframes.length === 0);
          if (canRefresh) nextNode.maskSourceGeometry = authoredShapeMaskGeometry({
            draftNodeId: geometry.draftNodeId, workspaceChecksum: geometry.workspaceChecksum, target: geometry.target,
            position: nextNode.position!, size: nextNode.size ?? [geometry.bounds.width, geometry.bounds.height],
            scale: nextNode.scale!, rotation: nextNode.rotation!,
          });
          else {
            nextNode.capabilities = { ...nextNode.capabilities, masks: false };
            nextNode.maskGeometryReason = 'authoring_mask_geometry_unavailable_after_hierarchy_or_animation';
          }
        }
        nodes.set(command.nodeId, nextNode);
      }
    }
  }

  for (const composition of document.compositions) {
    const key = compositionKey(composition);
    const explicitOrder = [...commands].reverse().find(
      (command) => command.type === 'composition.order' && targetKey(command) === key,
    );
    const order =
      explicitOrder?.type === 'composition.order'
        ? explicitOrder.nodeIds ?? (composition.compId === null ? undefined : explicitOrder.layerIds?.map((id) => `aep:${composition.compId}:${id}`))
        : nodeIdsByComp.get(key) ?? composition.nodeIds;
    const existing = (order ?? nodeIdsByComp.get(key) ?? []).filter((id) => nodes.has(id));
    nodeIdsByComp.set(key, existing);
    composition.nodeIds = existing;
  }
  for (const node of nodes.values()) {
    const compId = containingComp.get(node.nodeId);
    const order = compId === undefined ? undefined : nodeIdsByComp.get(compId);
    if (order) node.index = order.indexOf(node.nodeId);
  }
  document.nodes = [...nodes.values()];
  return document;
}
