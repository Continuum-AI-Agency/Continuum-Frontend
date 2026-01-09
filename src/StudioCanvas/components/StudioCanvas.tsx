import React, { useCallback, useRef, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider, useReactFlow, Panel, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../stores/useStudioStore';
import { TextNode } from '../nodes/TextGenBlock';
import { ImageGenBlock } from '../nodes/ImageGenBlock';
import { VideoGenBlock } from '../nodes/VideoGenBlock';
import { ImageNode } from '../nodes/ImageNode';
import { Toolbar } from './Toolbar';
import { Badge } from '@/components/ui/badge';
import { v4 as uuidv4 } from 'uuid';
import { ButtonEdge, DataTypeEdge } from '../edges';
import { useEdgeDropNode } from '../hooks/useEdgeDropNode';
import { ContextMenu } from './ContextMenu';

const DRAG_ITEMS = [
  {
    type: 'string' as const,
    label: 'Text Block',
    desc: 'LLM & Prompting',
    tag: 'Intelligence',
    borderColor: 'hover:border-slate-500',
  },
  {
    type: 'nanoGen' as const,
    label: 'Image Block',
    desc: 'Canvas & Generator',
    tag: 'Creative',
    borderColor: 'hover:border-indigo-500',
  },
  {
    type: 'veoDirector' as const,
    label: 'Video Block',
    desc: 'Director & Timeline',
    tag: 'Creative',
    borderColor: 'hover:border-purple-500',
  },
  {
    type: 'image' as const,
    label: 'Image Input',
    desc: 'Simple File Input',
    tag: 'Utility',
    borderColor: 'hover:border-indigo-400',
  },
];

const nodeTypes = {
  nanoGen: ImageGenBlock,
  veoDirector: VideoGenBlock,
  string: TextNode,
  image: ImageNode,
};

const edgeTypes = {
  button: ButtonEdge,
  dataType: DataTypeEdge,
};

function Flow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, setEdges, takeSnapshot, undo, redo } = useStudioStore();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, deleteElements } = useReactFlow();
  const { onConnectEnd, onReconnectStart, onReconnect, onReconnectEnd } = useEdgeDropNode();
  
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        event.preventDefault();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'y') {
        redo();
        event.preventDefault();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedNodes = nodes.filter(node => node.selected);
        const selectedEdges = edges.filter(edge => edge.selected);
        
        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
           takeSnapshot();
           deleteElements({ nodes: selectedNodes, edges: selectedEdges });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, deleteElements, undo, redo, takeSnapshot]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeDragStart = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;
      const pane = reactFlowWrapper.current.getBoundingClientRect();
      
      setMenu({
        id: node.id,
        top: event.clientY < pane.height - 200 ? event.clientY : event.clientY - 200,
        left: event.clientX < pane.width - 200 ? event.clientX : event.clientX - 200,
      });
    },
    [setMenu]
  );

  const onPaneClick = useCallback(() => setMenu(null), [setMenu]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      takeSnapshot();

      const type = event.dataTransfer.getData('application/reactflow');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      let data: Record<string, unknown> = { label: `New ${type}` };

      if (type === 'nanoGen') {
          data = { model: 'nano-banana', positivePrompt: '', negativePrompt: '', aspectRatio: '1:1' };
      } else if (type === 'veoDirector') {
          data = { model: 'veo-3.1', prompt: '', enhancePrompt: false };
      } else if (type === 'string') {
          data = { value: '' };
      } else if (type === 'image') {
          data = { image: undefined };
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
        edgeTypes={edgeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeDragStart={onNodeDragStart}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        onConnectEnd={onConnectEnd as any}
        onReconnectStart={onReconnectStart}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        fitView
        className="bg-slate-50 dark:bg-slate-900"
        defaultEdgeOptions={{
          type: 'bezier',
          animated: true,
        }}
      >
        <Background color="#94a3b8" gap={16} />
        <Controls />
        <MiniMap />
        {menu && <ContextMenu onClick={onPaneClick} {...menu} />}
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
            <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col gap-3 overflow-y-auto z-10">
                <div className="font-medium text-sm text-muted-foreground flex justify-between items-center">
                    Library
                    {embedded && <div className="scale-75 origin-right"><Toolbar /></div>}
                </div>
                {DRAG_ITEMS.map((item) => (
                  <div
                    key={item.type}
                    className={`p-3 border rounded bg-background cursor-grab ${item.borderColor} transition-colors shadow-sm`}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('application/reactflow', item.type)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-sm">{item.label}</div>
                      <Badge variant="secondary" className="text-xs">
                        {item.tag}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{item.desc}</div>
                  </div>
                ))}
            </aside>
            <main className="flex-1 relative bg-slate-50 dark:bg-slate-950">
                <Flow />
            </main>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
