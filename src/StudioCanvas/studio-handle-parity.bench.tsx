/**
 * studio-handle-parity-bench — proves the handle a video-generator node DRAWS is the
 * handle the graph ACCEPTS AND STORES, for every model x reference mode.
 *
 * The Veo 3.1 reference-image bug was invisible to every existing test because each
 * one asserted against the canonical handle id directly. The node had started
 * rendering the OTHER member of the `ref-image` / `ref-images` alias pair, the store's
 * legacy remap rewrote incoming edges back to the canonical id, and React Flow was
 * left holding an edge pointed at a handle absent from the DOM — so it never drew.
 * Store state looked correct the whole time.
 *
 * This bench closes that gap by reading the handle ids out of the REAL rendered
 * component and round-tripping each one through the REAL store, so a divergence
 * between what is drawn and what is kept fails here instead of in the field.
 *
 * Runs under `bun test` for the happy-dom preload in bunfig.toml.
 */
import { describe, expect, it } from 'bun:test';
import {
  getAllowedTargetHandles,
  getImageVariationHandleId,
  getVideoGeneratorReferenceModes,
  resolveVideoGeneratorModel,
  resolveVideoGeneratorReferenceMode,
  variationIndexFromHandle,
  VIDEO_GENERATOR_MODELS,
  type VideoGeneratorModel,
  type VideoGeneratorReferenceMode,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { ImageGenBlock } from './nodes/ImageGenBlock';
import { VideoGenBlock } from './nodes/VideoGenBlock';
import { useStudioStore } from './stores/useStudioStore';
import type { NanoGenNodeData, VideoGenNodeData } from './types';

interface Lane {
  readonly label: string;
  readonly nodeType: string;
  readonly data: Record<string, unknown>;
}

const lanes: Lane[] = [];
for (const model of VIDEO_GENERATOR_MODELS) {
  for (const mode of getVideoGeneratorReferenceModes(model)) {
    lanes.push({
      label: `${model} / ${mode}`,
      nodeType: 'videoGen',
      data: { model, referenceMode: mode },
    });
  }
}
// Legacy node types carry no data.model — the type IS the model. They render through
// the same component, so they must resolve to the same handles the store allows.
lanes.push({ label: 'veoDirector (legacy, no data.model)', nodeType: 'veoDirector', data: {} });
lanes.push({ label: 'veoFast (legacy, no data.model)', nodeType: 'veoFast', data: {} });

function renderedTargetHandleIds(lane: Lane): string[] {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ReactFlowProvider>
          <VideoGenBlock
            id="vid1"
            type={lane.nodeType}
            data={lane.data as unknown as VideoGenNodeData}
            selected={false}
            zIndex={0}
            isConnectable
            positionAbsoluteX={0}
            positionAbsoluteY={0}
            dragging={false}
            draggable
            selectable
            deletable
          />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

  const ids = Array.from(container.querySelectorAll('[data-handleid]'))
    .filter((el) => el.getAttribute('data-handlepos') === 'left')
    .map((el) => el.getAttribute('data-handleid') ?? '');

  cleanup();
  return ids.filter(Boolean);
}

/** Seeds an image source + the video node, connects one edge, returns the stored edges. */
function connectThroughStore(lane: Lane, targetHandle: string) {
  useStudioStore.setState({ nodes: [], edges: [] });
  useStudioStore.getState().setNodes([
    { id: 'img1', position: { x: 0, y: 0 }, data: {}, type: 'image' },
    { id: 'vid1', position: { x: 0, y: 0 }, data: lane.data, type: lane.nodeType },
    // biome-ignore lint/suspicious/noExplicitAny: StudioNode['type'] is a closed union; the lane matrix is the point
  ] as any);
  useStudioStore.getState().setEdges([
    {
      id: `e-${targetHandle}`,
      source: 'img1',
      sourceHandle: 'image',
      target: 'vid1',
      targetHandle,
      type: 'dataType',
    },
  ]);
  return useStudioStore.getState().edges;
}

const IMAGE_REFERENCE_HANDLES = new Set(['ref-image', 'ref-images']);
const IMAGE_ACCEPTING_HANDLES = new Set([...IMAGE_REFERENCE_HANDLES, 'first-frame', 'last-frame']);

describe('studio handle parity — rendered handles are the handles the graph keeps', () => {
  it('renders only handles the graph allows, and keeps every image edge dropped on them', () => {
    const failures: string[] = [];
    const rows: string[] = [];

    for (const lane of lanes) {
      const rendered = renderedTargetHandleIds(lane);
      const node = { id: 'vid1', type: lane.nodeType, data: lane.data };
      const allowed = getAllowedTargetHandles(node);

      if (rendered.length === 0) {
        failures.push(`${lane.label}: rendered NO target handles`);
        continue;
      }

      for (const handle of rendered) {
        if (!allowed.includes(handle)) {
          failures.push(
            `${lane.label}: renders '${handle}' which is not allowed [${allowed.join(', ')}]`,
          );
        }
      }

      // Exactly one of the alias pair may be drawn — drawing both makes the second
      // one unreachable and drawing neither strands an image-mode node.
      const drawnAliases = rendered.filter((h) => IMAGE_REFERENCE_HANDLES.has(h));
      if (drawnAliases.length > 1) {
        failures.push(`${lane.label}: renders BOTH aliases [${drawnAliases.join(', ')}]`);
      }

      for (const handle of rendered.filter((h) => IMAGE_ACCEPTING_HANDLES.has(h))) {
        const edges = connectThroughStore(lane, handle);
        if (edges.length !== 1) {
          failures.push(`${lane.label}: edge dropped on rendered handle '${handle}'`);
          continue;
        }
        if (edges[0].targetHandle !== handle) {
          failures.push(
            `${lane.label}: edge dropped on '${handle}' was rewritten to '${edges[0].targetHandle}' — no such handle in the DOM`,
          );
        }
      }

      rows.push(`  ${lane.label.padEnd(38)} → ${rendered.join(', ')}`);
    }

    console.log('\nRendered target handles per lane:');
    for (const row of rows) console.log(row);
    if (failures.length > 0)
      console.error(`\n${failures.length} parity failure(s):\n  ${failures.join('\n  ')}`);

    expect(failures).toEqual([]);
  });

  it('a legacy node resolves the same model in the component and in the store', () => {
    for (const lane of lanes.filter((l) => l.nodeType !== 'videoGen')) {
      const node = { type: lane.nodeType, data: lane.data };
      const rendered = renderedTargetHandleIds(lane);

      // The component derives its rail from the node's own type + data; the store
      // derives the allowed set the same way. Hardcoding 'videoGen' in the component
      // made a legacy node draw a rail the store then refused.
      expect(rendered.sort()).toEqual(
        getAllowedTargetHandles({ id: 'vid1', ...node })
          .filter((h) => h !== 'prompt' && h !== 'ref-image')
          .sort(),
      );
      expect(resolveVideoGeneratorModel(node)).toBe(
        lane.nodeType === 'veoDirector' ? 'veo-3.1' : ('veo-3.1-fast' as VideoGeneratorModel),
      );
    }
  });

  it('switching between the two Veo models keeps a wired frames-mode node intact', () => {
    const startMode: VideoGeneratorReferenceMode = 'frames';
    useStudioStore.setState({ nodes: [], edges: [] });
    useStudioStore.getState().setNodes([
      { id: 'img1', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      { id: 'img2', position: { x: 0, y: 0 }, data: {}, type: 'image' },
      {
        id: 'vid1',
        position: { x: 0, y: 0 },
        data: { model: 'veo-3.1-fast', referenceMode: startMode },
        type: 'videoGen',
      },
      // biome-ignore lint/suspicious/noExplicitAny: see above
    ] as any);
    useStudioStore.getState().setEdges([
      {
        id: 'e1',
        source: 'img1',
        sourceHandle: 'image',
        target: 'vid1',
        targetHandle: 'first-frame',
      },
      {
        id: 'e2',
        source: 'img2',
        sourceHandle: 'image',
        target: 'vid1',
        targetHandle: 'last-frame',
      },
    ]);
    expect(useStudioStore.getState().edges).toHaveLength(2);

    // What handleModelChange now writes: the mode carries over because veo-3.1 supports it.
    const legal = getVideoGeneratorReferenceModes('veo-3.1');
    const nextMode = legal.includes(startMode) ? startMode : legal[0];
    expect(nextMode).toBe(startMode);

    useStudioStore.getState().updateNode('vid1', (node) => ({
      ...node,
      data: { ...node.data, model: 'veo-3.1', referenceMode: nextMode },
    }));
    useStudioStore.getState().setEdges(useStudioStore.getState().edges);

    expect(useStudioStore.getState().edges).toHaveLength(2);
    expect(
      resolveVideoGeneratorReferenceMode(
        useStudioStore.getState().nodes.find((n) => n.id === 'vid1') as { data: object },
      ),
    ).toBe('frames');
  });
});

/**
 * Same law, source side: the variation handles an image node DRAWS must be the
 * handles `normalizeEdges` KEEPS.
 *
 * `getAllowedSourceHandles` used to return exactly `['image']` for nanoGen, and
 * normalizeEdges DROPS any edge whose source handle is outside that set — with
 * only a console.warn. So an `image-2` edge would vanish from the graph while the
 * node happily rendered a handle for it. That is the invisible-edge failure the
 * video half of this bench exists to catch, arrived at from the other direction.
 */
function renderedSourceHandleIds(data: Partial<NanoGenNodeData>): string[] {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ReactFlowProvider>
          <ImageGenBlock
            id="gen1"
            type="nanoGen"
            data={data as NanoGenNodeData}
            selected={false}
            zIndex={0}
            isConnectable
            positionAbsoluteX={0}
            positionAbsoluteY={0}
            dragging={false}
            draggable
            selectable
            deletable
          />
        </ReactFlowProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );

  const ids = Array.from(container.querySelectorAll('[data-handleid]'))
    .filter((el) => el.getAttribute('data-handlepos') === 'right')
    .map((el) => el.getAttribute('data-handleid') ?? '');

  cleanup();
  return ids.filter(Boolean);
}

const imageNode = (data: Partial<NanoGenNodeData>) => ({
  id: 'gen1',
  position: { x: 0, y: 0 },
  type: 'nanoGen',
  data,
});

describe('studio handle parity — image variation handles survive the store', () => {
  const baseData: Partial<NanoGenNodeData> = {
    model: 'nano-banana',
    positivePrompt: 'a cat',
    aspectRatio: '1:1',
  };

  it('draws one source handle per requested variation', () => {
    expect(renderedSourceHandleIds({ ...baseData, variationCount: 1 })).toEqual(['image']);
    expect(renderedSourceHandleIds({ ...baseData, variationCount: 4 })).toEqual([
      'image',
      'image-1',
      'image-2',
      'image-3',
    ]);
    // No variationCount at all is the pre-variation graph: one bare `image` handle.
    expect(renderedSourceHandleIds(baseData)).toEqual(['image']);
  });

  it('keeps an edge on every handle it drew', () => {
    const drawn = renderedSourceHandleIds({ ...baseData, variationCount: 4 });

    useStudioStore.setState({ nodes: [], edges: [] });
    useStudioStore.getState().setNodes([
      imageNode({ ...baseData, variationCount: 4 }),
      { id: 'consumer', position: { x: 400, y: 0 }, type: 'nanoGen', data: baseData },
      // biome-ignore lint/suspicious/noExplicitAny: StudioNode['type'] is a closed union; the matrix is the point
    ] as any);
    useStudioStore.getState().setEdges(
      drawn.map((sourceHandle, index) => ({
        id: `e-${sourceHandle}`,
        source: 'gen1',
        sourceHandle,
        target: 'consumer',
        targetHandle: 'ref-image',
        type: 'dataType',
      })),
    );

    const kept = useStudioStore.getState().edges;
    expect(kept.map((edge) => edge.sourceHandle)).toEqual(drawn);
  });

  it('rejects a handle beyond the variation ceiling instead of silently keeping it', () => {
    useStudioStore.setState({ nodes: [], edges: [] });
    useStudioStore.getState().setNodes([
      imageNode({ ...baseData, variationCount: 4 }),
      { id: 'consumer', position: { x: 400, y: 0 }, type: 'nanoGen', data: baseData },
      // biome-ignore lint/suspicious/noExplicitAny: StudioNode['type'] is a closed union; the matrix is the point
    ] as any);
    useStudioStore.getState().setEdges([
      {
        id: 'e-image-9',
        source: 'gen1',
        sourceHandle: 'image-9',
        target: 'consumer',
        targetHandle: 'ref-image',
        type: 'dataType',
      },
    ]);
    expect(useStudioStore.getState().edges).toHaveLength(0);
  });

  it('every drawn handle round-trips through the contract that names it', () => {
    const drawn = renderedSourceHandleIds({ ...baseData, variationCount: 4 });
    drawn.forEach((handleId, index) => {
      expect(handleId).toBe(getImageVariationHandleId(index));
      expect(variationIndexFromHandle(handleId)).toBe(index);
    });
  });
});
