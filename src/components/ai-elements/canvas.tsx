import type { Edge, Node, ReactFlowProps } from '@xyflow/react';
import { Background, ReactFlow } from '@xyflow/react';
import type { ComponentProps, ReactNode } from 'react';
import '@xyflow/react/dist/style.css';

type CanvasProps<NodeType extends Node = Node, EdgeType extends Edge = Edge> = ReactFlowProps<
  NodeType,
  EdgeType
> & {
  children?: ReactNode;
  backgroundProps?: Partial<ComponentProps<typeof Background>>;
};

const deleteKeyCode = ['Backspace', 'Delete'];

export function Canvas<NodeType extends Node = Node, EdgeType extends Edge = Edge>({
  children,
  backgroundProps,
  proOptions,
  ...props
}: CanvasProps<NodeType, EdgeType>) {
  return (
    <ReactFlow
      deleteKeyCode={deleteKeyCode}
      fitView
      panOnDrag={false}
      panOnScroll
      selectionOnDrag={true}
      nodesFocusable
      edgesFocusable
      elementsSelectable
      zoomOnDoubleClick={false}
      {...props}
      proOptions={{ ...proOptions, hideAttribution: true }}
    >
      <Background color="var(--studio-grid-dot)" gap={16} {...backgroundProps} />
      {children}
    </ReactFlow>
  );
}
