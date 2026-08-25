import type { LayerEditorLayer } from '../../types';
import type { BlendMode } from '../render/effectSpec';
import type { Frame } from './frameModel';
import { type Rect, layerBounds, unionBounds } from './layerTransform';

/**
 * Pure document operations on a bottom-first layer array.
 *
 * Every function returns a NEW array and never mutates its input: the undo history in
 * `layerDocReducer.ts` stores whole documents, so a shared mutable layer object would
 * quietly rewrite the past.
 *
 * Array order IS the z order (aep-interop §4.2.6) — `layers[0]` paints first, at the
 * back. There is no `zIndex` and no `order` field; `order` already means sequence
 * position on `TimelineItem` and reusing the name here would be a real trap.
 */

export type LayerMove = 'top' | 'bottom' | 'up' | 'down';

/** Six alignment edges. `center` is horizontal, `middle` vertical, as in every editor. */
export type AlignEdge = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'lighten',
  'darken',
  'difference',
];

const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `layer-${Math.random().toString(36).slice(2)}-${Date.now()}`;

/**
 * A layer placed centred in the frame, contained (never enlarged).
 *
 * `anchor` defaults to the SOURCE centre — AE's default, and the only default under
 * which "rotate this layer" means what a user expects. It is stored explicitly rather
 * than implied, because an implied centre is exactly the assumption that makes a later
 * anchor field unrecoverable.
 */
export function createLayer(input: {
  sourceNodeId: string;
  name: string;
  sourceWidth: number;
  sourceHeight: number;
  frame: Frame;
  sourceAssetId?: string;
  sourceVersionId?: string;
  id?: string;
}): LayerEditorLayer {
  const sourceWidth = Math.max(1, Math.round(input.sourceWidth));
  const sourceHeight = Math.max(1, Math.round(input.sourceHeight));
  const contain = Math.min(1, input.frame.width / sourceWidth, input.frame.height / sourceHeight);
  return {
    id: input.id ?? newId(),
    name: input.name,
    sourceNodeId: input.sourceNodeId,
    sourceAssetId: input.sourceAssetId,
    sourceVersionId: input.sourceVersionId,
    sourceWidth,
    sourceHeight,
    anchor: { x: sourceWidth / 2, y: sourceHeight / 2 },
    position: { x: input.frame.width / 2, y: input.frame.height / 2 },
    scale: { x: contain, y: contain },
    rotation: 0,
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    locked: false,
  };
}

/** Locked layers are excluded from every geometric op. */
const editable = (
  layers: readonly LayerEditorLayer[],
  ids: readonly string[],
): LayerEditorLayer[] => {
  const wanted = new Set(ids);
  return layers.filter((layer) => wanted.has(layer.id) && !layer.locked);
};

const mapIds = (
  layers: readonly LayerEditorLayer[],
  ids: readonly string[],
  update: (layer: LayerEditorLayer) => LayerEditorLayer,
): LayerEditorLayer[] => {
  const wanted = new Set(ids);
  return layers.map((layer) => (wanted.has(layer.id) && !layer.locked ? update(layer) : layer));
};

/** Patch one layer by id. Bypasses the lock: the panel edits lock and name through it. */
export function setLayer(
  layers: readonly LayerEditorLayer[],
  id: string,
  patch: Partial<LayerEditorLayer>,
): LayerEditorLayer[] {
  return layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer));
}

export function removeLayers(
  layers: readonly LayerEditorLayer[],
  ids: readonly string[],
): LayerEditorLayer[] {
  const wanted = new Set(ids);
  return layers.filter((layer) => !(wanted.has(layer.id) && !layer.locked));
}

/** A copy directly above the original, offset so it is visibly a second thing. */
export function duplicateLayer(
  layers: readonly LayerEditorLayer[],
  id: string,
  offset = 24,
): LayerEditorLayer[] {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index < 0) return [...layers];
  const source = layers[index];
  const copy: LayerEditorLayer = {
    ...source,
    id: newId(),
    name: `${source.name} copy`,
    position: { x: source.position.x + offset, y: source.position.y + offset },
  };
  return [...layers.slice(0, index + 1), copy, ...layers.slice(index + 1)];
}

/**
 * Reorder within the bottom-first array.
 *
 * `up` means "towards the viewer", i.e. LATER in the array — the panel shows the array
 * reversed, so up on screen and up in z are the same direction for the user.
 */
