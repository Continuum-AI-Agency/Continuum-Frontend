// The forge's layout preview, made safe to inline and editable before the forge answers.
//
// Inlined rather than shown as an <img>, so a layer's marks can move the moment a field changes;
// the composed preview that follows replaces this guess. Inlining gives up the image sandbox, so
// the SVG is REBUILT from an allowlist of the elements and attributes the forge draws with —
// layer names and text inside it are user content.
//
// The guess only covers what AE's own transform math makes exact for a top-level 2D layer: a move,
// turn or scale about its anchor, opacity, hiding, and its place in the stack. Everything drawn
// inside it (a precomp's flattened children, layers parented to it) moves with it. A parented
// layer's own values are in its parent's space, so it waits for the forge.

import type { TemplateEditableLayer, TemplateLayerEdit } from '@continuum/contracts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ELEMENTS = new Set([
  'svg',
  'title',
  'defs',
  'pattern',
  'rect',
  'g',
  'polygon',
  'path',
  'circle',
  'text',
]);
const ATTRIBUTES = new Set([
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'cx',
  'cy',
  'r',
  'd',
  'points',
  'id',
  'role',
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linejoin',
  'opacity',
  'paint-order',
  'font-size',
  'font-family',
  'text-anchor',
  'transform',
  'patternUnits',
  'patternTransform',
  'data-layer-id',
  'data-in',
]);
/** Only same-document references: no script, data or remote URLs in any value. */
const safeValue = (value: string) => !/javascript:|data:|url\((?!\s*#)/i.test(value);

/** The SVG rebuilt from the allowlist, or null when the string is not an SVG at all. */
export function safeSvg(svg: string): SVGSVGElement | null {
  const Parser = typeof window === 'undefined' ? undefined : window.DOMParser;
  if (!Parser) return null;
  const source = new Parser().parseFromString(svg, 'image/svg+xml').documentElement;
  if (source.localName !== 'svg') return null;
  const copy = (node: Element): Element | null => {
    if (!ELEMENTS.has(node.localName)) return null;
    const element = document.createElementNS(SVG_NS, node.localName);
    for (const attribute of Array.from(node.attributes))
      if (ATTRIBUTES.has(attribute.name) && safeValue(attribute.value))
        element.setAttribute(attribute.name, attribute.value);
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3)
        element.appendChild(document.createTextNode(child.textContent ?? ''));
      else if (child.nodeType === 1) {
        const kept = copy(child as Element);
        if (kept) element.appendChild(kept);
      }
    }
    return element;
  };
  return copy(source) as SVGSVGElement | null;
}

/** A layer's static pose; `x`/`y` are its AE Position. */
export type Pose = {
  x: number | null;
  y: number | null;
  rotation: number | null;
  scale: [number, number] | null;
  opacity: number | null;
  visible: boolean;
};

const poseOf = (layer: TemplateEditableLayer, edit?: TemplateLayerEdit): Pose => ({
  x: edit?.x ?? layer.x ?? null,
  y: edit?.y ?? layer.y ?? null,
  rotation: edit?.rotation ?? layer.rotation ?? null,
  scale: edit?.scale ?? layer.scale ?? null,
  opacity: edit?.opacity ?? layer.opacity ?? null,
  visible: edit?.visible ?? layer.visible,
});

/**
 * The comp-space move from one static pose to another. AE places a layer by
 * position · rotation · scale · (−anchor), so the anchor cancels:
 * new · old⁻¹ = T(p₁) R(r₁) S(s₁/s₀) R(−r₀) T(−p₀). Null when nothing moved or it cannot be known.
 */
export function poseDelta(from: Pose, to: Pose): string | null {
  if (from.x === null || from.y === null || to.x === null || to.y === null) return null;
  const [px, py] = [from.x, from.y];
  const [qx, qy] = [to.x, to.y];
  const r0 = from.rotation ?? 0;
  const r1 = to.rotation ?? 0;
  const [ax, ay] = from.scale ?? [100, 100];
  const [bx, by] = to.scale ?? [100, 100];
  if (!ax || !ay) return null;
  if (px === qx && py === qy && r0 === r1 && ax === bx && ay === by) return null;
  return `translate(${qx} ${qy}) rotate(${r1}) scale(${bx / ax} ${by / ay}) rotate(${-r0}) translate(${-px} ${-py})`;
}

