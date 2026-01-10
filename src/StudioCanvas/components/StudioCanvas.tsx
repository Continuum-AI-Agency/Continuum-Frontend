import React, { useCallback, useRef, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider, useReactFlow, Panel, Node, Connection, Edge, SelectionMode } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../stores/useStudioStore';
import { StringNode } from '../nodes/StringNode';
import { ImageGenBlock } from '../nodes/ImageGenBlock';
import { VideoGenBlock } from '../nodes/VideoGenBlock';
import { ImageNode } from '../nodes/ImageNode';
import { VideoReferenceNode } from '../nodes/VideoReferenceNode';
import { Toolbar } from './Toolbar';
import { Badge } from '@/components/ui/badge';
import { v4 as uuidv4 } from 'uuid';
import { ButtonEdge, DataTypeEdge } from '../edges';
import { useEdgeDropNode } from '../hooks/useEdgeDropNode';
import { useProximityConnect } from '../hooks/useProximityConnect';
import CustomConnectionLine from './CustomConnectionLine';
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
    label: 'Image Generation',
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
     label: 'Image Reference',
     desc: 'Simple File Input',
     tag: 'Utility',
     borderColor: 'hover:border-indigo-400',
   },
   {
     type: 'video' as const,
     label: 'Video Reference',
     desc: 'Simple Video Input',
     tag: 'Utility',
     borderColor: 'hover:border-pink-400',
   },
];

const nodeTypes = {
  nanoGen: ImageGenBlock,
  veoDirector: VideoGenBlock,
  string: StringNode,
  image: ImageNode,
  video: VideoReferenceNode,
};

const edgeTypes = {
  button: ButtonEdge,
  dataType: DataTypeEdge,
};

function Flow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, setEdges, takeSnapshot, undo, redo, getNodeById } = useStudioStore();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, deleteElements } = useReactFlow();
  const { onConnectStart, onConnectEnd } = useEdgeDropNode();
  const { onNodeDrag, onNodeDragStop } = useProximityConnect();

  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    setMenu({
      id: 'pane',
      top: event.clientY,
      left: event.clientX,
    });
  }, []);

  const onPaneClick = useCallback(() => {
    setMenu(null);
  }, []);

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
      let style = {};

      if (type === 'nanoGen') {
          data = { model: 'nano-banana', positivePrompt: '', aspectRatio: '1:1' };
          style = { width: 400, height: 400 };
      } else if (type === 'veoDirector') {
           data = { model: 'veo-3.1', prompt: '', negativePrompt: '', enhancePrompt: false };
          style = { width: 512, height: 288 }; // 16:9
      } else if (type === 'string') {
          data = { value: '' };
       } else if (type === 'image') {
           data = { image: undefined };
       } else if (type === 'video') {
           data = { video: undefined };
       }

      const newNode = {
        id: uuidv4(),
        type,
        position,
        data,
        style,
      };

      setNodes(nodes.concat(newNode as any));
    },
    [screenToFlowPosition, nodes, setNodes],
  );

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const target = connection.target;
    const source = connection.source;
    const targetHandle = connection.targetHandle;

    const sourceNode = getNodeById(source);
    const targetNode = getNodeById(target);

    if (!sourceNode || !targetNode) return false;

    // Check handle compatibility
    if (sourceNode.type === 'string') {
        if (!['prompt', 'negative', 'prompt-in'].includes(targetHandle || '')) return false;
    } else if (sourceNode.type === 'image') {
        // Image reference nodes can only connect to generation nodes, not to other reference nodes
        if (!['ref-image', 'first-frame', 'last-frame', 'ref-video'].includes(targetHandle || '')) return false;
        // Prevent image nodes from connecting to other image nodes
        if (targetNode.type === 'image' || targetNode.type === 'video') return false;
    } else if (sourceNode.type === 'video') {
        // Video reference nodes can only connect to generation nodes
        if (!['ref-video', 'first-frame', 'last-frame'].includes(targetHandle || '')) return false;
        // Prevent video nodes from connecting to other video nodes
        if (targetNode.type === 'video') return false;
    } else if (sourceNode.type === 'nanoGen') {
        if (!['ref-image', 'first-frame', 'last-frame', 'ref-video'].includes(targetHandle || '')) return false;
    } else if (sourceNode.type === 'veoDirector') {
        if (!['ref-video'].includes(targetHandle || '')) return false;
    }

    // Special case: video nodes can accept ref-images connections
    if (targetNode.type === 'veoDirector' && targetHandle === 'ref-images') {
        if (sourceNode.type !== 'image') return false;
    }

    // Check connection limits based on target node type and handle
    if (targetNode.type === 'nanoGen' && targetHandle === 'ref-image') {
      // Nano Banana supports up to 14 reference images
      const existingRefImageConnections = edges.filter(
        edge => edge.target === target && edge.targetHandle === 'ref-image'
      ).length;
      if (existingRefImageConnections >= 14) return false;
    }

    if (targetNode.type === 'veoDirector') {
      if (targetHandle === 'first-frame') {
        // First frame: max 1 connection
        const existingConnections = edges.filter(
          edge => edge.target === target && edge.targetHandle === 'first-frame'
        ).length;
        if (existingConnections >= 1) return false;
      } else if (targetHandle === 'last-frame') {
        // Last frame: max 1 connection
        const existingConnections = edges.filter(
          edge => edge.target === target && edge.targetHandle === 'last-frame'
        ).length;
        if (existingConnections >= 1) return false;
      } else if (targetHandle === 'ref-video') {
        // Reference video: max 1 connection
        const existingConnections = edges.filter(
          edge => edge.target === target && edge.targetHandle === 'ref-video'
        ).length;
        if (existingConnections >= 1) return false;
      } else if (targetHandle === 'ref-images') {
        // Reference images: max 3 connections
        const existingConnections = edges.filter(
          edge => edge.target === target && edge.targetHandle === 'ref-images'
        ).length;
        if (existingConnections >= 3) return false;
      }
    }

    return true;
  }, [getNodeById, edges]);

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
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd as any}
        onNodeDrag={onNodeDrag as any}
        onNodeDragStop={onNodeDragStop as any}
        isValidConnection={isValidConnection}
        connectionLineComponent={CustomConnectionLine}
        onPaneContextMenu={onPaneContextMenu}
        fitView
        panOnDrag={true}
        panOnScroll={true}
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        className="bg-slate-50 dark:bg-slate-900"
        defaultEdgeOptions={{
          type: 'bezier',
          animated: true,
        }}
      >
        <Background color="#94a3b8" gap={16} />
        {menu && <ContextMenu onClick={onPaneClick} {...menu} />}
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
