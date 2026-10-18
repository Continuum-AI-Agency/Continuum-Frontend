'use client';

import type {
  FontInventoryRow,
  TemplateAuthoringNode,
  TemplateAuthoringCommand,
} from '@continuum/contracts';
import type { AuthoringEditableLayer, AuthoringLayerEdit } from './authoringTemplateLayerTypes';
import { Minus, Plus, RotateCcw, Scan, X } from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { createLayerPreview, poseDelta, type PreviewEdits } from './authoringLayerPreviewSvg';
import { TemplateLayerInspector } from './AuthoringTemplateLayerInspector';
import { templateArtworkPreviewKey } from './templateAuthoringProjection';
import { maskPreviewMatrix } from './templateAuthoringMasks';
import type { AuthoredRenderNodeSample } from './templateAuthoringMotion';
import {
  alignFrames,
  frameCanvasSelection,
  type CanvasAlignment,
  type CanvasGuides,
  type CanvasViewMeasurement,
  type CanvasLayerFrame,
  type CanvasPoint,
  type CanvasRect,
  canvasGestureAllowed,
  moveFrames,
  normalizeAngle,
  normalizeSelection,
  type ResizeHandle,
  resizeFrames,
  retainCanvasViewOnResize,
  rotateFrames,
  snapPoint,
  snapTranslation,
  toggleSelection,
  usableSnapRects,
  unionBounds,
} from './templateLayerCanvasGeometry';

/** A flattened precomp's child selects its containing layer in the composition being edited. */
export function previewTarget(
  target: Element,
  layers: readonly AuthoringEditableLayer[],
  compId: number | null,
) {
  if (compId === null) return null;
  let group = target.closest('[data-layer-id]');
  const seen = new Set<number>();
  while (group) {
    const id = Number(group.getAttribute('data-layer-id'));
    if (seen.has(id)) return null;
    seen.add(id);
    const layer = layers.find((entry) => entry.layerId === id);
    if (layer?.compId === compId) return layer;
    const parent = group.getAttribute('data-in');
    group = parent
      ? (group.closest('svg')?.querySelector(`[data-layer-id="${Number(parent)}"]`) ?? null)
      : null;
  }
  return null;
}

function generatedGroupHasKeyframes(node: TemplateAuthoringNode | null | undefined) {
  return node?.kind === 'group' && (node.keyframeChannels ?? []).some((channel) => channel.keyframes.length > 0);
}

function pointerIsOnRenderedResizeEdge(
  handle: ResizeHandle,
  bounds: SelectionBox,
  point: CanvasPoint,
  handleWidth: number,
  handleHeight: number,
) {
  if (point.x < bounds.left || point.x > bounds.left + bounds.width ||
    point.y < bounds.top || point.y > bounds.top + bounds.height) return true;
  const horizontalBand = Math.min(bounds.width / 4, handleWidth / 2 || 5);
  const verticalBand = Math.min(bounds.height / 4, handleHeight / 2 || 5);
  return (!handle.includes('w') || point.x - bounds.left <= horizontalBand) &&
    (!handle.includes('e') || bounds.left + bounds.width - point.x <= horizontalBand) &&
    (!handle.includes('n') || point.y - bounds.top <= verticalBand) &&
    (!handle.includes('s') || bounds.top + bounds.height - point.y <= verticalBand);
}

type CanvasGesture = {
  edits: readonly AuthoringLayerEdit[];
  selectionIds: readonly number[];
  group: string;
};

type TransformGesture = {
  kind: 'move' | 'resize' | 'rotate';
  pointerId: number;
  inverse: DOMMatrix;
  start: CanvasPoint;
  startClient: CanvasPoint;
  lastClient: CanvasPoint;
  frames: CanvasLayerFrame[];
  bounds: CanvasRect;
  targets: CanvasRect[];
  tolerance: number;
  selectionIds: number[];
  handle?: ResizeHandle;
  pivot: CanvasPoint;
  startAngle: number;
  moved: boolean;
};

type PanGesture = {
  kind: 'pan';
  pointerId: number;
  startClient: CanvasPoint;
  initialPan: CanvasPoint;
};

const EMPTY_AUTHORED_RENDER_NODES: readonly AuthoredRenderNodeSample[] = [];

type AuthoredGestureEdit = {
  position?: [number, number];
  scale?: [number, number];
  rotation?: number;
};

type AuthoredHandleGesture = {
  pointerId: number;
  node: TemplateAuthoringNode;
  kind: 'move' | 'resize' | 'rotate';
  handle?: ResizeHandle;
  inverse: DOMMatrix;
  start: CanvasPoint;
  pivot: CanvasPoint;
  startAngle: number;
  startPosition: readonly [number, number];
  startScale: readonly [number, number];
  startRotation: number;
  targets: CanvasRect[];
  tolerance: number;
  edit: AuthoredGestureEdit;
  bounds: CanvasRect;
  elements: Array<{ element: SVGGElement; transform: string | null }>;
};

type ActiveGesture = TransformGesture | PanGesture;
type SelectionBox = { left: number; top: number; width: number; height: number };

const HANDLE_POSITIONS: Record<ResizeHandle, CSSProperties> = {
  nw: { left: '0%', top: '0%' },
  n: { left: '50%', top: '0%' },
  ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' },
  s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' },
  w: { left: '0%', top: '50%' },
};
const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const clampZoom = (zoom: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
const applyMatrix = (matrix: DOMMatrixReadOnly, x: number, y: number): CanvasPoint => ({
  x: matrix.a * x + matrix.c * y + (matrix.e ?? 0),
  y: matrix.b * x + matrix.d * y + (matrix.f ?? 0),
});
const pointFromClient = (inverse: DOMMatrix, x: number, y: number): CanvasPoint => {
  return applyMatrix(inverse, x, y);
};

function svgLayerBounds(svg: SVGSVGElement, layerId: number): CanvasRect | null {
  const inverse = svg.getScreenCTM()?.inverse();
  if (!inverse) return null;
  const groups = Array.from(
    svg.querySelectorAll<SVGGraphicsElement>(`[data-layer-id="${layerId}"]`),
  );
  const points = groups.flatMap((group) => {
    const rect = group.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    return [
      pointFromClient(inverse, rect.left, rect.top),
      pointFromClient(inverse, rect.right, rect.top),
      pointFromClient(inverse, rect.right, rect.bottom),
      pointFromClient(inverse, rect.left, rect.bottom),
    ];
  });
  if (!points.length) return null;
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function renderedElementBounds(svg: SVGSVGElement, element: SVGGraphicsElement): CanvasRect | null {
  let current: Element | null = element;
  while (current && current !== svg) {
    if (current.getAttribute('display') === 'none' || current.getAttribute('visibility') === 'hidden') return null;
    const opacity = current.getAttribute('opacity');
    if (opacity !== null && Number(opacity) <= 0) return null;
    current = current.parentElement;
  }
  const rect = element.getBoundingClientRect();
  const inverse = svg.getScreenCTM()?.inverse();
  if (!inverse || rect.width <= 0 || rect.height <= 0) return null;
  const points = [
    pointFromClient(inverse, rect.left, rect.top), pointFromClient(inverse, rect.right, rect.top),
    pointFromClient(inverse, rect.right, rect.bottom), pointFromClient(inverse, rect.left, rect.bottom),
  ];
  return {
    left: Math.min(...points.map((point) => point.x)), top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)), bottom: Math.max(...points.map((point) => point.y)),
  };
}

function viewBoxBounds(svg: SVGSVGElement): CanvasRect | null {
  const values = svg
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value)))
    return null;
  const [left, top, width, height] = values;
  return { left, top, right: left + width, bottom: top + height };
}

function authoredNodeTree(node: TemplateAuthoringNode, nodes: readonly TemplateAuthoringNode[]) {
  const ids = new Set([node.nodeId]);
  for (const currentId of ids) {
    for (const child of nodes) if (child.parentNodeId === currentId) ids.add(child.nodeId);
  }
  return nodes.filter((candidate) => ids.has(candidate.nodeId));
}

function authoredNodeSnapTargets(
  svg: SVGSVGElement,
  layers: readonly AuthoringEditableLayer[],
  compId: number | null,
  nodes: readonly TemplateAuthoringNode[],
  activeNodeIds: readonly string[],
  selected: TemplateAuthoringNode,
) {
  const members = authoredNodeTree(selected, nodes);
  const excludedNodeIds = new Set(members.map((member) => member.nodeId));
  const excludedLayerIds = new Set(members.flatMap((member) => member.sourceRef ? [member.sourceRef.layerId] : []));
  const targets = layers.filter((layer) => layer.compId === compId && layer.visible &&
    typeof layer.opacity === 'number' && layer.opacity > 0 &&
    !excludedLayerIds.has(layer.layerId))
    .map((layer) => svgLayerBounds(svg, layer.layerId));
  for (const node of nodes) {
    if (node.sourceRef || !activeNodeIds.includes(node.nodeId) || node.visible === false || excludedNodeIds.has(node.nodeId)) continue;
    const element = svg.querySelector<SVGGraphicsElement>(`[data-authored-node-id="${node.nodeId}"]`);
    if (element) targets.push(renderedElementBounds(svg, element));
  }
  const artboard = viewBoxBounds(svg);
  if (artboard) targets.push(artboard);
  return usableSnapRects(targets);
}

