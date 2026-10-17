import type { TemplateAuthoringNode, TemplateMaskSourceGeometry } from '@continuum/contracts';

export type MaskShape = 'rectangle' | 'ellipse';
export type MaskDraft = {
  name: string;
  shape: MaskShape;
  center: [number, number];
  size: [number, number];
  mode: 'none' | 'add' | 'subtract' | 'intersect' | 'lighten' | 'darken' | 'difference';
  opacity: number;
  feather: [number, number];
};

const MASK_SOURCE_KINDS = new Set(['shape-path', 'footage']);
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-4;

export function maskCreationReason(
  node: TemplateAuthoringNode | null | undefined,
  sourceChecksum: string | null | undefined,
): string | null {
  if (!node) return 'Select a verified source layer to add a mask.';
  if (!node.capabilities.masks || node.maskReason !== null || node.maskGeometryReason !== null)
    return 'Mask creation is unavailable for this layer until its writer and geometry checks pass.';
  const geometry = node.maskSourceGeometry;
  if (!geometry || (geometry.status !== 'verified' && geometry.status !== 'authored') || !MASK_SOURCE_KINDS.has(geometry.sourceKind))
    return 'A verified shape or image boundary is required.';
  if (geometry.status === 'authored') {
    const packageChecksum = node.opaqueSourceRef.workspacePackage?.packageChecksum ?? node.opaqueSourceRef.checksum;
    if (node.kind !== 'shape' || node.sourceRef !== null || `draft:${geometry.draftNodeId}` !== node.nodeId ||
        geometry.workspaceChecksum.toLowerCase() !== packageChecksum.toLowerCase() ||
        geometry.bounds.width !== node.size?.[0] || geometry.bounds.height !== node.size?.[1])
      return 'The expected shape boundary does not match this authored workspace layer.';
    return validBounds(geometry.bounds) ? null : 'A valid source-pixel boundary is unavailable.';
  }
  if (!node.sourceRef) return 'Select a verified source layer to add a mask.';
  if ((geometry.sourceKind === 'shape-path' && geometry.sourceRef.kind !== 'native-path') ||
      (geometry.sourceKind === 'footage' && geometry.sourceRef.kind !== 'footage-item'))
    return 'The measured boundary does not match a supported shape or image source.';
  if (
    !sourceChecksum || geometry.packageSha256.toLowerCase() !== sourceChecksum.toLowerCase() ||
    geometry.compId !== node.sourceRef.compId || geometry.layerUid !== node.sourceRef.layerId
  ) return 'The measured boundary does not match this pinned source layer.';
  if (geometry.coordinateSpace !== 'layer-source-pixels' || !geometry.localToComp.verifiedWithPyAep)
    return 'The layer boundary is not verified in source pixels.';
  if (!validBounds(geometry.bounds)) return 'A valid source-pixel boundary is unavailable.';
  return null;
}

export function maskDraftFitsSource(
  node: TemplateAuthoringNode,
  sourceChecksum: string | null | undefined,
  draft: MaskDraft,
): boolean {
  const geometry = node.maskSourceGeometry;
  if (maskCreationReason(node, sourceChecksum) !== null || !geometry || geometry.status === 'pending') return false;
  return maskDraftError(geometry, draft) === null;
}

export function validBounds(bounds: { x: number; y: number; width: number; height: number }) {
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) &&
    bounds.width > 0 && bounds.height > 0;
}

