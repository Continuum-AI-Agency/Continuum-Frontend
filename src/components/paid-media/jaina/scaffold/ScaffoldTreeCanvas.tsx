'use client';

import { MarkerType, MiniMap, Panel, ReactFlowProvider } from '@xyflow/react';
import * as React from 'react';
import { Canvas } from '@/components/ai-elements/canvas';
import { Controls } from '@/components/ai-elements/controls';
import { layoutScaffoldTree } from '@/lib/paid-media/scaffoldLayout';
import type { ScaffoldTree } from '@/lib/paid-media/scaffoldTree';
import { SCAFFOLD_NODE_TYPES } from './ScaffoldFlowNodes';

/**
 * The scaffold hierarchy as a graph. Read-only: nothing drags, nothing connects.
 *
 * Edges are React Flow's built-in 'smoothstep' rather than ai-elements' Edge.Animated,
 * which imports the Campaign Canvas zustand store — using it here would couple a
 * read-only Jaina card to the campaign BUILDER's global state.
 *
 * Selection is lifted: the canvas and the table share one `selectedPathKey`, and node
 * ids ARE path keys, so the two views need no translation layer between them.
 */
export function ScaffoldTreeCanvas({
  tree,
  selectedPathKey,
  onSelect,
}: {
  tree: ScaffoldTree;
  selectedPathKey?: string | null;
  onSelect?: (pathKey: string) => void;
}) {
  // Recomputed only when the merged tree identity changes — not per progress frame,
  // because buildScaffoldTree is itself memoized on (rows, overlay).
  const layout = React.useMemo(() => layoutScaffoldTree(tree), [tree]);

  const nodes = React.useMemo(
    () =>
      layout.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedPathKey,
        draggable: false,
      })),
    [layout.nodes, selectedPathKey],
  );

  return (
    <ReactFlowProvider>
      <Canvas
        nodes={nodes}
        edges={layout.edges}
        nodeTypes={SCAFFOLD_NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        panOnDrag
        selectionOnDrag={false}
        onNodeClick={(_event, node) => onSelect?.(node.id)}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed },
        }}
        minZoom={0.08}
        fitView
        fitViewOptions={{ padding: 0.15 }}
      >
        <Controls showInteractive={false} />
        <MiniMap zoomable pannable className="!bg-background rounded-md border shadow-sm" />
        <Panel position="top-left">
          <div className="rounded-md border bg-background/90 px-2.5 py-1.5 text-xs shadow-sm">
            <span className="font-medium">{tree.counts.adSets}</span> ad sets ·{' '}
            <span className="font-medium">{tree.counts.ads}</span> ads ·{' '}
            <span className="font-medium">{tree.counts.created}</span> created
            {tree.counts.failed > 0 ? (
              <>
                {' '}
                · <span className="font-medium text-destructive">{tree.counts.failed}</span> failed
              </>
            ) : null}
          </div>
        </Panel>
      </Canvas>
    </ReactFlowProvider>
  );
}