function canvasSnapTolerance(inverse: DOMMatrix, event: { clientX: number; clientY: number }) {
  const center = pointFromClient(inverse, event.clientX, event.clientY);
  const offsetX = pointFromClient(inverse, event.clientX + 8, event.clientY);
  const offsetY = pointFromClient(inverse, event.clientX, event.clientY + 8);
  return Math.max(
    Math.hypot(offsetX.x - center.x, offsetX.y - center.y),
    Math.hypot(offsetY.x - center.x, offsetY.y - center.y),
  );
}

function screenSelectionBounds(svg: SVGSVGElement, ids: readonly number[]): DOMRect | null {
  const rects = ids.flatMap((id) =>
    Array.from(svg.querySelectorAll<SVGGraphicsElement>(`[data-layer-id="${id}"]`))
      .map((group) => group.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0),
  );
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

function layerFrame(
  svg: SVGSVGElement,
  layer: AuthoringEditableLayer,
  edit?: AuthoringLayerEdit,
): CanvasLayerFrame | null {
  const bounds = svgLayerBounds(svg, layer.layerId);
  const position = edit
    ? [edit.x ?? layer.x ?? 0, edit.y ?? layer.y ?? 0] as [number, number]
    : layer.position ?? [layer.x ?? 0, layer.y ?? 0];
  if (!position) return null;
  const measured = bounds ?? {
    left: position[0],
    top: position[1],
    right: position[0] + 1,
    bottom: position[1] + 1,
  };
  return {
    layer,
    position,
    rotation: edit?.rotation ?? layer.rotation ?? 0,
    scale: edit?.scale ?? layer.scale ?? [100, 100],
    bounds: measured,
  };
}

function authoredParentTransform(node: TemplateAuthoringNode, nodes: readonly TemplateAuthoringNode[]): string {
  const transforms: string[] = [];
  const visited = new Set<string>();
  let parentId = node.parentNodeId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodes.find((candidate) => candidate.nodeId === parentId);
    if (!parent || parent.sourceRef) break;
    if (parent.kind === 'group') {
      const [x, y] = parent.position ?? [0, 0];
      const [sx, sy] = parent.scale ?? [100, 100];
      const rotation = parent.rotation ?? 0;
      const parts = [x || y ? `translate(${x} ${y})` : '', rotation ? `rotate(${rotation})` : '',
        sx !== 100 || sy !== 100 ? `scale(${sx / 100} ${sy / 100})` : ''].filter(Boolean);
      transforms.unshift(parts.join(' '));
    }
    parentId = parent.parentNodeId;
  }
  return transforms.filter(Boolean).join(' ');
}