export type PreviewEdits = {
  /** The scene's comp. */
  compId: number;
  layers: readonly TemplateEditableLayer[];
  /** The edits the SVG was composed with, and the ones on screen now. */
  rendered: Record<number, TemplateLayerEdit>;
  current: Record<number, TemplateLayerEdit>;
  /** The scene comp's stack, front first: as composed, and as it stands now. */
  renderedOrder: readonly number[];
  order: readonly number[];
};

/** The preview's markup with the edits made since it was composed applied, ready to inline. */
export function previewMarkup(svg: string, edits: PreviewEdits): string {
  const root = safeSvg(svg);
  if (!root) return '';
  root.setAttribute('width', '100%');
  root.setAttribute('height', '100%');
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const groups = Array.from(root.querySelectorAll('g[data-layer-id]'));
  const drawn = new Map<number, Element[]>();
  for (const group of groups) {
    const id = Number(group.getAttribute('data-layer-id'));
    drawn.set(id, [...(drawn.get(id) ?? []), group]);
  }
  const inside = new Map<number, number[]>();
  const parented = new Map<number, number[]>();
  const add = (map: Map<number, number[]>, key: number, id: number) =>
    map.set(key, [...(map.get(key) ?? []), id]);
  for (const group of groups) {
    const holder = group.getAttribute('data-in');
    if (holder) add(inside, Number(holder), Number(group.getAttribute('data-layer-id')));
  }
  for (const layer of edits.layers)
    if (layer.parentId) add(parented, layer.parentId, layer.layerId);
  /** A layer and everything drawn with it: its precomp's children, and (optionally) its children by parenting. */
  const family = (id: number, withParented: boolean) => {
    const seen = new Set<number>();
    const stack = [id];
    while (stack.length) {
      const next = stack.pop() as number;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(inside.get(next) ?? []), ...(withParented ? (parented.get(next) ?? []) : []));
    }
    return [...seen].flatMap((member) => drawn.get(member) ?? []);
  };

  for (const layer of edits.layers) {
    if (layer.compId !== edits.compId) continue;
    const from = poseOf(layer, edits.rendered[layer.layerId]);
    const to = poseOf(layer, edits.current[layer.layerId]);
    // Parenting carries the transform only; opacity and visibility stay with the layer and what
    // its precomp draws.
    const moved = family(layer.layerId, true);
    const own = family(layer.layerId, false);
    if (!own.length) continue;
    if (from.visible && !to.visible) {
      for (const group of own) group.setAttribute('display', 'none');
      continue;
    }
    // A parented layer's values are in its parent's space: its move waits for the forge.
    const move = layer.parentId ? null : poseDelta(from, to);
    if (move)
      for (const group of moved) {
        const prior = group.getAttribute('transform');
        group.setAttribute('transform', prior ? `${move} ${prior}` : move);
      }
    if (from.opacity && to.opacity !== null && to.opacity !== from.opacity) {
      const factor = to.opacity / from.opacity;
      for (const group of own) {
        const prior = Number(group.getAttribute('opacity') ?? 1);
        group.setAttribute('opacity', String(Math.max(0, Math.min(1, prior * factor))));
      }
    }
  }

  if (edits.order.join() !== edits.renderedOrder.join())
    restack(edits.order, (id) => family(id, false));
  return root.outerHTML;
}

/** Repaint the stack's runs (a layer plus its precomp's children) bottom first, where they stood. */
function restack(order: readonly number[], runOf: (id: number) => Element[]) {
  const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING
  const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & FOLLOWING ? -1 : 1);
  const runs = order.map((id) => runOf(id).sort(before)).filter((run) => run.length);
  const nodes = runs.flat().sort(before);
  const first = nodes[0];
  if (!first?.parentNode) return;
  const parent = first.parentNode;
  const marker = document.createComment('');
  parent.insertBefore(marker, first);
  for (const node of nodes) node.remove();
  for (const run of [...runs].reverse()) for (const node of run) parent.insertBefore(node, marker);
  marker.remove();
}
