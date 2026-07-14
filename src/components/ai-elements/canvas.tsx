import type { ReactFlowProps } from '@xyflow/react';
import { Background, ReactFlow } from '@xyflow/react';
import type { ComponentProps, ReactNode } from 'react';
import '@xyflow/react/dist/style.css';

type CanvasProps = ReactFlowProps & {
  children?: ReactNode;
  backgroundProps?: Partial<ComponentProps<typeof Background>>;
};

const deleteKeyCode = ['Backspace', 'Delete'];

export const Canvas = ({ children, backgroundProps, proOptions, ...props }: CanvasProps) => (
  <ReactFlow
    deleteKeyCode={deleteKeyCode}
    fitView
    panOnDrag={false}
    panOnScroll
    selectionOnDrag={true}
    zoomOnDoubleClick={false}
    {...props}
    proOptions={{ ...proOptions, hideAttribution: true }}
  >
    <Background color="var(--studio-grid-dot)" gap={16} {...backgroundProps} />
    {children}
  </ReactFlow>
);