export function moveLayer(
  layers: readonly LayerEditorLayer[],
  id: string,
  move: LayerMove,
): LayerEditorLayer[] {
  const from = layers.findIndex((layer) => layer.id === id);
  if (from < 0) return [...layers];
  const last = layers.length - 1;
  const to =
    move === 'top'
      ? last
      : move === 'bottom'
        ? 0
        : move === 'up'
          ? Math.min(last, from + 1)
          : Math.max(0, from - 1);
  if (to === from) return [...layers];
  return reorderLayers(layers, from, to);
}

/** Move the layer at `from` to index `to`. The panel's drag-reorder lands here. */
export function reorderLayers(
  layers: readonly LayerEditorLayer[],
  from: number,
  to: number,
): LayerEditorLayer[] {
  if (from < 0 || from >= layers.length) return [...layers];
  const next = [...layers];
  const [moved] = next.splice(from, 1);
  next.splice(Math.min(next.length, Math.max(0, to)), 0, moved);
  return next;
}

/**
 * Align the selected layers, by their PLACED bounding boxes.
 *
 * One selected layer aligns to the frame; two or more align to the union of their own
 * bounds, so "align left" pulls the group onto its own leftmost edge. Both are pure
 * rect math on `layerBounds`, and the delta is applied to `position` — aligning
 * `position` directly would align anchors, which for a rotated layer is not its edge.
 */
export function alignLayers(
  layers: readonly LayerEditorLayer[],
  ids: readonly string[],
  edge: AlignEdge,
  frame: Frame,
): LayerEditorLayer[] {
  const selected = editable(layers, ids);
  if (selected.length === 0) return [...layers];

  const target: Rect =
    selected.length > 1
      ? unionBounds(selected.map(layerBounds))
      : { left: 0, top: 0, right: frame.width, bottom: frame.height };

  return mapIds(layers, ids, (layer) => {
    const bounds = layerBounds(layer);
    const delta = alignDelta(bounds, target, edge);
    return {
      ...layer,
      position: { x: layer.position.x + delta.x, y: layer.position.y + delta.y },
    };
  });
}

function alignDelta(bounds: Rect, target: Rect, edge: AlignEdge): { x: number; y: number } {
  switch (edge) {
    case 'left':
      return { x: target.left - bounds.left, y: 0 };
    case 'right':
      return { x: target.right - bounds.right, y: 0 };
    case 'center':
      return { x: (target.left + target.right) / 2 - (bounds.left + bounds.right) / 2, y: 0 };
    case 'top':
      return { x: 0, y: target.top - bounds.top };
    case 'bottom':
      return { x: 0, y: target.bottom - bounds.bottom };
    case 'middle':
      return { x: 0, y: (target.top + target.bottom) / 2 - (bounds.top + bounds.bottom) / 2 };
  }
}

/** Arrow-key move. 1px plain, 10px with shift — the caller supplies the pixels. */
export function nudgeLayers(
  layers: readonly LayerEditorLayer[],
  ids: readonly string[],
  dx: number,
  dy: number,
): LayerEditorLayer[] {
  return mapIds(layers, ids, (layer) => ({
    ...layer,
    position: { x: layer.position.x + dx, y: layer.position.y + dy },
  }));
}

/**
 * Flip on one axis.
 *
 * A NEGATED SCALE, not a `flip` flag (aep-interop §4.2.3). AE expresses a mirror this
 * way, and a separate boolean beside a per-axis scale is two spellings of one fact —
 * the pair drifts the first time something writes only one of them.
 */
export function flipLayers(
  layers: readonly LayerEditorLayer[],
  ids: readonly string[],
  axis: 'x' | 'y',
): LayerEditorLayer[] {
  return mapIds(layers, ids, (layer) => ({
    ...layer,
    scale:
      axis === 'x'
        ? { x: -layer.scale.x, y: layer.scale.y }
        : { x: layer.scale.x, y: -layer.scale.y },
  }));
}

export function renameLayer(
  layers: readonly LayerEditorLayer[],
  id: string,
  name: string,
): LayerEditorLayer[] {
  return setLayer(layers, id, { name });
}

/**
 * Names that appear more than once.
 *
 * AE does not enforce unique layer names and `name` is the join key an AE-side template
 * binds by (§4.2.5), so a collision is a WARNING the panel shows — never a silent
 * rename, which would break that binding.
 */
export function duplicateNames(layers: readonly LayerEditorLayer[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const layer of layers) {
    if (seen.has(layer.name)) duplicates.add(layer.name);
    seen.add(layer.name);
  }
  return duplicates;
}