export function defaultMaskDraft(node: TemplateAuthoringNode, shape: MaskShape = 'rectangle'): MaskDraft | null {
  const bounds = node.maskSourceGeometry && node.maskSourceGeometry.status !== 'pending' ? node.maskSourceGeometry.bounds : null;
  if (!bounds || !validBounds(bounds)) return null;
  const width = bounds.width / 2;
  const height = bounds.height / 2;
  return {
    name: `${node.name ?? 'Layer'} mask`,
    shape,
    center: [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
    size: [width, height],
    mode: 'add',
    opacity: 100,
    feather: [0, 0],
  };
}

export function maskDraftError(
  geometry: Exclude<TemplateMaskSourceGeometry, { status: 'pending' }>,
  draft: MaskDraft,
): string | null {
  const { bounds } = geometry;
  if (!draft.name.trim() || draft.name.length > 200) return 'Enter a mask name up to 200 characters.';
  const [cx, cy] = draft.center;
  const [width, height] = draft.size;
  const [fx, fy] = draft.feather;
  if (![cx, cy, width, height, draft.opacity, fx, fy].every(Number.isFinite))
    return 'Enter numbers for the mask boundary.';
  if (width <= 0 || height <= 0 || width > bounds.width || height > bounds.height)
    return 'Mask size must fit within the measured source boundary.';
  if (
    cx - width / 2 < bounds.x || cy - height / 2 < bounds.y ||
    cx + width / 2 > bounds.x + bounds.width || cy + height / 2 > bounds.y + bounds.height
  ) return 'Keep the mask boundary inside the measured source pixels.';
  if (draft.opacity < 0 || draft.opacity > 100) return 'Opacity must be between 0 and 100 percent.';
  if (fx < 0 || fy < 0 || fx > 32_000 || fy > 32_000)
    return 'Feather must be between 0 and 32,000 source pixels.';
  return null;
}

function matrixFromPose(
  position: readonly [number, number],
  scale: readonly [number, number],
  rotation: number,
  anchor: readonly [number, number],
): [number, number, number, number, number, number] {
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const a = cos * scale[0] / 100;
  const b = sin * scale[0] / 100;
  const c = -sin * scale[1] / 100;
  const d = cos * scale[1] / 100;
  return [a, b, c, d, position[0] - a * anchor[0] - c * anchor[1], position[1] - b * anchor[0] - d * anchor[1]];
}

function multiplyAffine(
  left: readonly [number, number, number, number, number, number],
  right: readonly [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  const [a, b, c, d, e, f] = left;
  const [g, h, i, j, k, l] = right;
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j,
    a * k + c * l + e, b * k + d * l + f];
}

function inverseAffine(matrix: readonly [number, number, number, number, number, number]) {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return null;
  const invA = d / determinant;
  const invB = -b / determinant;
  const invC = -c / determinant;
  const invD = a / determinant;
  return [invA, invB, invC, invD, -(invA * e + invC * f), -(invB * e + invD * f)] as const;
}

/** Rebuilds the source-to-comp map only when the pinned affine matches this layer's native pose. */
export function maskPreviewMatrix(
  node: TemplateAuthoringNode,
  sourceChecksum: string,
): [number, number, number, number, number, number] | null {
  if (maskCreationReason(node, sourceChecksum) !== null || node.parentNodeId !== null || !node.position ||
    !node.scale || node.rotation === null) return null;
  const geometry = node.maskSourceGeometry;
  if (!geometry || geometry.status === 'pending') return null;
  const positionXY: [number, number] = [geometry.position[0], geometry.position[1]];
  const anchorXY: [number, number] = [geometry.anchor[0], geometry.anchor[1]];
  const base = matrixFromPose(positionXY, [geometry.scale[0], geometry.scale[1]], geometry.rotation,
    anchorXY);
  const inverseBase = inverseAffine(base);
  if (!inverseBase) return null;
  const current = matrixFromPose(node.position, node.scale, node.rotation, anchorXY);
  const delta = multiplyAffine(current, inverseBase);
  const pinned = geometry.localToComp.matrix;
  const result = multiplyAffine(delta, pinned);
  if (!result.every(Number.isFinite)) return null;
  if (close(node.position[0], geometry.position[0]) && close(node.position[1], geometry.position[1]) &&
      close(node.scale[0], geometry.scale[0]) && close(node.scale[1], geometry.scale[1]) && close(node.rotation, geometry.rotation))
    return [...pinned];
  return result;
}

export function maskBoundaryFitsGeometry(
  geometry: Exclude<TemplateMaskSourceGeometry, { status: 'pending' }>,
  draft: MaskDraft,
) {
  return maskDraftError(geometry, draft) === null;
}