export function TemplateLayerPreview({
  markup,
  previewEdits,
  layers,
  compId,
  layer,
  edit,
  edits = {},
  fonts,
  disabled,
  onSelect,
  onEdit,
  onGestureCommit,
  onSelectNode,
  onDuplicateNode,
  onDeleteNode,
  onAuthoredGestureCommit,
  authoredNodes = [],
  authoredNodeIds = [],
  authoredRenderNodes = EMPTY_AUTHORED_RENDER_NODES,
  removedSourceNodeIds = [],
  artworkPreviewUrls = {},
  sourceChecksum = null,
  artboard,
  selectedNodeId,
}: {
  markup: string;
  previewEdits?: PreviewEdits;
  layers: readonly AuthoringEditableLayer[];
  compId: number | null;
  layer?: AuthoringEditableLayer;
  edit?: AuthoringLayerEdit;
  edits?: Record<number, AuthoringLayerEdit>;
  fonts: FontInventoryRow[];
  disabled: boolean;
  onSelect: (id: number) => void;
  onEdit: (
    layer: AuthoringEditableLayer,
    change: Partial<AuthoringLayerEdit>,
    group?: string | null,
    end?: boolean,
  ) => void;
  /** One completed canvas gesture becomes one editor history/draft command. */
  onGestureCommit?: (gesture: CanvasGesture) => void;
  onSelectNode?: (nodeId: string) => void;
  onDuplicateNode?: () => void;
  onDeleteNode?: () => void;
  onAuthoredGestureCommit?: (nodeId: string, edit: AuthoredGestureEdit) => void;
  authoredNodes?: readonly TemplateAuthoringNode[];
  authoredNodeIds?: readonly string[];
  /** Display-only sampled poses; canonical authoredNodes remain the interaction source. */
  authoredRenderNodes?: readonly AuthoredRenderNodeSample[];
  /** Source IDs deleted in the private projection; used only to hide their original SVG nodes. */
  removedSourceNodeIds?: readonly string[];
  artworkPreviewUrls?: Readonly<Record<string, string>>;
  sourceChecksum?: string | null;
  artboard?: { width: number | null; height: number | null };
  selectedNodeId?: string | null;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const preview = useRef<ReturnType<typeof createLayerPreview>>(null);
  const outline = useRef<HTMLDivElement>(null);
  const active = useRef<ActiveGesture | null>(null);
  const frame = useRef<number | null>(null);
  const pendingPoint = useRef<CanvasPoint | null>(null);
  const authoredCallbacks = useRef({ onSelectNode, onAuthoredGestureCommit });
  authoredCallbacks.current = { onSelectNode, onAuthoredGestureCommit };
  const spaceDown = useRef(false);
  const sequence = useRef(0);
  const selectionRef = useRef<number[]>(layer ? [layer.layerId] : []);
  const shadowRef = useRef<Record<number, AuthoringLayerEdit>>({});
  const [selectionIds, setSelectionIds] = useState<number[]>(layer ? [layer.layerId] : []);
  const [shadowEdits, setShadowEdits] = useState<Record<number, AuthoringLayerEdit>>({});
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const authoredHandle = useRef<AuthoredHandleGesture | null>(null);
  const authoredBodyGesture = useRef<SVGGElement | null>(null);
  const [authoredGestureRevision, setAuthoredGestureRevision] = useState(0);
  const [guides, setGuides] = useState<CanvasGuides>({});
  const [open, setOpen] = useState(false);
  const cameraMeasurement = useRef<CanvasViewMeasurement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<CanvasPoint>({ x: 0, y: 0 });

  const basePreview = useMemo<PreviewEdits>(
    () =>
      previewEdits ?? {
        compId,
        layers,
        rendered: {},
        current: edits,
        renderedOrder: layers
          .filter((entry) => entry.compId === compId)
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map((entry) => entry.layerId),
        order: layers
          .filter((entry) => entry.compId === compId)
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map((entry) => entry.layerId),
      },
    [previewEdits, compId, layers, edits],
  );
  const currentSelection = normalizeSelection(selectionIds, layers, compId);
  const selectedAuthoredNode = authoredNodes.find((node) => node.nodeId === selectedNodeId && !node.sourceRef);
  const authoredRenderSamples = useMemo(() => {
    const canonicalIds = new Set(authoredNodes.filter((node) => !node.sourceRef && authoredNodeIds.includes(node.nodeId))
      .map((node) => node.nodeId));
    return new Map(authoredRenderNodes.filter((sample) => canonicalIds.has(sample.nodeId))
      .map((sample) => [sample.nodeId, sample] as const));
  }, [authoredNodes, authoredNodeIds, authoredRenderNodes]);
  const authoredDisplayNodes = useMemo(() => authoredNodes.map((node) => {
    const sample = authoredRenderSamples.get(node.nodeId);
    if (!sample || node.sourceRef) return node;
    return {
      ...node,
      ...(sample.position != null ? { position: sample.position } : {}),
      ...(sample.scale != null ? { scale: sample.scale } : {}),
      ...(sample.rotation != null ? { rotation: sample.rotation } : {}),
      ...(sample.opacity != null ? { opacity: sample.opacity } : {}),
      ...(sample.visible !== undefined ? { visible: sample.visible } : {}),
    };
  }), [authoredNodes, authoredRenderSamples]);
  const authoredSelectionElements = useCallback((node: TemplateAuthoringNode) => {
    const svg = canvas.current?.querySelector('svg');
    if (!svg) return [] as SVGGElement[];
    const members = node.kind === 'group'
      ? authoredNodeTree(node, authoredNodes).filter((candidate) => candidate.nodeId !== node.nodeId)
      : [node];
    const elements = members.flatMap((member) => {
      if (member.sourceRef) {
        return Array.from(svg.querySelectorAll<SVGGElement>('[data-layer-id]'))
          .filter((element) => Number(element.dataset.layerId) === member.sourceRef?.layerId);
      }
      return Array.from(svg.querySelectorAll<SVGGElement>('[data-authored-node-id]'))
        .filter((element) => element.dataset.authoredNodeId === member.nodeId);
    });
    return [...new Set(elements)];
  }, [authoredNodes]);
  const frameForIds = useCallback(
    (ids: readonly number[]) => {
      const svg = canvas.current?.querySelector('svg');
      if (!svg) return [];
      return ids.flatMap((id) => {
        const target = layers.find((entry) => entry.compId === compId && entry.layerId === id);
        const measured = target && layerFrame(svg, target, edits[id]);
        return measured ? [measured] : [];
      });
    },
    [layers, compId, edits],
  );
  const currentFrames = frameForIds(currentSelection);
  const groupBounds = unionBounds(currentFrames.map((entry) => entry.bounds));
  const moveAllowed =
    currentFrames.length === currentSelection.length && canvasGestureAllowed(currentFrames, 'move');
  const nativeResizeAllowed =
    currentFrames.length === currentSelection.length &&
    canvasGestureAllowed(currentFrames, 'resize');
  const nativeRotateAllowed =
    currentFrames.length === currentSelection.length &&
    canvasGestureAllowed(currentFrames, 'rotate');
  const authoredIsGroup = selectedAuthoredNode?.kind === 'group';
  const selectedAuthoredGroupHasMotion = generatedGroupHasKeyframes(selectedAuthoredNode);
  const selectedAuthoredGroupStaticTransformAllowed = !selectedAuthoredGroupHasMotion;
  const moveAuthoredGroupAllowed = authoredIsGroup && selectedAuthoredGroupStaticTransformAllowed &&
    !!selectedAuthoredNode?.capabilities.transform && !selectedAuthoredNode.transformLocks.position;
  const resizeAllowed = currentSelection.length > 0
    ? nativeResizeAllowed
    : selectedAuthoredGroupStaticTransformAllowed && !!selectedAuthoredNode?.capabilities.transform &&
      !selectedAuthoredNode.transformLocks.scale && selectedAuthoredNode.rotation === 0;
  const rotateAllowed = currentSelection.length > 0
    ? nativeRotateAllowed
    : selectedAuthoredGroupStaticTransformAllowed && !!selectedAuthoredNode?.capabilities.transform &&
      !selectedAuthoredNode.transformLocks.rotation;
  const multiAlignAllowed = currentSelection.length > 1 && moveAllowed;

  const updateSelection = useCallback(
    (ids: number[]) => {
      const next = normalizeSelection(ids, layers, compId);
      selectionRef.current = next;
      setSelectionIds(next);
    },
    [layers, compId],
  );

  useEffect(() => {
    const selectedAuthoredNode = authoredNodes.find((node) => node.nodeId === selectedNodeId);
    if (selectedAuthoredNode && !selectedAuthoredNode.sourceRef) {
      // Authored nodes have their own geometry and stable string identity. Keeping the previous
      // numeric source selection here draws transform handles over an unrelated native layer.
      selectionRef.current = [];
      setSelectionIds([]);
      setGuides({});
      setOpen(false);
      return;
    }
    if (layer && !selectionRef.current.includes(layer.layerId)) updateSelection([layer.layerId]);
  }, [authoredNodes, selectedNodeId, layer?.layerId, updateSelection]);

  useLayoutEffect(() => {
    preview.current = createLayerPreview(markup);
    content.current?.replaceChildren(...(preview.current ? [preview.current.root] : []));
    return () => {
      preview.current = null;
    };
  }, [markup]);

  useLayoutEffect(() => {
    const svg = preview.current?.root;
    if (!svg || !artboard?.width || !artboard.height || artboard.width <= 0 || artboard.height <= 0) return;
    svg.setAttribute('viewBox', `0 0 ${artboard.width} ${artboard.height}`);
    svg.dataset.effectiveArtboard = `${artboard.width}x${artboard.height}`;
    let frame = svg.querySelector('[data-canvas-artboard-frame]');
    if (!frame) {
      frame = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      frame.setAttribute('data-canvas-artboard-frame', 'true');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('pointer-events', 'none');
      frame.setAttribute('fill', 'none');
      frame.setAttribute('stroke', 'var(--border)');
      frame.setAttribute('stroke-width', '1');
      frame.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(frame);
    }
    frame.setAttribute('width', String(artboard.width));
    frame.setAttribute('height', String(artboard.height));
  }, [artboard?.width, artboard?.height, markup]);

  useLayoutEffect(() => {
    const svg = preview.current?.root;
    if (!svg) return;
    svg.querySelectorAll('[data-authored-node-id]').forEach((element) => element.remove());
    svg.querySelectorAll<SVGElement>('[data-authoring-group-original-transform]').forEach((element) => {
      const original = element.getAttribute('data-authoring-group-original-transform') ?? '';
      if (original) element.setAttribute('transform', original);
      else element.removeAttribute('transform');
      element.removeAttribute('data-authoring-group-original-transform');
    });
    for (const id of removedSourceNodeIds) {
      const match = /^aep:\d+:(\d+)$/.exec(id);
      if (!match) continue;
      svg.querySelectorAll(`[data-layer-id="${match[1]}"]`).forEach((element) => {
        if (element.closest('svg') === svg) element.remove();
      });
    }
    const ns = 'http://www.w3.org/2000/svg';
    const groups: SVGGElement[] = [];
    const groupOffset = (node: TemplateAuthoringNode) => authoredParentTransform(node, authoredNodes);
    for (const node of [...authoredNodes].sort((a, b) => b.index - a.index)) {
      if (!authoredNodeIds.includes(node.nodeId) || node.sourceRef) continue;
      const group = document.createElementNS(ns, 'g');
      group.dataset.authoredNodeId = node.nodeId;
      group.setAttribute('role', 'button');
      group.setAttribute('tabindex', '0');
      group.setAttribute('aria-label', `Select ${node.name ?? node.textContent ?? 'layer'}`);
      if (!node.visible) group.setAttribute('display', 'none');
      group.setAttribute('opacity', String((node.opacity ?? 100) / 100));
      if (node.kind === 'artwork' && node.artworkAssetRef && node.size && node.position) {
        const [x, y] = node.position;
        const [width, height] = node.size;
        const [scaleX, scaleY] = node.scale ?? [100, 100];
        group.setAttribute('transform', `${groupOffset(node)} translate(${x} ${y}) rotate(${node.rotation ?? 0}) scale(${scaleX / 100} ${scaleY / 100})`.trim());
        const image = document.createElementNS(ns, 'image');
        image.setAttribute('x', String(-width / 2));
        image.setAttribute('y', String(-height / 2));
        image.setAttribute('width', String(width));
        image.setAttribute('height', String(height));
        image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        const url = artworkPreviewUrls[templateArtworkPreviewKey(node.artworkAssetRef)];
        if (url) image.setAttribute('href', url);
        else {
          image.setAttribute('aria-label', 'Pinned image preview unavailable');
          image.setAttribute('opacity', '0.35');
        }
        group.append(image);
      } else if (node.kind === 'shape' && node.shape && node.size && node.position) {
        const [x, y] = node.position;
        const [width, height] = node.size;
        const [scaleX, scaleY] = node.scale ?? [100, 100];
        group.setAttribute('transform', `${groupOffset(node)} translate(${x} ${y}) rotate(${node.rotation ?? 0}) scale(${scaleX / 100} ${scaleY / 100})`.trim());
        const shape = document.createElementNS(ns, node.shape === 'ellipse' ? 'ellipse' : 'rect');
        const [pathX, pathY] = node.pathPosition ?? [0, 0];
        if (node.shape === 'ellipse') {
          shape.setAttribute('cx', String(pathX));
          shape.setAttribute('cy', String(pathY));
          shape.setAttribute('rx', String(width / 2));
          shape.setAttribute('ry', String(height / 2));
        } else {
          shape.setAttribute('x', String(pathX - width / 2));
          shape.setAttribute('y', String(pathY - height / 2));
          shape.setAttribute('width', String(width));
          shape.setAttribute('height', String(height));
        }
        const setPaint = (key: 'fill' | 'stroke', paint: typeof node.fill | typeof node.stroke) => {
          if (!paint || paint.type === 'none') {
            shape.setAttribute(key, 'none');
            return;
          }
          const color = paint.color.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255)).join(', ');
          shape.setAttribute(key, `rgb(${color})`);
          shape.setAttribute(`${key}-opacity`, String(paint.opacity));
          if (key === 'stroke' && 'width' in paint) shape.setAttribute('stroke-width', String(paint.width));
        };
        setPaint('fill', node.fill);
        setPaint('stroke', node.stroke);
        group.append(shape);
      } else if (node.textContent && node.position) {
        const [x, y] = node.position;
        const [scaleX, scaleY] = node.scale ?? [100, 100];
        group.setAttribute('transform', `${groupOffset(node)} translate(${x} ${y}) rotate(${node.rotation ?? 0}) scale(${scaleX / 100} ${scaleY / 100})`.trim());
        const text = document.createElementNS(ns, 'text');
        text.textContent = node.textContent;
        text.setAttribute('font-size', String(node.fontSize ?? 48));
        text.setAttribute('font-family', node.fontRef?.postScriptName ?? node.font ?? 'sans-serif');
        if (node.fillColor) text.setAttribute('fill', `rgb(${node.fillColor.map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255)).join(' ')})`);
        group.append(text);
      } else if (node.sourceNodeId) {
        const source = authoredNodes.find((candidate) => candidate.nodeId === node.sourceNodeId);
        const sourceRef = source?.sourceRef;
        if (!sourceRef) continue;
        const sourceLayer = layers.find((candidate) => candidate.compId === sourceRef.compId && candidate.layerId === sourceRef.layerId);
        const originals = [...svg.querySelectorAll(`[data-layer-id="${sourceRef.layerId}"]`)]
          .filter((element) => element.closest('svg') === svg);
        if (!sourceLayer || !originals.length) continue;
        for (const original of originals) {
          const clone = original.cloneNode(true) as SVGGElement;
          clone.querySelectorAll('[data-layer-id]').forEach((element) => element.removeAttribute('data-layer-id'));
          clone.removeAttribute('data-layer-id');
          group.append(clone);
        }
        if (source.position && node.position) {
          const delta = poseDelta(source, node);
          if (delta) group.setAttribute('transform', `${groupOffset(node)} ${delta}`.trim());
        }
      } else continue;
      const select = (event: Event) => {
        event.stopPropagation();
        authoredCallbacks.current.onSelectNode?.(node.nodeId);
      };
      const onPointerDown = (event: PointerEvent) => {
        if (event.button === 1 || spaceDown.current) return;
        select(event);
        if (
          event.button !== 0 || !authoredCallbacks.current.onAuthoredGestureCommit || !node.capabilities.transform ||
          node.transformLocks.position || !node.position ||
          generatedGroupHasKeyframes(node)
        ) return;
        const inverse = svg.getScreenCTM()?.inverse();
        if (!inverse) return;
        const measuredBounds = renderedElementBounds(svg, group);
        const bounds = measuredBounds ? unionBounds([measuredBounds]) : null;
        if (!bounds) return;
        const targets = authoredNodeSnapTargets(svg, layers, compId, authoredNodes, authoredNodeIds, node);
        const tolerance = canvasSnapTolerance(inverse, event);
        authoredBodyGesture.current = group;
        canvas.current?.focus({ preventScroll: true });
        event.preventDefault();
        setGuides({});
        const start = pointFromClient(inverse, event.clientX, event.clientY);
        const startPosition = node.position;
        const baseTransform = group.getAttribute('transform') ?? '';
        let moved = false;
        const onMove = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== event.pointerId) return;
          const point = pointFromClient(inverse, moveEvent.clientX, moveEvent.clientY);
          const rawDx = point.x - start.x;
          const rawDy = point.y - start.y;
          if (!moved && Math.hypot(rawDx, rawDy) < 2) return;
          const delta = snapTranslation(bounds, point.x - start.x, point.y - start.y, targets, tolerance);
          const { dx, dy } = delta;
          moved = true;
          setGuides(delta.guides);
          group.setAttribute('transform', `translate(${dx} ${dy}) ${baseTransform}`.trim());
        };
        const finish = (finishEvent: PointerEvent) => {
          if (finishEvent.pointerId !== event.pointerId) return;
          authoredBodyGesture.current = null;
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', finish);
          window.removeEventListener('pointercancel', cancel);
          setAuthoredGestureRevision((revision) => revision + 1);
          if (!moved) { setGuides({}); return; }
          const point = pointFromClient(inverse, finishEvent.clientX, finishEvent.clientY);
          const delta = snapTranslation(bounds, point.x - start.x, point.y - start.y, targets, tolerance);
          setGuides(delta.guides);
          const next: [number, number] = [
            startPosition[0] + delta.dx,
            startPosition[1] + delta.dy,
          ];
          authoredCallbacks.current.onAuthoredGestureCommit?.(node.nodeId, { position: next });
        };
        const cancel = (cancelEvent: PointerEvent) => {
          if (cancelEvent.pointerId !== event.pointerId) return;
          authoredBodyGesture.current = null;
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', finish);
          window.removeEventListener('pointercancel', cancel);
          setAuthoredGestureRevision((revision) => revision + 1);
          setGuides({});
          group.setAttribute('transform', baseTransform);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', cancel);
      };
      group.addEventListener('pointerdown', onPointerDown);
      group.addEventListener('keydown', (event) => {
        if (event instanceof KeyboardEvent && (event.key === 'Enter' || event.key === ' ')) select(event);
      });
      groups.push(group);
      svg.append(group);
    }
    return () => groups.forEach((group) => group.remove());
  }, [authoredNodes, authoredNodeIds, artworkPreviewUrls, compId, layers, markup, removedSourceNodeIds]);

  useLayoutEffect(() => {
    const svg = preview.current?.root;
    if (!svg) return;
    svg.querySelectorAll('[data-authoring-mask-boundary]').forEach((element) => element.remove());
    const ns = 'http://www.w3.org/2000/svg';
    for (const node of authoredNodes) {
      if (!node.sourceRef || node.sourceRef.compId !== compId || !authoredNodeIds.includes(node.nodeId) || !node.masks?.length)
        continue;
      const matrix = sourceChecksum ? maskPreviewMatrix(node, sourceChecksum) : null;
      if (!matrix) continue;
      const group = document.createElementNS(ns, 'g');
      group.dataset.authoringMaskBoundary = node.nodeId;
      group.setAttribute('transform', `matrix(${matrix.join(' ')})`);
      group.setAttribute('pointer-events', 'none');
      for (const mask of node.masks) {
        const outline = document.createElementNS(ns, mask.shape === 'ellipse' ? 'ellipse' : 'rect');
        outline.dataset.authoringMaskBoundary = mask.draftMaskId;
        outline.setAttribute('aria-label', `${mask.name} boundary; source pixels are not clipped in preview`);
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', 'var(--warning)');
        outline.setAttribute('stroke-width', '2');
        outline.setAttribute('stroke-dasharray', '6 4');
        outline.setAttribute('vector-effect', 'non-scaling-stroke');
        if (mask.shape === 'ellipse') {
          outline.setAttribute('cx', String(mask.center[0]));
          outline.setAttribute('cy', String(mask.center[1]));
          outline.setAttribute('rx', String(mask.size[0] / 2));
          outline.setAttribute('ry', String(mask.size[1] / 2));
        } else {
          outline.setAttribute('x', String(mask.center[0] - mask.size[0] / 2));
          outline.setAttribute('y', String(mask.center[1] - mask.size[1] / 2));
          outline.setAttribute('width', String(mask.size[0]));
          outline.setAttribute('height', String(mask.size[1]));
        }
        group.append(outline);
      }
      svg.append(group);
    }
  }, [authoredNodes, authoredNodeIds, compId, sourceChecksum, markup]);

  useLayoutEffect(() => {
    const svg = preview.current?.root;
    if (!svg) return;
    svg.querySelectorAll<SVGGElement>('[data-authored-node-id]').forEach((group) => {
      const selected = group.dataset.authoredNodeId === selectedNodeId;
      if (selected) {
        group.setAttribute('stroke', 'var(--primary)');
        group.setAttribute('stroke-width', '1');
      } else {
        group.removeAttribute('stroke');
        group.removeAttribute('stroke-width');
      }
    });
  }, [selectedNodeId]);

  const paintPreview = useCallback(
    (local = shadowRef.current) => {
      if (!preview.current) return;
      preview.current.update({ ...basePreview, current: { ...basePreview.current, ...local } });
    },
    [basePreview],
  );

  useLayoutEffect(() => {
    if (authoredHandle.current || authoredBodyGesture.current) return;
    paintPreview();
    const svg = preview.current?.root;
    if (!svg) return;
    for (const member of authoredNodes) {
      if (!member.sourceRef || member.sourceRef.compId !== compId || !member.position) continue;
      const alreadyRenderedPosition = basePreview.current[member.sourceRef.layerId]?.position ??
        layers.find((candidate) => candidate.compId === compId && candidate.layerId === member.sourceRef?.layerId)?.position;
      if (!alreadyRenderedPosition) continue;
      const sourceLayer = layers.find((candidate) => candidate.compId === compId && candidate.layerId === member.sourceRef?.layerId);
      const renderedEdit = basePreview.current[member.sourceRef.layerId];
      const renderedPose = { position: alreadyRenderedPosition, visible: renderedEdit?.visible ?? sourceLayer?.visible ?? true, opacity: renderedEdit?.opacity ?? sourceLayer?.opacity ?? null,
        rotation: renderedEdit?.rotation ?? sourceLayer?.rotation ?? null, scale: renderedEdit?.scale ?? sourceLayer?.scale ?? null };
      // `current` is the pose already painted into the native SVG (including sampled keyframes).
      // Align to the canonical authored pose only for channels that the preview did not supply;
      // otherwise this correction would immediately cancel the sampled native motion.
      const correctionTarget = {
        ...member,
        position: renderedEdit?.position ?? member.position,
        rotation: renderedEdit?.rotation ?? member.rotation,
        scale: renderedEdit?.scale ?? member.scale,
      };
      const correctionX = correctionTarget.position[0] - alreadyRenderedPosition[0];
      const correctionY = correctionTarget.position[1] - alreadyRenderedPosition[1];
      const poseChanged = (correctionTarget.rotation ?? 0) !== (renderedPose.rotation ?? 0) ||
        (correctionTarget.scale ?? [100, 100]).some((value, index) => value !== (renderedPose.scale ?? [100, 100])[index]);
      const parentTransform = authoredParentTransform(member, authoredNodes);
      const delta = poseChanged ? poseDelta(renderedPose, correctionTarget) : correctionX || correctionY
        ? `translate(${correctionX} ${correctionY})` : '';
      const prefix = [parentTransform, delta].filter(Boolean).join(' ');
      if (!prefix) continue;
      for (const original of svg.querySelectorAll<SVGElement>(`[data-layer-id="${member.sourceRef.layerId}"]`)) {
        if (original.closest('svg') !== svg) continue;
        const transform = original.getAttribute('transform') ?? '';
        original.setAttribute('transform', `${prefix} ${transform}`.trim());
      }
    }
  }, [paintPreview, authoredNodes, compId, layers, basePreview, authoredGestureRevision]);

  useEffect(() => {
    const ids = Object.keys(shadowEdits);
    if (!ids.length) return;
    const synced = ids.every((id) => {
      const local = shadowEdits[Number(id)];
      const committed = edits[Number(id)];
      return Object.entries(local).every(
        ([key, value]) =>
          JSON.stringify(committed?.[key as keyof AuthoringLayerEdit]) === JSON.stringify(value),
      );
    });
    if (synced) {
      shadowRef.current = {};
      setShadowEdits({});
    }
  }, [edits, shadowEdits]);

  const measureSelection = useCallback(() => {
    const svg = canvas.current?.querySelector('svg');
    const host = canvas.current;
    if (!svg || !host) {
      setSelectionBox(null);
      return;
    }
    const authoredRects = selectedAuthoredNode
      ? authoredSelectionElements(selectedAuthoredNode).map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0)
      : [];
    const authoredRect = authoredRects.length
      ? {
          left: Math.min(...authoredRects.map((rect) => rect.left)),
          top: Math.min(...authoredRects.map((rect) => rect.top)),
          right: Math.max(...authoredRects.map((rect) => rect.right)),
          bottom: Math.max(...authoredRects.map((rect) => rect.bottom)),
          width: Math.max(...authoredRects.map((rect) => rect.right)) - Math.min(...authoredRects.map((rect) => rect.left)),
          height: Math.max(...authoredRects.map((rect) => rect.bottom)) - Math.min(...authoredRects.map((rect) => rect.top)),
        }
      : null;
    const bounds = authoredRect && authoredRect.width > 0 && authoredRect.height > 0
      ? authoredRect
      : screenSelectionBounds(svg, currentSelection);
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      setSelectionBox(null);
      return;
    }
    const hostBounds = host.getBoundingClientRect();
    const next = {
      left: bounds.left - hostBounds.left,
      top: bounds.top - hostBounds.top,
      width: bounds.width,
      height: bounds.height,
    };
    setSelectionBox((previous) => previous && previous.left === next.left && previous.top === next.top &&
      previous.width === next.width && previous.height === next.height ? previous : next);
  }, [currentSelection.join(','), selectedAuthoredNode?.nodeId, authoredSelectionElements]);

  useLayoutEffect(() => {
    if (authoredHandle.current || authoredBodyGesture.current) return;
    const svg = preview.current?.root;
    if (!svg) return;
    const canonicalById = new Map(authoredNodes.map((node) => [node.nodeId, node]));
    const displayById = new Map(authoredDisplayNodes.map((node) => [node.nodeId, node]));
    for (const group of svg.querySelectorAll<SVGGElement>('[data-authored-node-id]')) {
      const nodeId = group.dataset.authoredNodeId;
      if (!nodeId) continue;
      const canonical = canonicalById.get(nodeId);
      const display = displayById.get(nodeId);
      if (!canonical || canonical.sourceRef || !display || !authoredNodeIds.includes(nodeId)) continue;

      let visible = display.visible !== false;
      let inheritedOpacity = 1;
      const visited = new Set<string>();
      let parentId = canonical.parentNodeId;
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = canonicalById.get(parentId);
        if (!parent) break;
        const parentSample = authoredRenderSamples.get(parentId);
        if (parent?.kind === 'group' && parentSample) {
          if (parentSample.visible === false) visible = false;
          if (parentSample.opacity != null) inheritedOpacity *= parentSample.opacity / 100;
        }
        parentId = parent.parentNodeId;
      }
      if (visible) group.removeAttribute('display');
      else group.setAttribute('display', 'none');
      group.setAttribute('opacity', String((display.opacity ?? 100) / 100 * inheritedOpacity));

      if (display.kind === 'group') continue;
      const parentTransform = authoredParentTransform(display, authoredDisplayNodes);
      if (canonical.sourceNodeId) {
        const source = canonicalById.get(canonical.sourceNodeId);
        const delta = source?.sourceRef && source.position && display.position
          ? poseDelta(source, display)
          : null;
        const transform = [parentTransform, delta].filter(Boolean).join(' ');
        if (transform) group.setAttribute('transform', transform);
        else group.removeAttribute('transform');
      } else if (display.position) {
        const [x, y] = display.position;
        const [scaleX, scaleY] = display.scale ?? [100, 100];
        group.setAttribute('transform', `${parentTransform} translate(${x} ${y}) rotate(${display.rotation ?? 0}) scale(${scaleX / 100} ${scaleY / 100})`.trim());
      }
    }
    measureSelection();
  }, [authoredNodes, authoredNodeIds, authoredDisplayNodes, authoredRenderSamples, measureSelection, authoredGestureRevision]);

  useLayoutEffect(() => {
    const readView = (): CanvasViewMeasurement | null => {
      const host = canvas.current;
      const matrix = host?.querySelector('svg')?.getScreenCTM();
      if (!host || !matrix || !host.clientWidth || !host.clientHeight) return null;
      const rect = host.getBoundingClientRect();
      return { width: host.clientWidth, height: host.clientHeight, matrix: {
        a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d,
        e: matrix.e - rect.left, f: matrix.f - rect.top,
      } };
    };
    cameraMeasurement.current = readView();
    measureSelection();
    const observer = new ResizeObserver(() => {
      const before = cameraMeasurement.current;
      const after = readView();
      cameraMeasurement.current = after;
      if (before && after && (before.width !== after.width || before.height !== after.height) &&
          !active.current && !authoredHandle.current) {
        const next = retainCanvasViewOnResize({ zoom, pan }, before, after);
        if (next) { setZoom(next.zoom); setPan(next.pan); }
      }
      measureSelection();
    });
    if (canvas.current) observer.observe(canvas.current);
    const svg = canvas.current?.querySelector('svg');
    if (svg) observer.observe(svg);
    return () => observer.disconnect();
  }, [markup, previewEdits, shadowEdits, zoom, pan, measureSelection]);

  const framesForGesture = (ids: readonly number[]) => frameForIds(ids);
  const snapTargets = useCallback((ids: readonly number[]) => {
    const svg = canvas.current?.querySelector('svg');
    if (!svg) return [];
    const selected = new Set(ids);
    const boxes = layers
      .filter((entry) => entry.compId === compId && !selected.has(entry.layerId))
      .map((entry) => svgLayerBounds(svg, entry.layerId))
      .filter((box): box is CanvasRect => !!box);
    const canvasBounds = viewBoxBounds(svg);
    if (canvasBounds) boxes.push(canvasBounds);
    return boxes;
  }, [layers, compId]);


  const updateShadow = (batch: readonly AuthoringLayerEdit[]) => {
    const next = { ...shadowRef.current };
    for (const change of batch) next[change.layerId] = { ...next[change.layerId], ...change };
    shadowRef.current = next;
    setShadowEdits(next);
    paintPreview(next);
  };

  const publishGesture = (
    batch: readonly AuthoringLayerEdit[],
    ids: readonly number[],
    group: string,
  ) => {
    if (!batch.length) return;
    updateShadow(batch);
    if (onGestureCommit) {
      onGestureCommit({ edits: batch, selectionIds: [...ids], group });
      return;
    }
    // Compatibility for callers that have not adopted the batch seam yet. The editor caller uses
    // onGestureCommit so a multi-layer gesture becomes one history snapshot and draft command.
    batch.forEach((change, index) => {
      const target = layers.find(
        (entry) => entry.compId === change.compId && entry.layerId === change.layerId,
      );
      if (!target) return;
      const { compId: _compId, layerId: _layerId, ...fields } = change;
      onEdit(target, fields, group, index === batch.length - 1);
    });
  };

  const updateGesture = (
    gesture: TransformGesture,
    clientX: number,
    clientY: number,
    keepAspect = false,
  ) => {
    gesture.lastClient = { x: clientX, y: clientY };
    if (
      !gesture.moved &&
      Math.hypot(clientX - gesture.startClient.x, clientY - gesture.startClient.y) < 2
    )
      return [];
    gesture.moved = true;
    const point = pointFromClient(gesture.inverse, clientX, clientY);
    let next: AuthoringLayerEdit[] = [];
    if (gesture.kind === 'move') {
      const delta = snapTranslation(
        gesture.bounds,
        point.x - gesture.start.x,
        point.y - gesture.start.y,
        gesture.targets,
        gesture.tolerance,
      );
      setGuides(delta.guides);
      next = moveFrames(gesture.frames, delta.dx, delta.dy);
    } else if (gesture.kind === 'resize' && gesture.handle) {
      const snapped = snapPoint(point, gesture.targets, gesture.tolerance);
      setGuides(snapped.guides);
      next = resizeFrames(
        gesture.frames,
        gesture.bounds,
        gesture.handle,
        snapped.point,
        keepAspect,
      );
    } else if (gesture.kind === 'rotate') {
      setGuides({});
      const radians = Math.atan2(point.y - gesture.pivot.y, point.x - gesture.pivot.x);
      const delta = normalizeAngle(((radians - gesture.startAngle) * 180) / Math.PI);
      next = rotateFrames(gesture.frames, gesture.pivot, delta, keepAspect ? 15 : 0);
    }
    if (next.length) updateShadow(next);
    return next;
  };

  const cancelScheduled = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  const beginTransform = (
    event: React.PointerEvent,
    kind: TransformGesture['kind'],
    ids: readonly number[],
    handle?: ResizeHandle,
  ) => {
    const svg = canvas.current?.querySelector('svg');
    const screenMatrix = svg?.getScreenCTM();
    const frames = framesForGesture(ids);
    const bounds = unionBounds(frames.map((entry) => entry.bounds));
    if (
      !svg ||
      !screenMatrix ||
      !bounds ||
      frames.length !== ids.length ||
      !canvasGestureAllowed(frames, kind)
    )
      return false;
    const inverse = screenMatrix.inverse();
    const start = pointFromClient(inverse, event.clientX, event.clientY);
    const pivot = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    active.current = {
      kind,
      pointerId: event.pointerId,
      inverse,
      start,
      startClient: { x: event.clientX, y: event.clientY },
      lastClient: { x: event.clientX, y: event.clientY },
      frames,
      bounds,
      targets: snapTargets(ids),
      tolerance: canvasSnapTolerance(inverse, event),
      selectionIds: [...ids],
      handle,
      pivot,
      startAngle: Math.atan2(start.y - pivot.y, start.x - pivot.x),
      moved: false,
    };
    canvas.current?.focus({ preventScroll: true });
    canvas.current?.setPointerCapture(event.pointerId);
    return true;
  };

  const beginAuthoredHandle = (
    event: React.PointerEvent,
    kind: 'move' | 'resize' | 'rotate',
    handle?: ResizeHandle,
  ) => {
    const node = selectedAuthoredNode;
    const svg = canvas.current?.querySelector('svg');
    const screenMatrix = svg?.getScreenCTM();
    const elements = node ? authoredSelectionElements(node) : [];
    if (!node?.capabilities.transform || node.sourceRef || !node.position || !svg || !screenMatrix || !elements.length ||
      generatedGroupHasKeyframes(node)) return false;
    if (kind === 'move' && node.transformLocks.position) return false;
    if (kind === 'resize' && (node.transformLocks.scale || node.rotation !== 0)) return false;
    if (kind === 'rotate' && node.transformLocks.rotation) return false;
    const inverse = screenMatrix.inverse();
    const start = pointFromClient(inverse, event.clientX, event.clientY);
    const bounds = unionBounds(elements.flatMap((element) => {
      const measured = renderedElementBounds(svg, element);
      return measured ? [measured] : [];
    }));
    if (!bounds) return false;
    const [scaleX, scaleY] = node.scale ?? [100, 100];
    const rotation = node.rotation ?? 0;
    const [positionX, positionY] = node.position;
    const gesture: AuthoredHandleGesture = {
      pointerId: event.pointerId, node, kind, handle, inverse, start,
      pivot: { x: positionX, y: positionY },
      startAngle: Math.atan2(start.y - positionY, start.x - positionX),
      startPosition: [positionX, positionY], startScale: [scaleX, scaleY], startRotation: rotation,
      targets: authoredNodeSnapTargets(svg, layers, compId, authoredNodes, authoredNodeIds, node),
      tolerance: canvasSnapTolerance(inverse, event), edit: {}, bounds,
      elements: elements.map((element) => ({ element, transform: element.getAttribute('transform') })),
    };
    authoredHandle.current = gesture;
    setGuides({});
    canvas.current?.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
    canvas.current?.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const updateAuthoredHandle = (gesture: AuthoredHandleGesture, clientX: number, clientY: number) => {
    const point = pointFromClient(gesture.inverse, clientX, clientY);
    const [positionX, positionY] = gesture.startPosition;
    let position: [number, number] = [positionX, positionY];
    let scale: [number, number] = [...gesture.startScale];
    let rotation = gesture.startRotation;
    if (gesture.kind === 'move') {
      const delta = snapTranslation(gesture.bounds, point.x - gesture.start.x, point.y - gesture.start.y,
        gesture.targets, gesture.tolerance);
      setGuides(delta.guides);
      position = [positionX + delta.dx, positionY + delta.dy];
      const { dx, dy } = delta;
      gesture.edit = { position };
      for (const { element, transform } of gesture.elements)
        element.setAttribute('transform', `translate(${dx} ${dy}) ${transform ?? ''}`.trim());
      return;
    }
    if (gesture.kind === 'rotate') {
      const radians = Math.atan2(point.y - gesture.pivot.y, point.x - gesture.pivot.x);
      rotation = normalizeAngle(gesture.startRotation + ((radians - gesture.startAngle) * 180) / Math.PI);
    } else {
      const bounds = gesture.bounds;
      if (!gesture.handle) return;
      const handle = gesture.handle;
      if (handle.includes('e') || handle.includes('w')) {
        const anchor = handle.includes('w') ? bounds.right : bounds.left;
        const startSize = Math.max(1, bounds.right - bounds.left);
        const nextSize = Math.max(1, Math.abs(point.x - anchor));
        scale[0] = gesture.startScale[0] * nextSize / startSize;
        position[0] += (point.x + anchor) / 2 - (bounds.left + bounds.right) / 2;
      }
      if (handle.includes('n') || handle.includes('s')) {
        const anchor = handle.includes('n') ? bounds.bottom : bounds.top;
        const startSize = Math.max(1, bounds.bottom - bounds.top);
        const nextSize = Math.max(1, Math.abs(point.y - anchor));
        scale[1] = gesture.startScale[1] * nextSize / startSize;
        position[1] += (point.y + anchor) / 2 - (bounds.top + bounds.bottom) / 2;
      }
    }
    gesture.edit = { position, scale, rotation };
    if (gesture.node.kind === 'group') {
      const delta = poseDelta(gesture.node, { ...gesture.node, position, scale, rotation });
      for (const { element, transform } of gesture.elements)
        element.setAttribute('transform', [delta, transform].filter(Boolean).join(' '));
    } else {
      gesture.elements[0]?.element.setAttribute('transform', `translate(${position[0]} ${position[1]}) rotate(${rotation}) scale(${scale[0] / 100} ${scale[1] / 100})`);
    }
  };

  const finishPointer = (event: React.PointerEvent, cancelled: boolean) => {
    const authored = authoredHandle.current;
    if (authored && event.pointerId === authored.pointerId) {
      authoredHandle.current = null;
      for (const { element, transform } of authored.elements)
        transform === null ? element.removeAttribute('transform') : element.setAttribute('transform', transform);
      if (!cancelled && Object.keys(authored.edit).length) {
        onAuthoredGestureCommit?.(authored.node.nodeId, authored.edit);
      } else if (authored.node.kind !== 'group') {
        const [x, y] = authored.startPosition;
        const [sx, sy] = authored.startScale;
        authored.elements[0]?.element.setAttribute('transform', `translate(${x} ${y}) rotate(${authored.startRotation}) scale(${sx / 100} ${sy / 100})`);
      }
      setGuides({});
      setAuthoredGestureRevision((revision) => revision + 1);
      return;
    }
    const gesture = active.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    cancelScheduled();
    if (gesture.kind === 'pan') {
      if (!cancelled)
        setPan({
          x: gesture.initialPan.x + event.clientX - gesture.startClient.x,
          y: gesture.initialPan.y + event.clientY - gesture.startClient.y,
        });
    } else if (cancelled) {
      shadowRef.current = {};
      setShadowEdits({});
      paintPreview({});
    } else {
      const batch = updateGesture(gesture, event.clientX, event.clientY, event.shiftKey);
      if (gesture.moved && batch.length)
        publishGesture(batch, gesture.selectionIds, `canvas:${gesture.kind}:${++sequence.current}`);
      else if (gesture.selectionIds.length === 1) setOpen(true);
    }
    active.current = null;
    setGuides({});
    if (canvas.current?.hasPointerCapture(event.pointerId))
      canvas.current.releasePointerCapture(event.pointerId);
  };

  const chooseSelection = (target: AuthoringEditableLayer, additive: boolean) => {
    const next = toggleSelection(selectionRef.current, target.layerId, additive);
    updateSelection(next);
    const focus = next.includes(target.layerId) ? target.layerId : next[0];
    if (focus !== undefined) onSelect(focus);
    return next;
  };

  const alignSelection = (alignment: CanvasAlignment) => {
    const ids = normalizeSelection(selectionRef.current, layers, compId);
    const frames = framesForGesture(ids);
    const batch = alignFrames(frames, alignment);
    if (batch.length) publishGesture(batch, ids, `canvas:align:${++sequence.current}`);
  };

  const zoomAt = (nextZoom: number, clientX?: number, clientY?: number) => {
    const updated = clampZoom(nextZoom);
    if (clientX !== undefined && clientY !== undefined && canvas.current) {
      const rect = canvas.current.getBoundingClientRect();
      const point = { x: clientX - rect.left, y: clientY - rect.top };
      const ratio = updated / zoom;
      setPan({ x: point.x - (point.x - pan.x) * ratio, y: point.y - (point.y - pan.y) * ratio });
    }
    setZoom(updated);
  };

  const frameSelection = () => {
    const host = canvas.current;
    if (!host || !selectionBox) return;
    const next = frameCanvasSelection({ zoom, pan }, {
      left: selectionBox.left, top: selectionBox.top,
      right: selectionBox.left + selectionBox.width, bottom: selectionBox.top + selectionBox.height,
    }, { width: host.clientWidth, height: host.clientHeight }, ZOOM_MAX);
    if (next) { setZoom(next.zoom); setPan(next.pan); }
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (disabled || active.current) return;
    if (event.button === 1 || spaceDown.current) {
      event.preventDefault();
      active.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        startClient: { x: event.clientX, y: event.clientY },
        initialPan: pan,
      };
      canvas.current?.focus({ preventScroll: true });
      canvas.current?.setPointerCapture(event.pointerId);
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const handle = target?.closest<HTMLElement>('[data-canvas-handle]')?.dataset.canvasHandle;
    if (handle === 'rotate') {
      event.preventDefault();
      if (selectedAuthoredNode) {
        if (!beginAuthoredHandle(event, 'rotate')) setOpen(true);
        return;
      }
      if (!beginTransform(event, 'rotate', currentSelection)) setOpen(true);
      return;
    }
    if (handle === 'move') {
      event.preventDefault();
      if (selectedAuthoredNode?.kind === 'group') beginAuthoredHandle(event, 'move');
      return;
    }
    if (handle && RESIZE_HANDLES.includes(handle as ResizeHandle)) {
      event.preventDefault();
      const resizeHandle = handle as ResizeHandle;
      const hostBounds = canvas.current?.getBoundingClientRect();
      const handleBounds = target?.closest<HTMLElement>('[data-canvas-handle]')?.getBoundingClientRect();
      if (event.button === 0 && selectionBox && hostBounds && !pointerIsOnRenderedResizeEdge(
        resizeHandle,
        selectionBox,
        { x: event.clientX - hostBounds.left, y: event.clientY - hostBounds.top },
        handleBounds?.width ?? 0,
        handleBounds?.height ?? 0,
      )) {
        if (selectedAuthoredNode) {
          if (!beginAuthoredHandle(event, 'move')) setOpen(true);
        } else if (!beginTransform(event, 'move', currentSelection)) {
          setOpen(true);
        }
        return;
      }
      if (selectedAuthoredNode) {
        if (!beginAuthoredHandle(event, 'resize', resizeHandle)) setOpen(true);
        return;
      }
      if (!beginTransform(event, 'resize', currentSelection, resizeHandle)) setOpen(true);
      return;
    }
    if (event.button !== 0) return;
    if (target?.closest('button')) return;
    const selected = target ? previewTarget(target, layers, compId) : null;
    if (!selected) {
      setOpen(false);
      return;
    }
    event.preventDefault();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const wasSelected = selectionRef.current.includes(selected.layerId);
    const nextIds = chooseSelection(selected, additive);
    setOpen(false);
    if (additive && wasSelected) return;
    const gestureIds = wasSelected ? nextIds : nextIds;
    if (!beginTransform(event, 'move', gestureIds)) setOpen(true);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const authored = authoredHandle.current;
    if (authored && event.pointerId === authored.pointerId) {
      updateAuthoredHandle(authored, event.clientX, event.clientY);
      return;
    }
    const gesture = active.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (gesture.kind === 'pan') {
      setPan({
        x: gesture.initialPan.x + event.clientX - gesture.startClient.x,
        y: gesture.initialPan.y + event.clientY - gesture.startClient.y,
      });
      return;
    }
    pendingPoint.current = { x: event.clientX, y: event.clientY };
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const current = active.current;
        const point = pendingPoint.current;
        if (current && current.kind !== 'pan' && point)
          updateGesture(current, point.x, point.y, false);
      });
  };

  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    zoomAt(zoom * Math.exp(-event.deltaY * 0.001), event.clientX, event.clientY);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const singleSelected = !!selectedNodeId && (selectedAuthoredNode ? 1 : currentSelection.length) === 1;
    if (!disabled && singleSelected && !event.repeat && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && onDuplicateNode) {
      event.preventDefault();
      event.stopPropagation();
      onDuplicateNode();
    } else if (!disabled && singleSelected && !event.repeat && !event.ctrlKey && !event.metaKey &&
      (event.key === 'Delete' || event.key === 'Backspace') && onDeleteNode) {
      event.preventDefault();
      onDeleteNode();
    } else if (event.key === ' ') {
      spaceDown.current = true;
      event.preventDefault();
    } else if (event.key === 'Escape') {
      if (active.current && active.current.kind !== 'pan') {
        const gesture = active.current;
        active.current = null;
        cancelScheduled();
        shadowRef.current = {};
        setShadowEdits({});
        paintPreview({});
        if (canvas.current?.hasPointerCapture(gesture.pointerId))
          canvas.current.releasePointerCapture(gesture.pointerId);
      }
      setOpen(false);
    } else if (event.key === 'Enter' && currentSelection.length === 1) {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomAt(zoom * 1.2);
    } else if (event.key === '-') {
      event.preventDefault();
      zoomAt(zoom / 1.2);
    } else if (event.key === '@' || (event.shiftKey && event.key === '2')) {
      event.preventDefault();
      frameSelection();
    } else if (event.key === '0') {
      event.preventDefault();
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else if (selectedAuthoredNode?.position && selectedAuthoredNode.capabilities.transform &&
      !selectedAuthoredNode.transformLocks.position &&
      !generatedGroupHasKeyframes(selectedAuthoredNode) &&
      !event.metaKey && !event.ctrlKey && !event.altKey) {
      const direction: Record<string, CanvasPoint> = {
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
      };
      const delta = direction[event.key];
      if (!delta) return;
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      onAuthoredGestureCommit?.(selectedAuthoredNode.nodeId, {
        position: [selectedAuthoredNode.position[0] + delta.x * step, selectedAuthoredNode.position[1] + delta.y * step],
      });
    } else if (currentSelection.length && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const direction: Record<string, CanvasPoint> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const delta = direction[event.key];
      if (!delta) return;
      event.preventDefault();
      const ids = currentSelection;
      const frames = framesForGesture(ids);
      if (frames.length !== ids.length || !canvasGestureAllowed(frames, 'move')) return;
      const step = event.shiftKey ? 10 : 1;
      const batch = moveFrames(frames, delta.x * step, delta.y * step);
      publishGesture(batch, ids, `canvas:nudge:${++sequence.current}`);
    }
  };

  const onKeyUp = (event: React.KeyboardEvent) => {
    if (event.key === ' ') spaceDown.current = false;
  };

  const liveCount = currentSelection.length || (selectedAuthoredNode ? 1 : 0);
  const displayedLayer = liveCount === 1 ? layer : undefined;
  const hasMarks = !!selectionBox;
  const translated = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;

  return (
    <Popover open={open && !!displayedLayer} onOpenChange={setOpen}>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              ref={canvas}
              role="application"
              aria-roledescription="template canvas"
              aria-label="Interactive template preview"
              aria-describedby="template-preview-help"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas provides layer selection, transform handles, and zoom/pan shortcuts.
              tabIndex={0}
              className={`relative size-full touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring ${active.current?.kind === 'pan' ? 'cursor-grabbing' : 'cursor-default'}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(event) => finishPointer(event, false)}
              onPointerCancel={(event) => finishPointer(event, true)}
              onLostPointerCapture={(event) => {
                if (active.current?.pointerId === event.pointerId)
                  finishPointer(event as unknown as React.PointerEvent, true);
              }}
              onContextMenu={(event) => {
                const target =
                  event.target instanceof Element
                    ? previewTarget(event.target, layers, compId)
                    : null;
                if (target && !selectionRef.current.includes(target.layerId)) {
                  updateSelection([target.layerId]);
                  onSelect(target.layerId);
                }
              }}
              onWheel={onWheel}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              onBlur={() => {
                spaceDown.current = false;
              }}
            >
              <div
                ref={content}
                role="img"
                aria-label="Layout preview of the template with these edits"
                className="size-full select-none"
                style={{ transform: translated, transformOrigin: '0 0' }}
              />
              <PopoverAnchor
                ref={outline}
                aria-hidden
                hidden={!hasMarks}
                className="pointer-events-none absolute border border-primary"
                style={
                  selectionBox
                    ? {
                        left: selectionBox.left,
                        top: selectionBox.top,
                        width: selectionBox.width,
                        height: selectionBox.height,
                      }
                    : undefined
                }
              />
              {selectionBox && liveCount > 0 ? (
                <div
                  aria-hidden="false"
                  className="pointer-events-none absolute"
                  style={{
                    left: selectionBox.left,
                    top: selectionBox.top,
                    width: selectionBox.width,
                    height: selectionBox.height,
                  }}
                  data-testid="canvas-selection-frame"
                >
                  <div aria-hidden className="absolute inset-0 border border-primary/80" />
                  {moveAuthoredGroupAllowed ? (
                    <button
                      type="button"
                      data-canvas-handle="move"
                      aria-label="Move selected group"
                      className="pointer-events-auto absolute left-1/2 -top-2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  ) : null}
                  {resizeAllowed
                    ? RESIZE_HANDLES.map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          data-canvas-handle={handle}
                          aria-label={`Resize selected ${liveCount === 1 ? 'layer' : 'layers'} from ${handle}`}
                          className="pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={HANDLE_POSITIONS[handle]}
                        />
                      ))
                    : null}
                  {rotateAllowed ? (
                    <>
                      <span
                        aria-hidden
                        className="absolute left-1/2 -top-5 h-5 -translate-x-1/2 border-l border-primary"
                      />
                      <button
                        type="button"
                        data-canvas-handle="rotate"
                        aria-label={`Rotate selected ${liveCount === 1 ? 'layer' : 'layers'}`}
                        className="pointer-events-auto absolute left-1/2 -top-5 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
              {guides.x !== undefined || guides.y !== undefined ? (
                <SnapGuides
                  svg={canvas.current?.querySelector('svg') ?? null}
                  canvas={canvas.current}
                  guides={guides}
                />
              ) : null}
              <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 text-muted-foreground">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Zoom out"
                  onClick={() => zoomAt(zoom / 1.2)}
                >
                  <Minus aria-hidden />
                </Button>
                <span
                  className="min-w-9 text-center font-mono text-2xs tabular-nums"
                  aria-live="polite"
                >
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Zoom in"
                  onClick={() => zoomAt(zoom * 1.2)}
                >
                  <Plus aria-hidden />
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label="Frame selected layers" title="Frame selection (Shift+2)" disabled={!selectionBox} onClick={frameSelection}>
                  <Scan aria-hidden />
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label="Reset canvas view"
                  title="Fit artboard (0)"
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  <RotateCcw aria-hidden />
                </Button>
              </div>
              {displayedLayer && !selectionBox ? (
                <p className="pointer-events-none absolute inset-x-3 bottom-3 bg-background/90 px-2 py-1 text-2xs text-muted-foreground">
                  {displayedLayer.name}:{' '}
                  {(edit?.visible ?? displayedLayer.visible)
                    ? 'no visible marks in this preview. Use the layer controls.'
                    : 'hidden in this composition.'}
                </p>
              ) : null}
              <span className="sr-only" aria-live="polite">
                {liveCount
                  ? `${liveCount} layer${liveCount === 1 ? '' : 's'} selected.`
                  : 'No layers selected.'}{' '}
                Hold Shift while selecting to add or remove layers. Hold Space and drag to pan. Use
                plus/minus or the wheel to zoom.
              </span>
            </div>
          }
        />
        <ContextMenuContent className="min-w-48">
          <ContextMenuLabel>Canvas</ContextMenuLabel>
          {displayedLayer ? (
            <ContextMenuItem onSelect={() => setOpen(true)}>Layer controls</ContextMenuItem>
          ) : null}
          {selectedNodeId && onDuplicateNode ? (
            <ContextMenuItem disabled={disabled} onSelect={onDuplicateNode}>Duplicate selected layer</ContextMenuItem>
          ) : null}
          {selectedNodeId && onDeleteNode ? (
            <ContextMenuItem disabled={disabled} onSelect={onDeleteNode}>Delete selected layer</ContextMenuItem>
          ) : null}
          <ContextMenuItem
            disabled={
              disabled ||
              !layers.some(
                (entry) =>
                  entry.compId === compId &&
                  entry.position &&
                  !entry.parentId &&
                  !entry.transformLocks.position,
              )
            }
            onSelect={() => {
              const ids = layers
                .filter(
                  (entry) =>
                    entry.compId === compId &&
                    entry.position &&
                    !entry.parentId &&
                    !entry.transformLocks.position,
                )
                .map((entry) => entry.layerId);
              updateSelection(ids);
              if (ids[0] !== undefined) onSelect(ids[0]);
            }}
          >
            Select editable layers
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuLabel>Align selected</ContextMenuLabel>
          {(
            [
              ['left', 'Align left'],
              ['center-x', 'Align horizontal center'],
              ['right', 'Align right'],
              ['top', 'Align top'],
              ['center-y', 'Align vertical center'],
              ['bottom', 'Align bottom'],
            ] as [CanvasAlignment, string][]
          ).map(([alignment, label]) => (
            <ContextMenuItem
              key={alignment}
              disabled={disabled || !multiAlignAllowed}
              onSelect={() => alignSelection(alignment)}
            >
              {label}
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      <PopoverContent
        aria-label="Layer controls"
        side="right"
        align="start"
        collisionPadding={12}
        initialFocus={false}
        finalFocus={canvas}
        className="max-h-[70dvh] w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto p-3"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-xs font-medium">Layer controls</span>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Close layer controls"
            onClick={() => setOpen(false)}
          >
            <X aria-hidden />
          </Button>
        </div>
        {displayedLayer ? (
          <TemplateLayerInspector
            layer={displayedLayer}
            edit={edit}
            fonts={fonts}
            disabled={disabled}
            idPrefix="preview"
            onEdit={(change, group) => onEdit(displayedLayer, change, group)}
            onEditCommit={(group) => onEdit(displayedLayer, {}, group, true)}
          />
        ) : null}
        {displayedLayer?.parentId ? (
          <p className="mt-3 text-2xs text-muted-foreground">
            Move this layer with X and Y in its parent’s coordinates.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function SnapGuides({
  svg,
  canvas,
  guides,
}: {
  svg: SVGSVGElement | null;
  canvas: HTMLDivElement | null;
  guides: CanvasGuides;
}) {
  const [lines, setLines] = useState<{ x?: number; y?: number }>({});
  useLayoutEffect(() => {
    const matrix = svg?.getScreenCTM();
    if (!matrix || !canvas) {
      setLines({});
      return;
    }
    const host = canvas.getBoundingClientRect();
    const next: { x?: number; y?: number } = {};
    if (guides.x !== undefined) next.x = applyMatrix(matrix, guides.x, 0).x - host.left;
    if (guides.y !== undefined) next.y = applyMatrix(matrix, 0, guides.y).y - host.top;
    setLines(next);
  }, [svg, canvas, guides]);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {lines.x !== undefined ? (
        <span
          className="absolute inset-y-0 border-l border-dashed border-primary"
          style={{ left: lines.x }}
        />
      ) : null}
      {lines.y !== undefined ? (
        <span
          className="absolute inset-x-0 border-t border-dashed border-primary"
          style={{ top: lines.y }}
        />
      ) : null}
    </div>
  );
}
