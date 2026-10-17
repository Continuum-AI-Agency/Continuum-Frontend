import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { TemplateAuthoringNode, TemplateEditableLayer } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { previewTarget, TemplateLayerPreview } from './AuthoringTemplateLayerPreview';

const layer: TemplateEditableLayer = {
  compId: 1,
  comp: 'Main',
  layerId: 1,
  name: 'Artwork',
  kind: 'artwork',
  visible: true,
  visibilityReason: null,
  textReason: null,
  text: null,
  font: null,
  fontSize: null,
  slotKeys: [],
  visibilitySlotKeys: [],
  index: 0,
  position: [100, 200],
  rotation: 0,
  scale: [100, 100],
  opacity: 100,
  transformLocks: {},
  parentName: null,
  parentId: null,
};
const markup =
  '<svg viewBox="0 0 400 300"><g data-layer-id="1"><rect width="30" height="40"/></g><g data-layer-id="2" data-in="1"><path d="M0 0h10"/></g></svg>';
let restoreAuthoredBounds: (() => void) | null = null;
afterEach(() => {
  cleanup();
  restoreAuthoredBounds?.();
  restoreAuthoredBounds = null;
});

const installAuthoredElementBounds = (bounds = { left: 100, top: 200, right: 140, bottom: 240 }) => {
  const original = SVGElement.prototype.getBoundingClientRect;
  SVGElement.prototype.getBoundingClientRect = function () {
    if ((this as SVGElement).hasAttribute('data-authored-node-id')) {
      return {
        x: bounds.left, y: bounds.top, ...bounds,
        width: bounds.right - bounds.left, height: bounds.bottom - bounds.top,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return original.call(this);
  };
  const restore = () => { SVGElement.prototype.getBoundingClientRect = original; };
  restoreAuthoredBounds = restore;
  return restore;
};
const installLayerBounds = (bounds: Record<number, { left: number; top: number; right: number; bottom: number }>) => {
  const original = SVGElement.prototype.getBoundingClientRect;
  SVGElement.prototype.getBoundingClientRect = function () {
    const id = Number((this as SVGElement).getAttribute('data-layer-id'));
    const rect = bounds[id];
    if (rect) return {
      x: rect.left, y: rect.top, ...rect,
      width: rect.right - rect.left, height: rect.bottom - rect.top,
      toJSON: () => ({}),
    } as DOMRect;
    return original.call(this);
  };
  const restore = () => { SVGElement.prototype.getBoundingClientRect = original; };
  restoreAuthoredBounds = restore;
  return restore;
};
const installNodeBounds = (bounds: Record<string, { left: number; top: number; right: number; bottom: number }>) => {
  const original = SVGElement.prototype.getBoundingClientRect;
  SVGElement.prototype.getBoundingClientRect = function () {
    const id = (this as SVGElement).getAttribute('data-authored-node-id');
    const rect = id ? bounds[id] : undefined;
    if (rect) return {
      x: rect.left, y: rect.top, ...rect,
      width: rect.right - rect.left, height: rect.bottom - rect.top,
      toJSON: () => ({}),
    } as DOMRect;
    return original.call(this);
  };
  const restore = () => { SVGElement.prototype.getBoundingClientRect = original; };
  restoreAuthoredBounds = restore;
  return restore;
};
const installIdentityCanvasMatrix = (svg: SVGSVGElement) => {
  Object.defineProperty(svg, 'getScreenCTM', {
    value: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
  });
};
const installGroupMemberBounds = () => {
  const original = SVGElement.prototype.getBoundingClientRect;
  SVGElement.prototype.getBoundingClientRect = function () {
    const id = (this as SVGElement).getAttribute('data-layer-id');
    if (id === '1') return { x: 100, y: 100, left: 100, top: 100, right: 140, bottom: 140, width: 40, height: 40, toJSON: () => ({}) };
    if (id === '2') return { x: 180, y: 90, left: 180, top: 90, right: 220, bottom: 150, width: 40, height: 60, toJSON: () => ({}) };
    return original.call(this);
  };
  const restore = () => { SVGElement.prototype.getBoundingClientRect = original; };
  restoreAuthoredBounds = restore;
  return restore;
};

const authoredNode = (over: Partial<TemplateAuthoringNode>): TemplateAuthoringNode => ({
  nodeId: 'aep:1:1', sourceRef: { compId: 1, layerId: 1 }, sourceNodeId: null,
  sourceCompositionId: 1, parentNodeId: null, name: 'Artwork', textContent: null,
  fontRef: null, fillColor: null, kind: 'artwork', shape: null, size: null, pathPosition: null,
  fill: null, stroke: null, inSec: null, outSec: null, index: 0, visible: true,
  visibilityReason: null, textReason: null, fontReason: null, font: null, fontSize: null,
  position: [100, 200], rotation: 0, scale: [100, 100], opacity: 100,
  transformLocks: {},
  capabilities: { transform: true, visibility: true, font: true, text: false, order: true, exposure: false,
    creation: false, duplicate: true, delete: true, grouping: false, masks: false,
    artboardMutation: false, keyframes: false },
  duplicateReason: null, deleteReason: null,
  opaqueSourceRef: { versionId: '00000000-0000-4000-8000-000000000002', checksum: 'c'.repeat(64) },
  ...over,
});

describe('template preview interactions', () => {
  test('renders the effective artboard dimensions in the preview frame', () => {
    const { container, rerender } = render(
      <TemplateLayerPreview
        markup={markup} layers={[layer]} compId={1} fonts={[]} disabled={false}
        onSelect={mock(() => {})} onEdit={mock(() => {})}
        artboard={{ width: 640, height: 360 }}
      />,
    );
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 640 360');
    expect(container.querySelector('svg')?.getAttribute('data-effective-artboard')).toBe('640x360');
    rerender(
      <TemplateLayerPreview
        markup={markup} layers={[layer]} compId={1} fonts={[]} disabled={false}
        onSelect={mock(() => {})} onEdit={mock(() => {})}
        artboard={{ width: 320, height: 240 }}
      />,
    );
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 320 240');
  });

  test('selects the containing composition when its flattened artwork is clicked', () => {
    const container = document.createElement('div');
    container.innerHTML = markup;
    const child = { ...layer, compId: 2, layerId: 2 };
    expect(previewTarget(container.querySelector('path')!, [layer, child], 1)).toEqual(layer);
    expect(previewTarget(container.querySelector('svg')!, [layer, child], 1)).toBeNull();
  });

  test('private deletion hides a source node in the preview without changing source markup', () => {
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[layer]} compId={1} fonts={[]} disabled={false}
        onSelect={mock(() => {})} onEdit={mock(() => {})}
        authoredNodes={[]} removedSourceNodeIds={['aep:1:1']}
      />,
    );
    expect(container.querySelector('[data-layer-id="1"]')).toBeNull();
    expect(container.querySelector('[data-layer-id="2"]')).toBeTruthy();
  });

  test('draws an outline-only mask in verified signed source coordinates through the pinned affine', () => {
    const sourceChecksum = 'c'.repeat(64);
    const source = authoredNode({
      nodeId: 'aep:1:1', sourceRef: { compId: 1, layerId: 1 }, position: [512, 512],
      capabilities: { transform: true, visibility: true, font: false, text: false, order: true, exposure: false,
        creation: false, duplicate: true, delete: true, grouping: false, masks: true, artboardMutation: false, keyframes: false },
      maskReason: null, maskGeometryReason: null,
      maskSourceGeometry: {
        status: 'verified', coordinateSpace: 'layer-source-pixels', sourceKind: 'shape-path',
        sourceRef: { kind: 'native-path', id: 1, name: 'Path' },
        bounds: { x: -243.27197, y: -4, width: 273.27197, height: 273.27197 },
        anchor: [-106.635986, 132.635986, 0], position: [512, 512, 0], scale: [100, 100, 100], rotation: 0,
        localToComp: { matrix: [1, 0, 0, 1, 512, 512], corners: [[268, 508], [542, 508], [542, 781], [268, 781]], verifiedWithPyAep: true },
        measurement: 'native fixture', packageSha256: sourceChecksum, sourceAepSha256: 'd'.repeat(64), compId: 1, layerUid: 1,
      },
      masks: [{ draftMaskId: '00000000-0000-4000-8000-000000000101', name: 'Inset', shape: 'rectangle',
        center: [-106.635985, 132.635985], size: [136.635985, 136.635985], mode: 'add', opacity: 100, feather: [0, 0] }],
    });
    const { container } = render(
      <TemplateLayerPreview markup={markup} layers={[layer]} compId={1} fonts={[]} disabled={false}
        onSelect={() => {}} onEdit={() => {}} authoredNodes={[source]} authoredNodeIds={[source.nodeId]}
        sourceChecksum={sourceChecksum} />,
    );
    const outline = container.querySelector('[data-authoring-mask-boundary="00000000-0000-4000-8000-000000000101"]');
    expect(outline?.tagName.toLowerCase()).toBe('rect');
    expect(outline?.getAttribute('x')).toBe('-174.9539775');
    expect(outline?.parentElement?.getAttribute('transform')).toBe('matrix(1 0 0 1 512 512)');
    expect(outline?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(outline?.getAttribute('aria-label')).toContain('source pixels are not clipped');
  });

  test('duplicate artwork hit testing selects the draft node rather than its source UID', () => {
    const duplicate = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000003', sourceRef: null,
      sourceNodeId: 'aep:1:1', name: 'Artwork copy', index: 0,
    });
    const onSelectNode = mock(() => {});
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[layer]} compId={1} fonts={[]} disabled={false}
        onSelect={mock(() => {})} onEdit={mock(() => {})} authoredNodes={[authoredNode({}), duplicate]}
        authoredNodeIds={['aep:1:1', duplicate.nodeId]}
        onSelectNode={onSelectNode}
      />,
    );
    const overlay = container.querySelector('[data-authored-node-id="draft:00000000-0000-4000-8000-000000000003"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.querySelector('[data-layer-id]')).toBeNull();
    fireEvent.pointerDown(overlay!);
    expect(onSelectNode).toHaveBeenCalledWith('draft:00000000-0000-4000-8000-000000000003');
  });

  test('created rectangle and ellipse render from the projected shape geometry', () => {
    const rectangle = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000007', sourceRef: null, sourceNodeId: null,
      kind: 'shape', shape: 'rectangle', name: 'Card', position: [200, 150], size: [240, 140],
      pathPosition: [0, 0], fill: { type: 'solid', color: [0.12, 0.55, 0.7], opacity: 0.24 },
      stroke: { type: 'solid', color: [0.12, 0.55, 0.7], opacity: 1, width: 2 },
    });
    const ellipse = authoredNode({
      ...rectangle, nodeId: 'draft:00000000-0000-4000-8000-000000000008', kind: 'shape',
      shape: 'ellipse', name: 'Badge', index: 1,
    });
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[]} compId={1} fonts={[]} disabled={false}
        onSelect={() => {}} onEdit={() => {}} authoredNodes={[rectangle, ellipse]}
        authoredNodeIds={[rectangle.nodeId, ellipse.nodeId]}
      />,
    );
    expect(container.querySelector(`[data-authored-node-id="${rectangle.nodeId}"] rect`)?.getAttribute('width')).toBe('240');
    expect(container.querySelector(`[data-authored-node-id="${ellipse.nodeId}"] ellipse`)?.getAttribute('rx')).toBe('120');
    expect(container.querySelector(`[data-authored-node-id="${ellipse.nodeId}"]`)?.getAttribute('transform')).toBe('translate(200 150) rotate(0) scale(1 1)');
  });

  test('display samples update generated parent and child poses without changing canonical nodes', () => {
    const groupId = 'draft:00000000-0000-4000-8000-000000000040';
    const childId = 'draft:00000000-0000-4000-8000-000000000041';
    const group = authoredNode({
      nodeId: groupId, sourceRef: null, sourceCompositionId: null, sourceNodeId: null,
      kind: 'group', position: [10, 20], rotation: 0, scale: [100, 100], opacity: 100,
    });
    const child = authoredNode({
      nodeId: childId, sourceRef: null, sourceCompositionId: null, sourceNodeId: null,
      parentNodeId: groupId, kind: 'shape', shape: 'rectangle', position: [100, 200],
      size: [30, 40], pathPosition: [0, 0], opacity: 100,
    });
    const nodes = [group, child];
    const props = {
      markup, layers: [], compId: 1, fonts: [], disabled: false,
      onSelect: mock(() => {}), onEdit: mock(() => {}), authoredNodes: nodes,
      authoredNodeIds: [groupId, childId],
    };
    const { container, rerender } = render(<TemplateLayerPreview {...props} />);
    const childOverlay = () => container.querySelector(`[data-authored-node-id="${childId}"]`)!;
    expect(childOverlay().getAttribute('transform')).toBe('translate(10 20) translate(100 200) rotate(0) scale(1 1)');

    rerender(<TemplateLayerPreview {...props} authoredRenderNodes={[
      { nodeId: groupId, position: [30, 40], rotation: 15, scale: [200, 150], opacity: 50 },
      { nodeId: childId, position: [120, 220], opacity: 35 },
    ]} />);
    expect(childOverlay().getAttribute('transform')).toBe('translate(30 40) rotate(15) scale(2 1.5) translate(120 220) rotate(0) scale(1 1)');
    expect(childOverlay().getAttribute('opacity')).toBe('0.175');
    expect(child.position).toEqual([100, 200]);
    expect(group.position).toEqual([10, 20]);

    rerender(<TemplateLayerPreview {...props} authoredRenderNodes={[{ nodeId: childId, visible: false }]} />);
    expect(childOverlay().getAttribute('transform')).toBe('translate(10 20) translate(100 200) rotate(0) scale(1 1)');
    expect(childOverlay().getAttribute('opacity')).toBe('1');
    expect(childOverlay().getAttribute('display')).toBe('none');

    rerender(<TemplateLayerPreview {...props} authoredRenderNodes={[]} />);
    expect(childOverlay().getAttribute('display')).toBeNull();
    expect(childOverlay().getAttribute('transform')).toBe('translate(10 20) translate(100 200) rotate(0) scale(1 1)');
  });

  test('a generated group translation moves its members in preview and resets without changing source data', () => {
    const groupId = 'draft:00000000-0000-4000-8000-000000000010';
    const group = authoredNode({
      nodeId: groupId, sourceRef: null, sourceNodeId: null, kind: 'group', name: 'Group',
      position: [15, 25], opacity: 0,
    });
    const member = authoredNode({ parentNodeId: groupId });
    const props = {
      markup, layers: [layer], compId: 1, fonts: [], disabled: false,
      onSelect: mock(() => {}), onEdit: mock(() => {}), authoredNodes: [member, group],
      authoredNodeIds: [groupId, member.nodeId],
    };
    const { container, rerender } = render(<TemplateLayerPreview {...props} />);
    expect(container.querySelector('[data-layer-id="1"]')?.getAttribute('transform')).toBe('translate(15 25)');
    rerender(<TemplateLayerPreview {...props} authoredNodes={[{ ...member, parentNodeId: null, position: [115, 225] }]} authoredNodeIds={[member.nodeId]} />);
    expect(container.querySelector('[data-layer-id="1"]')?.getAttribute('transform')).toBe('translate(15 25)');
    rerender(<TemplateLayerPreview {...props} authoredNodes={[member, { ...group, position: [0, 0] }]} />);
    expect(container.querySelector('[data-layer-id="1"]')?.hasAttribute('transform')).toBe(false);
  });

  test('generated group rotation and scale apply once to source and authored members through the ancestor chain', () => {
    const outerId = 'draft:00000000-0000-4000-8000-000000000030';
    const innerId = 'draft:00000000-0000-4000-8000-000000000031';
    const outer = authoredNode({nodeId:outerId,sourceRef:null,kind:'group',position:[15,25],rotation:30,scale:[200,150]});
    const inner = authoredNode({nodeId:innerId,sourceRef:null,kind:'group',parentNodeId:outerId,position:[5,7],rotation:10,scale:[50,100]});
    const member = authoredNode({parentNodeId:innerId});
    const shape = authoredNode({nodeId:'draft:00000000-0000-4000-8000-000000000032',sourceRef:null,kind:'shape',shape:'rectangle',
      parentNodeId:innerId,position:[100,200],size:[30,40]});
    const props = {markup,layers:[layer],compId:1,fonts:[],disabled:false,onSelect:()=>{},onEdit:()=>{},
      authoredNodes:[member,outer,inner,shape],authoredNodeIds:[member.nodeId,outerId,innerId,shape.nodeId]};
    const {container,rerender}=render(<TemplateLayerPreview {...props}/>);
    const prefix='translate(15 25) rotate(30) scale(2 1.5) translate(5 7) rotate(10) scale(0.5 1)';
    expect(container.querySelector('[data-layer-id="1"]')?.getAttribute('transform')).toBe(prefix);
    expect(container.querySelector(`[data-authored-node-id="${shape.nodeId}"]`)?.getAttribute('transform')).toBe(`${prefix} translate(100 200) rotate(0) scale(1 1)`);
    rerender(<TemplateLayerPreview {...props} authoredNodes={[{...member,parentNodeId:null}]}/>);
    expect(container.querySelector('[data-layer-id="1"]')?.hasAttribute('transform')).toBe(false);
    expect(member.position).toEqual([100,200]);
  });

  test('native sampled position, rotation, and scale remain visible under a static authored parent', () => {
    const groupId = 'draft:00000000-0000-4000-8000-000000000051';
    const group = authoredNode({ nodeId: groupId, sourceRef: null, kind: 'group', position: [10, 20] });
    const member = authoredNode({ parentNodeId: groupId });
    const previewEdits = {
      compId: 1,
      layers: [layer],
      rendered: {},
      current: { 1: { position: [120, 220] as const, rotation: 30, scale: [150, 80] as const } },
      renderedOrder: [1],
      order: [1],
    };
    const { container } = render(
      <TemplateLayerPreview markup={markup} previewEdits={previewEdits} layers={[layer]} compId={1}
        fonts={[]} disabled={false} onSelect={() => {}} onEdit={() => {}}
        authoredNodes={[member, group]} authoredNodeIds={[member.nodeId, groupId]} />,
    );
    expect(container.querySelector('[data-layer-id="1"]')?.getAttribute('transform')).toBe(
      'translate(10 20) translate(120 220) rotate(30) scale(1.5 0.8) rotate(0) translate(-100 -200)',
    );
  });

  test('native source alignment falls back to canonical pose when preview has no explicit transform fields', () => {
    const groupId = 'draft:00000000-0000-4000-8000-000000000052';
    const group = authoredNode({ nodeId: groupId, sourceRef: null, kind: 'group', position: [10, 20] });
    const member = authoredNode({ parentNodeId: groupId, position: [512, 512] });
    const { container } = render(
      <TemplateLayerPreview markup={markup} layers={[layer]} compId={1}
        fonts={[]} disabled={false} onSelect={() => {}} onEdit={() => {}}
        authoredNodes={[member, group]} authoredNodeIds={[member.nodeId, groupId]} />,
    );
    expect(container.querySelector('[data-layer-id="1"]')?.getAttribute('transform')).toBe(
      'translate(10 20) translate(412 312)',
    );
  });

  test('generated group resize moves every preview member and commits one group identity', () => {
    const groupId='draft:00000000-0000-4000-8000-000000000033';
    const group=authoredNode({nodeId:groupId,sourceRef:null,kind:'group',position:[0,0]});
    const first=authoredNode({parentNodeId:groupId,position:[100,100]});
    const second=authoredNode({nodeId:'aep:1:2',sourceRef:{compId:1,layerId:2},parentNodeId:groupId,position:[180,90]});
    const onAuthoredGestureCommit=mock(()=>{});
    const onEdit=mock(()=>{});
    installGroupMemberBounds();
    const {container}=render(<TemplateLayerPreview markup={markup} layers={[{...layer,position:[100,100]},{...layer,layerId:2,position:[180,90]}]}
      compId={1} fonts={[]} disabled={false} onSelect={()=>{}} onEdit={onEdit} selectedNodeId={groupId}
      authoredNodes={[group,first,second]} authoredNodeIds={[groupId,first.nodeId,second.nodeId]} onAuthoredGestureCommit={onAuthoredGestureCommit}/>);
    const svg=container.querySelector('svg')!;
    Object.defineProperty(svg,'getScreenCTM',{value:()=>({inverse:()=>({a:1,b:0,c:0,d:1,e:0,f:0})})});
    const handle=container.querySelector('[data-canvas-handle="e"]')!;
    expect(handle).not.toBeNull();
    fireEvent.pointerDown(handle,{button:0,pointerId:32,clientX:220,clientY:120});
    fireEvent.pointerMove(screen.getByRole('application',{name:'Interactive template preview'}),{pointerId:32,clientX:280,clientY:120});
    const transform=container.querySelector('[data-layer-id="1"]')?.getAttribute('transform');
    expect(transform).toContain('scale(1.5 1)');
    expect(container.querySelector('[data-layer-id="2"]')?.getAttribute('transform')).toBe(transform);
    fireEvent.pointerUp(screen.getByRole('application',{name:'Interactive template preview'}),{pointerId:32,clientX:280,clientY:120});
    expect(onAuthoredGestureCommit).toHaveBeenCalledTimes(1);
    expect(onAuthoredGestureCommit.mock.calls[0]?.[0]).toBe(groupId);
    expect(onEdit).not.toHaveBeenCalled();
  });

  test('animated generated groups keep selection but hide static canvas handles and reject keyboard nudges', () => {
    const groupId = 'draft:00000000-0000-4000-8000-000000000034';
    const group = authoredNode({
      nodeId: groupId, sourceRef: null, kind: 'group', name: 'Animated group', position: [0, 0],
      capabilities: { ...authoredNode({}).capabilities, transform: true, keyframes: true },
      keyframeChannels: [{
        channelId: `${groupId}:ADBE Position`, channel: 'position', matchName: 'ADBE Position',
        frameRate: 30, dimensions: 3, separated: false, baseValue: [0, 0, 0], reason: null,
        keyframes: [{
          keyframeId: 'draft:00000000-0000-4000-8000-000000000035', timeSec: 0, value: [0, 0, 0],
          inInterpolation: 'LINEAR', outInterpolation: 'LINEAR', inEase: [], outEase: [],
        }],
      }],
    });
    const first = authoredNode({ parentNodeId: groupId });
    const second = authoredNode({ nodeId: 'aep:1:2', sourceRef: { compId: 1, layerId: 2 }, parentNodeId: groupId });
    const onAuthoredGestureCommit = mock(() => {});
    installGroupMemberBounds();
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[layer, { ...layer, layerId: 2 }]} compId={1} fonts={[]}
        disabled={false} onSelect={() => {}} onEdit={() => {}} selectedNodeId={groupId}
        authoredNodes={[group, first, second]} authoredNodeIds={[groupId, first.nodeId, second.nodeId]}
        onAuthoredGestureCommit={onAuthoredGestureCommit}
      />,
    );
    expect(container.querySelector('[data-testid="canvas-selection-frame"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-handle="move"]')).toBeNull();
    expect(container.querySelector('[data-canvas-handle="e"]')).toBeNull();
    expect(container.querySelector('[data-canvas-handle="rotate"]')).toBeNull();
    fireEvent.keyDown(screen.getByRole('application', { name: 'Interactive template preview' }), { key: 'ArrowRight' });
    expect(onAuthoredGestureCommit).not.toHaveBeenCalled();
  });

  test('a generated group selects the union of its members and drags them through one group UUID edit', () => {
    const groupId = 'draft:00000000-0000-4000-8000-000000000020';
    const group = authoredNode({
      nodeId: groupId, sourceRef: null, sourceNodeId: null, kind: 'group', name: 'Group',
      position: [10, 20], opacity: 0,
    });
    const first = authoredNode({
      nodeId: 'aep:1:1', sourceRef: { compId: 1, layerId: 1 }, sourceNodeId: null,
      parentNodeId: groupId, position: [100, 100],
    });
    const second = authoredNode({
      nodeId: 'aep:1:2', sourceRef: { compId: 1, layerId: 2 }, sourceNodeId: null,
      parentNodeId: groupId, position: [180, 90],
    });
    const onEdit = mock(() => {});
    const onAuthoredGestureCommit = mock(() => {});
    const restoreBounds = installGroupMemberBounds();
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[layer, { ...layer, layerId: 2, index: 1 }]} compId={1} fonts={[]}
        disabled={false} onSelect={() => {}} onEdit={onEdit} selectedNodeId={groupId}
        authoredNodes={[group, first, second]} authoredNodeIds={[groupId, first.nodeId, second.nodeId]}
        onAuthoredGestureCommit={onAuthoredGestureCommit}
      />,
    );
    const frame = container.querySelector<HTMLElement>('[data-testid="canvas-selection-frame"]');
    expect(frame?.style.left).toBe('100px');
    expect(frame?.style.top).toBe('90px');
    expect(frame?.style.width).toBe('120px');
    expect(frame?.style.height).toBe('60px');
    expect(container.querySelector('[data-canvas-handle="move"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-handle="e"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-handle="rotate"]')).toBeTruthy();
    const svg = container.querySelector('svg')!;
    installIdentityCanvasMatrix(svg);
    const move = container.querySelector('[data-canvas-handle="move"]')!;
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    const firstTransform = container.querySelector('[data-layer-id="1"]')?.getAttribute('transform');
    const secondTransform = container.querySelector('[data-layer-id="2"]')?.getAttribute('transform');
    fireEvent.pointerDown(move, { button: 0, pointerId: 28, clientX: 160, clientY: 82 });
    fireEvent.pointerMove(canvas, { pointerId: 28, clientX: 170, clientY: 87 });
    expect(container.querySelector('[data-layer-id="1"]')?.getAttribute('transform')).toBe(`translate(10 0) ${firstTransform}`);
    expect(container.querySelector('[data-layer-id="2"]')?.getAttribute('transform')).toBe(`translate(10 0) ${secondTransform}`);
    expect(container.querySelector('span.border-dashed')?.getAttribute('style')).toContain('top: 150px');
    fireEvent.pointerUp(canvas, { pointerId: 28, clientX: 170, clientY: 87 });
    expect(onAuthoredGestureCommit).toHaveBeenCalledTimes(1);
    expect(onAuthoredGestureCommit.mock.calls[0]).toEqual([groupId, { position: [20, 20] }]);
    expect(onEdit).not.toHaveBeenCalled();
    expect(container.querySelector('[data-layer-id="1"]')?.getAttribute('transform')).toBe(firstTransform);
    expect(container.querySelector('[data-layer-id="2"]')?.getAttribute('transform')).toBe(secondTransform);
    restoreBounds();
  });

  test('a center drag on a tiny group intercepted by an edge handle moves all descendants', () => {
    const groupId = 'draft:00000000-0000-4000-8000-000000000041';
    const group = authoredNode({
      nodeId: groupId, sourceRef: null, sourceNodeId: null, kind: 'group',
      name: 'Tiny group', position: [10, 20],
    });
    const first = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000042', sourceRef: null,
      sourceNodeId: null, parentNodeId: groupId, kind: 'shape', shape: 'rectangle',
      size: [4, 4], position: [100, 100],
    });
    const second = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000043', sourceRef: null,
      sourceNodeId: null, parentNodeId: groupId, kind: 'shape', shape: 'ellipse',
      size: [4, 4], position: [100, 100],
    });
    const onAuthoredGestureCommit = mock(() => {});
    installAuthoredElementBounds({ left: 100, top: 200, right: 104, bottom: 204 });
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[]} compId={1} fonts={[]} disabled={false}
        onSelect={() => {}} onEdit={() => {}} selectedNodeId={groupId}
        authoredNodes={[group, first, second]} authoredNodeIds={[groupId, first.nodeId, second.nodeId]}
        onAuthoredGestureCommit={onAuthoredGestureCommit}
      />,
    );
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    const svg = container.querySelector('svg')!;
    Object.defineProperty(svg, 'getScreenCTM', {
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    });
    const firstElement = container.querySelector(`[data-authored-node-id="${first.nodeId}"]`)!;
    const secondElement = container.querySelector(`[data-authored-node-id="${second.nodeId}"]`)!;
    const firstTransform = firstElement.getAttribute('transform');
    const secondTransform = secondElement.getAttribute('transform');
    const eastHandle = container.querySelector('[data-canvas-handle="e"]')!;
    fireEvent.pointerDown(eastHandle, { button: 0, pointerId: 44, clientX: 102, clientY: 202 });
    fireEvent.pointerMove(canvas, { pointerId: 44, clientX: 105, clientY: 207 });
    expect(firstElement.getAttribute('transform')).toBe(`translate(3 5) ${firstTransform}`);
    expect(secondElement.getAttribute('transform')).toBe(`translate(3 5) ${secondTransform}`);
    fireEvent.pointerUp(canvas, { pointerId: 44, clientX: 105, clientY: 207 });
    expect(onAuthoredGestureCommit).toHaveBeenCalledWith(groupId, { position: [13, 25] });
  });

  test('generated group handle drag does not snap against its own descendants', () => {
    const groupId = 'draft:00000000-0000-4000-8000-000000000065';
    const group = authoredNode({ nodeId: groupId, sourceRef: null, kind: 'group', position: [10, 20] });
    const first = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000066', sourceRef: null, parentNodeId: groupId,
      kind: 'shape', shape: 'rectangle', position: [100, 100], size: [40, 40],
    });
    const second = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000067', sourceRef: null, parentNodeId: groupId,
      kind: 'shape', shape: 'rectangle', position: [200, 100], size: [40, 40],
    });
    const onAuthoredGestureCommit = mock(() => {});
    installNodeBounds({
      [first.nodeId]: { left: 100, top: 100, right: 140, bottom: 140 },
      [second.nodeId]: { left: 200, top: 100, right: 240, bottom: 140 },
    });
    const { container } = render(
      <TemplateLayerPreview
        markup='<svg viewBox="0 0 417 301"></svg>' layers={[]} compId={1} fonts={[]}
        disabled={false} onSelect={() => {}} onEdit={() => {}} selectedNodeId={groupId}
        authoredNodes={[group, first, second]} authoredNodeIds={[groupId, first.nodeId, second.nodeId]}
        onAuthoredGestureCommit={onAuthoredGestureCommit}
      />,
    );
    const svg = container.querySelector('svg')!;
    installIdentityCanvasMatrix(svg);
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    const handle = container.querySelector('[data-canvas-handle="move"]')!;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 63, clientX: 170, clientY: 120 });
    fireEvent.pointerMove(canvas, { pointerId: 63, clientX: 172, clientY: 120 });
    expect(container.querySelector('span.border-dashed')).toBeNull();
    fireEvent.pointerUp(canvas, { pointerId: 63, clientX: 172, clientY: 120 });
    expect(onAuthoredGestureCommit.mock.calls[0]).toEqual([groupId, { position: [12, 20] }]);
  });

  test('draft text drag commits one stable-UUID position edit at pointer up', () => {
    const node = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000004', sourceRef: null,
      sourceNodeId: null, name: 'New text', textContent: 'Exact face', kind: 'text',
      position: [100, 200], fontRef: { fontId: '00000000-0000-4000-8000-000000000005', postScriptName: 'DejaVuSans', sha256: 'd'.repeat(64) },
      capabilities: { ...authoredNode({}).capabilities, transform: true },
    });
    const onAuthoredGestureCommit = mock(() => {});
    installAuthoredElementBounds({ left: 196, top: 200, right: 236, bottom: 240 });
    const nodes = [node];
    const nodeIds = [node.nodeId];
    const artworkPreviewUrls = {};
    const removedSourceNodeIds: string[] = [];
    const previewProps = {
      markup, layers: [], compId: 1, fonts: [], disabled: false,
      onSelect: () => {}, onEdit: () => {}, authoredNodes: nodes, authoredNodeIds: nodeIds,
      artworkPreviewUrls, removedSourceNodeIds, onAuthoredGestureCommit,
    };
    const { container, rerender } = render(
      <TemplateLayerPreview
        {...previewProps}
      />,
    );
    Object.defineProperty(container.querySelector('svg'), 'getScreenCTM', {
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    });
    const overlay = container.querySelector(`[data-authored-node-id="${node.nodeId}"]`)!;
    fireEvent.pointerDown(overlay, { button: 0, pointerId: 21, clientX: 100, clientY: 200 });
    expect(onAuthoredGestureCommit).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { pointerId: 21, clientX: 100, clientY: 200 });
    expect(onAuthoredGestureCommit).not.toHaveBeenCalled();
    expect(container.querySelector('span.border-dashed')).toBeNull();
    fireEvent.pointerMove(window, { pointerId: 21, clientX: 122, clientY: 231 });
    const draggedTransform = overlay.getAttribute('transform');
    rerender(<TemplateLayerPreview {...previewProps} authoredRenderNodes={[{ nodeId: node.nodeId, position: [400, 500] }]} />);
    expect(container.querySelector(`[data-authored-node-id="${node.nodeId}"]`)?.getAttribute('transform')).toBe(draggedTransform);
    fireEvent.pointerUp(window, { pointerId: 21, clientX: 122, clientY: 231 });
    expect(onAuthoredGestureCommit).toHaveBeenCalledTimes(1);
    expect(container.querySelector(`[data-authored-node-id="${node.nodeId}"]`)?.getAttribute('transform'))
      .toBe('translate(400 500) rotate(0) scale(1 1)');
    expect(onAuthoredGestureCommit.mock.calls[0]).toEqual([
      node.nodeId,
      { position: [122, 231] },
    ]);
  });

  test('body cancel applies the latest display sample without committing a command', () => {
    const node = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000046', sourceRef: null,
      sourceNodeId: null, name: 'Draft', kind: 'shape', shape: 'rectangle',
      position: [100, 200], size: [40, 40], pathPosition: [0, 0],
    });
    const onAuthoredGestureCommit = mock(() => {});
    installAuthoredElementBounds();
    const props = {
      markup, layers: [], compId: 1, fonts: [], disabled: false,
      onSelect: () => {}, onEdit: () => {}, authoredNodes: [node], authoredNodeIds: [node.nodeId],
      onAuthoredGestureCommit,
    };
    const { container, rerender } = render(<TemplateLayerPreview {...props} />);
    const svg = container.querySelector('svg')!;
    installIdentityCanvasMatrix(svg);
    const overlay = container.querySelector(`[data-authored-node-id="${node.nodeId}"]`)!;
    fireEvent.pointerDown(overlay, { button: 0, pointerId: 47, clientX: 110, clientY: 210 });
    fireEvent.pointerMove(window, { pointerId: 47, clientX: 130, clientY: 230 });
    rerender(<TemplateLayerPreview {...props} authoredRenderNodes={[{ nodeId: node.nodeId, position: [400, 500] }]} />);
    fireEvent.pointerCancel(window, { pointerId: 47, clientX: 130, clientY: 230 });
    expect(container.querySelector(`[data-authored-node-id="${node.nodeId}"]`)?.getAttribute('transform'))
      .toBe('translate(400 500) rotate(0) scale(1 1)');
    expect(onAuthoredGestureCommit).not.toHaveBeenCalled();
  });

  test('selecting an authored node clears native handles and exposes handles for the authored node', async () => {
    const draft = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000009', sourceRef: null,
      sourceNodeId: null, kind: 'text', textContent: 'Copy', name: 'Text copy',
    });
    const onEdit = mock(() => {});
    const props = {
      markup, layers: [layer], compId: 1, fonts: [], disabled: false,
      onSelect: mock(() => {}), onEdit, authoredNodes: [draft],
      authoredNodeIds: [draft.nodeId], layer,
    };
    const restoreBounds = installAuthoredElementBounds();
    const { rerender, container } = render(<TemplateLayerPreview {...props} selectedNodeId="aep:1:1" />);
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(onEdit).toHaveBeenCalledTimes(1);
    const nativeTransformAfterNativeNudge = container.querySelector('[data-layer-id="1"]')?.getAttribute('transform');
    rerender(<TemplateLayerPreview {...props} selectedNodeId={draft.nodeId} />);
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.sr-only[aria-live="polite"]')?.textContent).toContain('1 layer selected.');
    await waitFor(() => expect(container.querySelector('[data-testid="canvas-selection-frame"]')).toBeTruthy());
    expect(container.querySelector('[data-canvas-handle="e"]')).toBeTruthy();
    expect(container.querySelector('[data-canvas-handle="rotate"]')).toBeTruthy();
    expect(container.querySelector('[data-layer-id="1"]')?.getAttribute('transform')).toBe(nativeTransformAfterNativeNudge);
    restoreBounds();
  });

  test('resizing an authored node commits its own stable ID and never edits the source layer', () => {
    const draft = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000019', sourceRef: null,
      sourceNodeId: null, kind: 'shape', shape: 'rectangle', name: 'Card',
      position: [120, 220], size: [40, 40], pathPosition: [0, 0],
    });
    const onEdit = mock(() => {});
    const onAuthoredGestureCommit = mock(() => {});
    const restoreBounds = installAuthoredElementBounds();
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[layer]} compId={1} fonts={[]} disabled={false}
        onSelect={() => {}} onEdit={onEdit} selectedNodeId={draft.nodeId}
        authoredNodes={[draft]} authoredNodeIds={[draft.nodeId]}
        onAuthoredGestureCommit={onAuthoredGestureCommit}
      />,
    );
    const svg = container.querySelector('svg')!;
    installIdentityCanvasMatrix(svg);
    const handle = container.querySelector('[data-canvas-handle="e"]')!;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 23, clientX: 140, clientY: 220 });
    fireEvent.pointerMove(screen.getByRole('application', { name: 'Interactive template preview' }), { pointerId: 23, clientX: 160, clientY: 220 });
    fireEvent.pointerUp(screen.getByRole('application', { name: 'Interactive template preview' }), { pointerId: 23, clientX: 160, clientY: 220 });
    expect(onAuthoredGestureCommit).toHaveBeenCalledTimes(1);
    expect(onAuthoredGestureCommit.mock.calls[0]).toEqual([
      draft.nodeId,
      { position: [130, 220], scale: [150, 100], rotation: 0 },
    ]);
    expect(onEdit).not.toHaveBeenCalled();
    expect(container.querySelector('[data-layer-id="1"]')?.getAttribute('transform')).toBeNull();
    restoreBounds();
  });

  test('space and middle-button drags pan from resize handles without authoring a transform', () => {
    const draft = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000046', sourceRef: null,
      sourceNodeId: null, kind: 'shape', shape: 'rectangle', name: 'Card',
      position: [120, 220], size: [40, 40], pathPosition: [0, 0],
    });
    const onAuthoredGestureCommit = mock(() => {});
    installAuthoredElementBounds();
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[layer]} compId={1} fonts={[]} disabled={false}
        onSelect={() => {}} onEdit={() => {}} selectedNodeId={draft.nodeId}
        authoredNodes={[draft]} authoredNodeIds={[draft.nodeId]}
        onAuthoredGestureCommit={onAuthoredGestureCommit}
      />,
    );
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    Object.assign(canvas, { setPointerCapture: mock(() => {}), hasPointerCapture: () => false });
    Object.defineProperty(container.querySelector('svg'), 'getScreenCTM', {
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    });
    const eastHandle = container.querySelector('[data-canvas-handle="e"]')!;
    canvas.focus();
    expect(document.activeElement).toBe(canvas);
    fireEvent.keyDown(canvas, { key: ' ' });
    fireEvent.pointerDown(eastHandle, { button: 0, pointerId: 48, clientX: 140, clientY: 220 });
    fireEvent.pointerMove(canvas, { pointerId: 48, clientX: 145, clientY: 226 });
    fireEvent.pointerUp(canvas, { pointerId: 48, clientX: 145, clientY: 226 });
    fireEvent.keyUp(canvas, { key: ' ' });
    expect(container.querySelector('[role="img"][aria-label="Layout preview of the template with these edits"]')?.getAttribute('style'))
      .toContain('translate(5px, 6px)');
    fireEvent.pointerDown(eastHandle, { button: 1, pointerId: 49, clientX: 140, clientY: 220 });
    fireEvent.pointerMove(canvas, { pointerId: 49, clientX: 147, clientY: 228 });
    fireEvent.pointerUp(canvas, { pointerId: 49, clientX: 147, clientY: 228 });
    expect(container.querySelector('[role="img"][aria-label="Layout preview of the template with these edits"]')?.getAttribute('style'))
      .toContain('translate(12px, 14px)');
    expect(onAuthoredGestureCommit).not.toHaveBeenCalled();
  });

  test('space and middle-button drags on authored artwork bubble to canvas pan without selecting or editing', () => {
    const draft = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000047', sourceRef: null,
      sourceNodeId: null, kind: 'shape', shape: 'rectangle', name: 'Pan target',
      position: [120, 220], size: [40, 40], pathPosition: [0, 0],
    });
    const onSelectNode = mock(() => {});
    const onAuthoredGestureCommit = mock(() => {});
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[]} compId={1} fonts={[]} disabled={false}
        onSelect={() => {}} onEdit={() => {}} authoredNodes={[draft]} authoredNodeIds={[draft.nodeId]}
        onSelectNode={onSelectNode} onAuthoredGestureCommit={onAuthoredGestureCommit}
      />,
    );
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    Object.assign(canvas, { setPointerCapture: mock(() => {}), hasPointerCapture: () => false });
    const overlay = container.querySelector(`[data-authored-node-id="${draft.nodeId}"]`)!;
    canvas.focus();
    fireEvent.keyDown(canvas, { key: ' ' });
    fireEvent.pointerDown(overlay, { button: 0, pointerId: 51, clientX: 40, clientY: 50 });
    fireEvent.pointerMove(canvas, { pointerId: 51, clientX: 50, clientY: 65 });
    fireEvent.pointerUp(canvas, { pointerId: 51, clientX: 50, clientY: 65 });
    fireEvent.keyUp(canvas, { key: ' ' });
    expect(container.querySelector('[role="img"][aria-label="Layout preview of the template with these edits"]')?.getAttribute('style'))
      .toContain('translate(10px, 15px)');

    const updatedOverlay = container.querySelector(`[data-authored-node-id="${draft.nodeId}"]`)!;
    fireEvent.pointerDown(updatedOverlay, { button: 1, pointerId: 52, clientX: 50, clientY: 65 });
    fireEvent.pointerMove(canvas, { pointerId: 52, clientX: 54, clientY: 74 });
    fireEvent.pointerUp(canvas, { pointerId: 52, clientX: 54, clientY: 74 });
    expect(container.querySelector('[role="img"][aria-label="Layout preview of the template with these edits"]')?.getAttribute('style'))
      .toContain('translate(14px, 24px)');
    expect(onSelectNode).not.toHaveBeenCalled();
    expect(onAuthoredGestureCommit).not.toHaveBeenCalled();
  });

  test('a center drag on a tiny authored shape intercepted by a resize handle commits position only', () => {
    const draft = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000044', sourceRef: null,
      sourceNodeId: null, kind: 'shape', shape: 'rectangle', name: 'Tiny card',
      position: [120, 220], size: [4, 4], pathPosition: [0, 0],
    });
    const onEdit = mock(() => {});
    const onAuthoredGestureCommit = mock(() => {});
    installAuthoredElementBounds({ left: 100, top: 200, right: 104, bottom: 204 });
    const authoredNodes = [draft];
    const authoredNodeIds = [draft.nodeId];
    const artworkPreviewUrls = {};
    const removedSourceNodeIds: string[] = [];
    const previewProps = {
      markup, layers: [layer], compId: 1, fonts: [], disabled: false,
      onSelect: () => {}, onEdit, selectedNodeId: draft.nodeId,
      authoredNodes, authoredNodeIds, artworkPreviewUrls, removedSourceNodeIds, onAuthoredGestureCommit,
    };
    const { container, rerender } = render(
      <>
        <button type="button">Pause preview</button>
        <TemplateLayerPreview {...previewProps} />
      </>,
    );
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    const pauseButton = screen.getByRole('button', { name: 'Pause preview' });
    pauseButton.focus();
    expect(document.activeElement).toBe(pauseButton);
    Object.defineProperty(container.querySelector('svg'), 'getScreenCTM', {
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    });
    const eastHandle = container.querySelector('[data-canvas-handle="e"]')!;
    fireEvent.pointerDown(eastHandle, { button: 0, pointerId: 45, clientX: 102, clientY: 202 });
    expect(document.activeElement).toBe(canvas);
    fireEvent.pointerMove(canvas, { pointerId: 45, clientX: 105, clientY: 206 });
    const liveTransform = container.querySelector(`[data-authored-node-id="${draft.nodeId}"]`)?.getAttribute('transform');
    rerender(<><button type="button">Pause preview</button><TemplateLayerPreview {...previewProps}
      authoredRenderNodes={[{ nodeId: draft.nodeId, position: [400, 500] }]} /></>);
    expect(container.querySelector(`[data-authored-node-id="${draft.nodeId}"]`)?.getAttribute('transform')).toBe(liveTransform);
    fireEvent.pointerUp(canvas, { pointerId: 45, clientX: 105, clientY: 206 });
    expect(onAuthoredGestureCommit).toHaveBeenCalledWith(draft.nodeId, { position: [123, 224] });
    expect(container.querySelector(`[data-authored-node-id="${draft.nodeId}"]`)?.getAttribute('transform'))
      .toBe('translate(400 500) rotate(0) scale(1 1)');
    expect(onAuthoredGestureCommit.mock.calls[0]?.[1]).not.toHaveProperty('scale');
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.keyDown(canvas, { key: ' ' });
    fireEvent.pointerDown(eastHandle, { button: 0, pointerId: 50, clientX: 102, clientY: 202 });
    fireEvent.pointerMove(canvas, { pointerId: 50, clientX: 107, clientY: 208 });
    fireEvent.pointerUp(canvas, { pointerId: 50, clientX: 107, clientY: 208 });
    fireEvent.keyUp(canvas, { key: ' ' });
    expect(container.querySelector('[role="img"][aria-label="Layout preview of the template with these edits"]')?.getAttribute('style'))
      .toContain('translate(5px, 6px)');
    expect(onAuthoredGestureCommit).toHaveBeenCalledTimes(1);
  });

  test('handle cancel applies the latest display sample without committing a command', () => {
    const draft = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000047', sourceRef: null, sourceNodeId: null,
      kind: 'shape', shape: 'rectangle', name: 'Card', position: [120, 220], size: [40, 40], pathPosition: [0, 0],
    });
    const onAuthoredGestureCommit = mock(() => {});
    installAuthoredElementBounds();
    const props = {
      markup, layers: [], compId: 1, fonts: [], disabled: false, onSelect: () => {}, onEdit: () => {},
      selectedNodeId: draft.nodeId, authoredNodes: [draft], authoredNodeIds: [draft.nodeId], onAuthoredGestureCommit,
    };
    const { container, rerender } = render(<TemplateLayerPreview {...props} />);
    installIdentityCanvasMatrix(container.querySelector('svg')!);
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    const handle = container.querySelector('[data-canvas-handle="e"]')!;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 48, clientX: 140, clientY: 220 });
    fireEvent.pointerMove(canvas, { pointerId: 48, clientX: 160, clientY: 220 });
    rerender(<TemplateLayerPreview {...props} authoredRenderNodes={[{ nodeId: draft.nodeId, position: [400, 500] }]} />);
    fireEvent.pointerCancel(canvas, { pointerId: 48, clientX: 160, clientY: 220 });
    expect(container.querySelector(`[data-authored-node-id="${draft.nodeId}"]`)?.getAttribute('transform'))
      .toBe('translate(400 500) rotate(0) scale(1 1)');
    expect(onAuthoredGestureCommit).not.toHaveBeenCalled();
  });

  test('an interior handle overlap does not bypass an authored position lock', () => {
    const draft = authoredNode({
      nodeId: 'draft:00000000-0000-4000-8000-000000000045', sourceRef: null,
      sourceNodeId: null, kind: 'shape', shape: 'rectangle', name: 'Locked tiny card',
      position: [120, 220], size: [4, 4], pathPosition: [0, 0],
      transformLocks: { position: 'Animated position is not directly editable.' },
    });
    const onAuthoredGestureCommit = mock(() => {});
    installAuthoredElementBounds({ left: 100, top: 200, right: 104, bottom: 204 });
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[layer]} compId={1} fonts={[]} disabled={false}
        onSelect={() => {}} onEdit={() => {}} selectedNodeId={draft.nodeId}
        authoredNodes={[draft]} authoredNodeIds={[draft.nodeId]}
        onAuthoredGestureCommit={onAuthoredGestureCommit}
      />,
    );
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    Object.defineProperty(container.querySelector('svg'), 'getScreenCTM', {
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    });
    const eastHandle = container.querySelector('[data-canvas-handle="e"]')!;
    fireEvent.pointerDown(eastHandle, { button: 0, pointerId: 47, clientX: 102, clientY: 202 });
    fireEvent.pointerMove(canvas, { pointerId: 47, clientX: 105, clientY: 206 });
    fireEvent.pointerUp(canvas, { pointerId: 47, clientX: 105, clientY: 206 });
    expect(onAuthoredGestureCommit).not.toHaveBeenCalled();
  });

  test('canvas context menu exposes the current selected draft actions', async () => {
    const nodeId = 'draft:00000000-0000-4000-8000-000000000006';
    const onDuplicateNode = mock(() => {});
    const onDeleteNode = mock(() => {});
    render(
      <TemplateLayerPreview
        markup={markup} layers={[]} compId={1} fonts={[]} disabled={false}
        onSelect={() => {}} onEdit={() => {}} selectedNodeId={nodeId}
        authoredNodes={[authoredNode({ nodeId, sourceRef: null, sourceNodeId: null, kind: 'text', textContent: 'Draft' })]}
        authoredNodeIds={[nodeId]}
        onDuplicateNode={onDuplicateNode} onDeleteNode={onDeleteNode}
      />,
    );
    fireEvent.contextMenu(screen.getByRole('application', { name: 'Interactive template preview' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate selected layer' }));
    expect(onDuplicateNode).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(screen.getByRole('application', { name: 'Interactive template preview' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete selected layer' }));
    expect(onDeleteNode).toHaveBeenCalledTimes(1);
  });

  test('arrow keys move the selected layer; modified keys and locked positions cannot write', () => {
    const onEdit = mock(() => {});
    const props = {
      markup,
      compId: 1,
      layers: [layer],
      layer,
      fonts: [],
      disabled: false,
      onSelect: mock(() => {}),
      onEdit,
    };
    const { rerender } = render(<TemplateLayerPreview {...props} />);
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(onEdit).toHaveBeenLastCalledWith(
      layer,
      { position: [101, 200] },
      'canvas:nudge:1',
      true,
    );
    fireEvent.keyDown(canvas, { key: 'ArrowDown', shiftKey: true });
    expect(onEdit).toHaveBeenLastCalledWith(
      layer,
      { position: [100, 210] },
      'canvas:nudge:2',
      true,
    );
    fireEvent.keyDown(canvas, { key: 'ArrowUp', ctrlKey: true });
    const locked = { ...layer, transformLocks: { position: 'Animated position' } };
    rerender(<TemplateLayerPreview {...props} layers={[locked]} layer={locked} />);
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  test('right click opens the canonical context menu and its controls action opens the inspector', async () => {
    const onEdit = mock(() => {});
    const onSelect = mock(() => {});
    const { container } = render(
      <TemplateLayerPreview
        markup={markup}
        layers={[layer]}
        compId={1}
        layer={layer}
        fonts={[]}
        disabled={false}
        onSelect={onSelect}
        onEdit={onEdit}
      />,
    );
    fireEvent.contextMenu(container.querySelector('rect')!);
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    expect(onSelect).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Layer controls' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Layer controls' })).toBeTruthy(),
    );
    expect(screen.getByLabelText('Position X')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close layer controls' }));
    expect(screen.getByRole('dialog', { name: 'Layer controls' }).hasAttribute('data-closed')).toBe(
      true,
    );
  });

  test('finishing a drag commits its last position and keeps the canvas clear of popovers', () => {
    const onEdit = mock(() => {});
    const { container } = render(
      <TemplateLayerPreview
        markup={markup}
        layers={[layer]}
        compId={1}
        layer={layer}
        fonts={[]}
        disabled={false}
        onSelect={mock(() => {})}
        onEdit={onEdit}
      />,
    );
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    Object.assign(canvas, { setPointerCapture: mock(() => {}), hasPointerCapture: () => false });
    Object.defineProperty(container.querySelector('svg'), 'getScreenCTM', {
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1 }) }),
    });
    fireEvent.pointerDown(container.querySelector('rect')!, {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 40 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 30, clientY: 40 });
    expect(onEdit).toHaveBeenLastCalledWith(layer, { position: [120, 230] }, 'canvas:move:1', true);
    expect(screen.queryByRole('dialog', { name: 'Layer controls' })).toBeNull();
  });

  test('a small selected source layer intercepted by a resize handle still moves through snapping', async () => {
    const moving = { ...layer, position: [100, 200] as [number, number] };
    const target = { ...layer, layerId: 2, name: 'Snap target', index: 1, position: [110, 200] as [number, number] };
    const markup = '<svg viewBox="0 0 400 300"><g data-layer-id="1"><rect width="4" height="4"/></g><g data-layer-id="2"><rect width="10" height="10"/></g></svg>';
    const onGestureCommit = mock(() => {});
    installLayerBounds({
      1: { left: 100, top: 200, right: 104, bottom: 204 },
      2: { left: 110, top: 200, right: 120, bottom: 210 },
    });
    const { container } = render(
      <TemplateLayerPreview
        markup={markup} layers={[moving, target]} compId={1} layer={moving}
        fonts={[]} disabled={false} onSelect={() => {}} onEdit={() => {}}
        onGestureCommit={onGestureCommit}
      />,
    );
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    Object.assign(canvas, { setPointerCapture: mock(() => {}), hasPointerCapture: () => false });
    Object.defineProperty(container.querySelector('svg'), 'getScreenCTM', {
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }),
    });
    await waitFor(() => expect(container.querySelector('[data-canvas-handle="e"]')).toBeTruthy());
    const eastHandle = container.querySelector('[data-canvas-handle="e"]')!;
    fireEvent.pointerDown(eastHandle, { button: 0, pointerId: 46, clientX: 102, clientY: 202 });
    expect(document.activeElement).toBe(canvas);
    fireEvent.pointerMove(canvas, { pointerId: 46, clientX: 107, clientY: 202 });
    fireEvent.pointerUp(canvas, { pointerId: 46, clientX: 107, clientY: 202 });
    expect(onGestureCommit).toHaveBeenCalledWith({
      edits: [{ compId: 1, layerId: 1, position: [106, 200] }],
      selectionIds: [1],
      group: 'canvas:move:1',
    });
  });

  test('canvas drag emits one complete history packet after the final pointer position', () => {
    const onEdit = mock(() => {});
    const originalRaf = window.requestAnimationFrame;
    const originalGlobalRaf = globalThis.requestAnimationFrame;
    let queued: FrameRequestCallback | undefined;
    window.requestAnimationFrame = (callback) => {
      queued = callback;
      return 1;
    };
    globalThis.requestAnimationFrame = window.requestAnimationFrame;
    try {
      const { container } = render(
        <TemplateLayerPreview
          markup={markup}
          layers={[layer]}
          compId={1}
          layer={layer}
          fonts={[]}
          disabled={false}
          onSelect={mock(() => {})}
          onEdit={onEdit}
        />,
      );
      const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
      Object.assign(canvas, { setPointerCapture: mock(() => {}), hasPointerCapture: () => false });
      Object.defineProperty(container.querySelector('svg'), 'getScreenCTM', {
        value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1 }) }),
      });
      fireEvent.pointerDown(container.querySelector('rect')!, {
        button: 0,
        pointerId: 7,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(canvas, { pointerId: 7, clientX: 20, clientY: 20 });
      queued?.(16.7);
      expect(onEdit).not.toHaveBeenCalled();
      fireEvent.pointerMove(canvas, { pointerId: 7, clientX: 35, clientY: 45 });
      fireEvent.pointerUp(canvas, { pointerId: 7, clientX: 35, clientY: 45 });
      expect(onEdit).toHaveBeenLastCalledWith(
        layer,
        { position: [125, 235] },
        'canvas:move:1',
        true,
      );
    } finally {
      window.requestAnimationFrame = originalRaf;
      globalThis.requestAnimationFrame = originalGlobalRaf;
    }
  });

  test('multi-selection drag commits every static UID once through one completed gesture callback', () => {
    const second: TemplateEditableLayer = {
      ...layer,
      layerId: 2,
      name: 'Second',
      position: [150, 250],
      index: 1,
    };
    const onGestureCommit = mock(() => {});
    const onEdit = mock(() => {});
    const markup =
      '<svg viewBox="0 0 400 300"><g data-layer-id="1"><rect width="30" height="40"/></g><g data-layer-id="2"><rect x="50" y="50" width="30" height="40"/></g></svg>';
    const { container } = render(
      <TemplateLayerPreview
        markup={markup}
        layers={[layer, second]}
        compId={1}
        fonts={[]}
        disabled={false}
        onSelect={mock(() => {})}
        onEdit={onEdit}
        onGestureCommit={onGestureCommit}
      />,
    );
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    Object.assign(canvas, { setPointerCapture: mock(() => {}), hasPointerCapture: () => false });
    Object.defineProperty(container.querySelector('svg'), 'getScreenCTM', {
      value: () => ({ inverse: () => ({ a: 1, b: 0, c: 0, d: 1 }) }),
    });
    fireEvent.pointerDown(container.querySelector('[data-layer-id="1"] rect')!, {
      button: 0,
      pointerId: 1,
      clientX: 5,
      clientY: 5,
    });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerDown(container.querySelector('[data-layer-id="2"] rect')!, {
      button: 0,
      shiftKey: true,
      pointerId: 2,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 30, clientY: 35 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 30, clientY: 35 });
    expect(onGestureCommit).toHaveBeenCalledTimes(1);
    expect(onGestureCommit.mock.calls[0][0]).toEqual({
      edits: [
        { compId: 1, layerId: 1, position: [120, 225] },
        { compId: 1, layerId: 2, position: [170, 275] },
      ],
      selectionIds: [1, 2],
      group: 'canvas:move:1',
    });
    expect(onEdit).not.toHaveBeenCalled();
  });

  test('canvas duplicate and delete shortcuts invoke the same selected-node actions and respect input focus', () => {
    const duplicate = mock(() => {});
    const remove = mock(() => {});
    const props = { markup, layers: [layer], compId: 1, layer, fonts: [],
      selectedNodeId: 'aep:1:1', onSelect: mock(() => {}), onEdit: mock(() => {}),
      onDuplicateNode: duplicate, onDeleteNode: remove };
    const view = render(<TemplateLayerPreview {...props} disabled={false} />);
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    fireEvent.keyDown(canvas, { key: 'd', ctrlKey: true });
    fireEvent.keyDown(canvas, { key: 'Delete' });
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    const input = document.createElement('input');
    canvas.append(input);
    fireEvent.keyDown(input, { key: 'Backspace' });
    fireEvent.keyDown(canvas, { key: 'Delete', repeat: true });
    expect(remove).toHaveBeenCalledTimes(1);
    view.rerender(<TemplateLayerPreview {...props} disabled />);
    fireEvent.keyDown(canvas, { key: 'd', metaKey: true });
    fireEvent.keyDown(canvas, { key: 'Delete' });
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('zoom controls are labeled and reset to the fitted canvas', () => {
    render(
      <TemplateLayerPreview
        markup={markup}
        layers={[layer]}
        compId={1}
        layer={layer}
        fonts={[]}
        disabled={false}
        onSelect={mock(() => {})}
        onEdit={mock(() => {})}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('120%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset canvas view' }));
    expect(screen.getByText('100%')).toBeTruthy();
  });
});
