import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider, useReactFlow, Connection, Edge, SelectionMode } from '@xyflow/react';
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
import { useToast } from '@/components/ui/ToastProvider';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { canAcceptSingleTextInput } from '../utils/connectionValidation';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDownIcon } from '@radix-ui/react-icons';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';
import { StudioNode } from '../types';

const LIBRARY_SECTIONS = [
  {
    value: 'generators',
    label: 'Generators',
    defaultOpen: true,
    items: [
      {
        type: 'nanoGen' as const,
        label: 'Image Generation',
        desc: 'Canvas & Generator',
        tag: 'Creative',
        borderColor: 'hover:border-[color:var(--edge-image)]',
      },
      {
        type: 'veoDirector' as const,
        label: 'Video Block',
        desc: 'Director & Timeline',
        tag: 'Creative',
        borderColor: 'hover:border-[color:var(--edge-video)]',
      },
    ],
  },
  {
    value: 'inputs',
    label: 'Inputs & References',
    defaultOpen: false,
    items: [
      {
        type: 'string' as const,
        label: 'Text Block',
        desc: 'LLM & Prompting',
        tag: 'Intelligence',
        borderColor: 'hover:border-[color:var(--edge-text)]',
      },
      {
        type: 'image' as const,
        label: 'Image Reference',
        desc: 'Simple File Input',
        tag: 'Utility',
        borderColor: 'hover:border-[color:var(--edge-image)]',
      },
      {
        type: 'video' as const,
        label: 'Video Reference',
        desc: 'Simple Video Input',
        tag: 'Utility',
        borderColor: 'hover:border-[color:var(--edge-video)]',
      },
    ],
  },
];

