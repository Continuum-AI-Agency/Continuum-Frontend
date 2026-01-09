import React, { useCallback, useRef, useEffect } from 'react';
import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider, useReactFlow, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../stores/useStudioStore';
import { NanoGenNode } from '../nodes/NanoGenNode';
import { VeoDirectorNode } from '../nodes/VeoDirectorNode';
import { StringNode } from '../nodes/StringNode';
import { Toolbar } from './Toolbar';
import { v4 as uuidv4 } from 'uuid';

const nodeTypes = {
  nanoGen: NanoGenNode,
  veoDirector: VeoDirectorNode,
  string: StringNode,
};

function Flow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, setEdges } = useStudioStore();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, deleteElements } = useReactFlow();

  // Keyboard deletion handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Find selected nodes and edges
        const selectedNodes = nodes.filter(node => node.selected);
        const selectedEdges = edges.filter(edge => edge.selected);
        
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
           deleteElements({ nodes: selectedNodes, edges: selectedEdges });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, deleteElements]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let data: any = { label: `New ${type}` };

      if (type === 'nanoGen') {
          data = { model: 'nano-banana', positivePrompt: '', negativePrompt: '', aspectRatio: '1:1' };
      } else if (type === 'veoDirector') {
          data = { model: 'veo-3.1', prompt: '', enhancePrompt: false };
      } else if (type === 'string') {
          data = { value: '' };
      }

      const newNode = {
        id: uuidv4(),
        type,
        position,
        data,
      };

      setNodes(nodes.concat(newNode as any));
    },
    [screenToFlowPosition, nodes, setNodes],
  );

  return (
    <div className="w-full h-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
        className="bg-slate-50 dark:bg-slate-900"
      >
        <Background color="#94a3b8" gap={16} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

interface StudioCanvasProps {
  embedded?: boolean;
}

export function StudioCanvas({ embedded = false }: StudioCanvasProps) {
  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col bg-background">
        {!embedded && (
            <header className="h-14 border-b px-4 flex items-center justify-between bg-background z-10">
                <div className="font-bold text-lg flex items-center gap-2">
                <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Continuum</span>
                <span className="text-muted-foreground font-normal">Studio</span>
                </div>
                <Toolbar />
            </header>
        )}
        <div className="flex-1 flex overflow-hidden">
            {/* Sidebar - In embedded mode, maybe we want to keep it or allow it to be collapsed? 
                For now, let's keep it as it contains the drag sources specific to this canvas. 
                If embedded, we might want to style it differently or put it in a different container.
            */}
            <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col gap-4 overflow-y-auto z-10">
                <div className="font-medium text-sm text-muted-foreground flex justify-between items-center">
                    Library
                    {embedded && <div className="scale-75 origin-right"><Toolbar /></div>}
                </div>
                <div 
                    className="p-3 border rounded bg-background cursor-grab hover:border-indigo-500 transition-colors shadow-sm"
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('application/reactflow', 'nanoGen')}
                >
                    <div className="font-medium">Nano Gen</div>
                    <div className="text-xs text-muted-foreground">Image Generator</div>
                </div>
                <div 
                    className="p-3 border rounded bg-background cursor-grab hover:border-purple-500 transition-colors shadow-sm"
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('application/reactflow', 'veoDirector')}
                >
                    <div className="font-medium">Veo Director</div>
                    <div className="text-xs text-muted-foreground">Video Generator</div>
                </div>
                 <div 
                    className="p-3 border rounded bg-background cursor-grab hover:border-slate-500 transition-colors shadow-sm"
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('application/reactflow', 'string')}
                >
                    <div className="font-medium">String</div>
                    <div className="text-xs text-muted-foreground">Text Helper</div>
                </div>
            </aside>
            <main className="flex-1 relative bg-slate-50 dark:bg-slate-950">
                <Flow />
            </main>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