const DEFAULT_OPEN_LIBRARY_SECTIONS = LIBRARY_SECTIONS
  .filter((section) => section.defaultOpen)
  .map((section) => section.value);

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
  const { show } = useToast();

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
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }

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

  const readyNodeIds = useMemo(() => {
    const isGeneratorReady = (node: StudioNode) => {
      if (node.type === 'nanoGen') {
        const hasPromptEdge = edges.some(
          (edge) => edge.target === node.id && edge.targetHandle === 'prompt',
        );
        const promptValue =
          typeof (node.data as { positivePrompt?: string }).positivePrompt === 'string'
            ? (node.data as { positivePrompt?: string }).positivePrompt?.trim()
            : '';
        return hasPromptEdge || !!promptValue;
      }

      if (node.type === 'veoDirector') {
        const hasPromptEdge = edges.some(
          (edge) => edge.target === node.id && edge.targetHandle === 'prompt-in',
        );
        const promptValue =
          typeof (node.data as { prompt?: string }).prompt === 'string'
            ? (node.data as { prompt?: string }).prompt?.trim()
            : '';
        return hasPromptEdge || !!promptValue;
      }

      return false;
    };

    return new Set(nodes.filter(isGeneratorReady).map((node) => node.id));
  }, [nodes, edges]);

  const styledEdges = useMemo(() => {
    const nodeTypeById = new Map(nodes.map((node) => [node.id, node.type]));
    const resolveDataType = (edge: Edge) => {
      const dataType = (edge.data as { dataType?: string } | undefined)?.dataType;
      if (dataType === 'image' || dataType === 'video' || dataType === 'text') return dataType;
      if (edge.sourceHandle === 'image') return 'image';
      if (edge.sourceHandle === 'video') return 'video';
      return 'text';
    };

    const resolvePathType = (edge: Edge) => {
      const dataPathType = (edge.data as { pathType?: string } | undefined)?.pathType;
      if (dataPathType === 'bezier' || dataPathType === 'straight' || dataPathType === 'step' || dataPathType === 'smoothstep') {
        return dataPathType;
      }
      if (edge.type === 'bezier' || edge.type === 'straight' || edge.type === 'step' || edge.type === 'smoothstep') {
        return edge.type;
      }
      return 'bezier';
    };

    return edges.map((edge) => {
      const dataType = resolveDataType(edge);
      const targetType = nodeTypeById.get(edge.target);
      const isTargetGenerator = targetType === 'nanoGen' || targetType === 'veoDirector';
      const isActive = isTargetGenerator && readyNodeIds.has(edge.target);
      const isDotted = isTargetGenerator && !readyNodeIds.has(edge.target);
      const pathType = resolvePathType(edge);
      const className = [edge.className, 'studio-edge', isActive ? 'studio-edge--active' : '', isDotted ? 'studio-edge--inactive' : '']
        .filter(Boolean)
        .join(' ');

      return {
        ...edge,
        type: 'dataType',
        animated: false,
        className,
        style: {
          ...edge.style,
          ['--edge-color' as keyof React.CSSProperties]: `var(--edge-${dataType})`,
        },
        data: {
          ...(edge.data as Record<string, unknown> | undefined),
          dataType,
          isActive,
          isDotted,
          pathType,
        },
      };
    });
  }, [edges, nodes, readyNodeIds]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeDragStart = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      takeSnapshot();

      const type = event.dataTransfer.getData('application/reactflow');

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (typeof type !== 'undefined' && type) {
        let data: Record<string, unknown> = { label: `New ${type}` };
        let style = {};

      if (type === 'nanoGen') {
          data = { model: 'nano-banana', positivePrompt: '', aspectRatio: '16:9' };
          style = { width: 400, height: 400 };
        } else if (type === 'veoDirector') {
          data = { model: 'veo-3.1', prompt: '', negativePrompt: '', enhancePrompt: false };
          style = { width: 512, height: 288 }; // 16:9
        } else if (type === 'string') {
          data = { value: '' };
        } else if (type === 'image') {
          data = { image: undefined };
          style = { width: 192, height: 192 };
        } else if (type === 'video') {
          data = { video: undefined };
          style = { width: 192, height: 192 };
        }

        const newNode = {
          id: uuidv4(),
          type,
          position,
          data,
          style,
        };

        setNodes(nodes.concat(newNode as any));
        return;
      }

      const rawPayload =
        event.dataTransfer.getData(CREATIVE_ASSET_DRAG_TYPE) ||
        event.dataTransfer.getData(RF_DRAG_MIME) ||
        event.dataTransfer.getData(TEXT_MIME);

      if (!rawPayload) {
        return;
      }

      const resolved = await resolveCreativeAssetDrop(rawPayload, resolveDroppedBase64);
      if (resolved.status === 'error') {
        show({
          title: resolved.title,
          description: resolved.description,
          variant: resolved.variant ?? 'error',
        });
        return;
      }

      const assetNodeType = resolved.nodeType;
      const assetData =
        assetNodeType === 'image'
          ? { image: resolved.dataUrl, fileName: resolved.fileName }
          : { video: resolved.dataUrl, fileName: resolved.fileName };

      const newNode = {
        id: uuidv4(),
        type: assetNodeType,
        position,
        data: assetData,
        style: { width: 192, height: 192 },
      };

      setNodes(nodes.concat(newNode as any));
    },
    [screenToFlowPosition, nodes, setNodes, takeSnapshot, show],
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
        if (!['prompt', 'prompt-in', 'negative'].includes(targetHandle || '')) return false;
    } else if (sourceNode.type === 'image') {
        // Image reference nodes can only connect to generation nodes, not to other reference nodes
        if (!['ref-image', 'first-frame', 'last-frame', 'ref-video'].includes(targetHandle || '')) return false;
        // Prevent image nodes from connecting to other image nodes
        if (targetNode.type === 'image' || targetNode.type === 'video') return false;
    } else if (sourceNode.type === 'video') {
        // Video reference nodes can only connect to ref-video
        if (!['ref-video'].includes(targetHandle || '')) return false;
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

    if (!canAcceptSingleTextInput(edges, target, targetHandle)) {
      return false;
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
        edges={styledEdges}
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
        className="studio-canvas"
        defaultEdgeOptions={{
          type: 'dataType',
          animated: false,
          className: 'studio-edge',
        }}
      >
        <Background color="var(--studio-grid-dot)" gap={16} />
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
            <aside className="w-64 border-r border-subtle bg-default p-4 flex flex-col gap-3 overflow-y-auto z-10">
                <div className="font-medium text-sm text-secondary flex justify-between items-center">
                    Library
                    {embedded && <div className="scale-75 origin-right"><Toolbar /></div>}
                </div>
                <AccordionPrimitive.Root
                  type="multiple"
                  defaultValue={DEFAULT_OPEN_LIBRARY_SECTIONS}
                  className="flex flex-col gap-2"
                >
                  {LIBRARY_SECTIONS.map((section) => (
                    <AccordionPrimitive.Item
                      key={section.value}
                      value={section.value}
                      className="rounded-lg border border-subtle bg-surface"
                    >
                      <AccordionPrimitive.Header>
                        <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
                          {section.label}
                          <ChevronDownIcon className="h-4 w-4 text-secondary transition-transform group-data-[state=open]:rotate-180" />
                        </AccordionPrimitive.Trigger>
                      </AccordionPrimitive.Header>
                      <AccordionPrimitive.Content className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                        <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
                          {section.items.map((item) => (
                            <div
                              key={item.type}
                              className={`p-3 border border-subtle rounded-md bg-surface cursor-grab ${item.borderColor} transition-colors shadow-sm`}
                              draggable
                              onDragStart={(event) =>
                                event.dataTransfer.setData('application/reactflow', item.type)
                              }
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-medium text-sm text-primary">{item.label}</div>
                                <Badge variant="secondary" className="text-xs">
                                  {item.tag}
                                </Badge>
                              </div>
                              <div className="text-xs text-secondary">{item.desc}</div>
                            </div>
                          ))}
                        </div>
                      </AccordionPrimitive.Content>
                    </AccordionPrimitive.Item>
                  ))}
                </AccordionPrimitive.Root>
            </aside>
            <main className="flex-1 relative bg-slate-50 dark:bg-slate-950">
                <Flow />
            </main>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
