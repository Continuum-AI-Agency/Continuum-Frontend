import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, ReactFlowProvider, useReactFlow, Connection, Edge, SelectionMode, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '../stores/useStudioStore';
import { StringNode } from '../nodes/StringNode';
import { ImageGenBlock } from '../nodes/ImageGenBlock';
import { VideoGenBlock } from '../nodes/VideoGenBlock';
import { VeoFastBlock } from '../nodes/VeoFastBlock';
import { ExtendVideoBlock } from '../nodes/ExtendVideoBlock';
import { ImageNode } from '../nodes/ImageNode';
import { AudioNode } from '../nodes/AudioNode';
import { DocumentNode } from '../nodes/DocumentNode';
import { VideoReferenceNode } from '../nodes/VideoReferenceNode';
import { Toolbar } from './Toolbar';
import { InteractionModeToggle } from './InteractionModeToggle';
import { SaveWorkflowDialog } from './SaveWorkflowDialog';
import { LoadWorkflowDialog } from './LoadWorkflowDialog';
import { Badge } from '@/components/ui/badge';
import { v4 as uuidv4 } from 'uuid';
import { ButtonEdge, DataTypeEdge } from '../edges';
import { useEdgeDropNode } from '../hooks/useEdgeDropNode';
import CustomConnectionLine from './CustomConnectionLine';
import { ContextMenu } from './ContextMenu';
import { useToast } from '@/components/ui/ToastProvider';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { isValidConnection } from '../utils/isValidConnection';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDownIcon } from '@radix-ui/react-icons';
import { useCanvasRealtime } from '@/components/ai-studio/hooks/useCanvasRealtime';
import { useSession } from '@/hooks/useSession';
import { Cursor } from '@/components/realtime/cursor';
import { ActiveUsersStack } from '@/components/presence/ActiveUsersStack';
import { PresenceProvider, usePresence } from '../contexts/PresenceContext';

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
        label: 'Veo 3.1',
        desc: 'Cinematic Video',
        tag: 'Creative',
        borderColor: 'hover:border-[color:var(--edge-video)]',
      },
      {
        type: 'veoFast' as const,
        label: 'Veo 3.1 Fast',
        desc: 'Fast Social Video',
        tag: 'Creative',
        borderColor: 'hover:border-[color:var(--edge-video)]',
      },
      {
        type: 'extendVideo' as const,
        label: 'Extend Video',
        desc: 'Continue from existing footage',
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
        type: 'audio' as const,
        label: 'Audio Reference',
        desc: 'Voice or Sound Input',
        tag: 'Utility',
        borderColor: 'hover:border-[color:var(--edge-audio, #10b981)]',
      },
      {
        type: 'document' as const,
        label: 'Document Context',
        desc: 'PDF/Text Knowledge',
        tag: 'Utility',
        borderColor: 'hover:border-[color:var(--edge-document, #f59e0b)]',
      },
      {
        type: 'video' as const,
        label: 'Video Reference',
        desc: 'Video File Input',
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
  veoFast: VeoFastBlock,
  extendVideo: ExtendVideoBlock,
  string: StringNode,
  image: ImageNode,
  audio: AudioNode,
  document: DocumentNode,
  video: VideoReferenceNode,
};

const edgeTypes = {
  button: ButtonEdge,
  dataType: DataTypeEdge,
};

function Flow({ brandProfileId }: { brandProfileId?: string }) {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setNodes, setEdges, takeSnapshot, undo, redo, getNodeById, interactionMode, setInteractionMode } = useStudioStore();
  const { remoteCursors, updateCursor, updatePresence, isLoading } = usePresence();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, deleteElements } = useReactFlow();
  const { onConnectStart, onConnectEnd } = useEdgeDropNode();
  const { show } = useToast();

  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);

  const onMouseMove = useCallback((event: React.MouseEvent) => {
    if (!reactFlowWrapper.current) return;
    const { x, y } = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    updateCursor(x, y);
  }, [screenToFlowPosition, updateCursor]);

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

      if (event.key.toLowerCase() === 'h') {
        setInteractionMode('pan');
        return;
      }
      if (event.key.toLowerCase() === 'v') {
        setInteractionMode('select');
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

      if (node.type === 'veoDirector' || node.type === 'veoFast') {
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
      const isTargetGenerator = targetType === 'nanoGen' || targetType === 'veoDirector' || targetType === 'veoFast';
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
          data = { model: 'veo-3.1', prompt: '', negativePrompt: '', enhancePrompt: false, referenceMode: 'images' };
          style = { width: 512, height: 288 }; // 16:9
        } else if (type === 'veoFast') {
          data = { model: 'veo-3.1-fast', prompt: '', negativePrompt: '', enhancePrompt: false, referenceMode: 'frames' };
          style = { width: 512, height: 288 }; // 16:9
        } else if (type === 'extendVideo') {
          data = { prompt: '' };
          style = { width: 360, height: 200 };
        } else if (type === 'string') {
          data = { value: '' };
        } else if (type === 'image') {
          data = { image: undefined };
          style = { width: 192, height: 192 };
        } else if (type === 'audio') {
          data = { audio: undefined };
          style = { width: 192, height: 100 };
        } else if (type === 'document') {
          data = { documents: [] };
          style = { width: 200, height: 200 };
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
      
      let assetData = {};
      let style = { width: 192, height: 192 };

      if (assetNodeType === 'image') {
        assetData = { image: resolved.dataUrl, fileName: resolved.fileName };
      } else if (assetNodeType === 'video') {
        assetData = { video: resolved.dataUrl, fileName: resolved.fileName };
      } else if (assetNodeType === 'audio') {
        assetData = { audio: resolved.dataUrl, fileName: resolved.fileName };
        style = { width: 192, height: 100 };
      } else if (assetNodeType === 'document') {
        assetData = { 
            documents: [{ 
                name: resolved.fileName || 'Document', 
                content: resolved.dataUrl, 
                type: resolved.mimeType === 'application/pdf' ? 'pdf' : 'txt' 
            }] 
        };
        style = { width: 200, height: 200 };
      }

      const newNode = {
        id: uuidv4(),
        type: assetNodeType,
        position,
        data: assetData,
        style,
      };

      setNodes(nodes.concat(newNode as any));
    },
    [screenToFlowPosition, nodes, setNodes, takeSnapshot, show],
  );

  const isValidConnectionCallback = useCallback((connection: Connection | Edge) => {
    return isValidConnection(connection, edges, nodes);
  }, [edges, nodes]);

  const onSelectionChange = useCallback((params: { nodes: StudioNode[]; edges: Edge[] }) => {
    const selectedNodeIds = params.nodes.map(node => node.id);
    updatePresence(selectedNodeIds);
  }, [updatePresence]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-slate-500 text-sm font-medium animate-pulse">
            Syncing session...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onMouseMove={onMouseMove}
          onNodeDragStart={onNodeDragStart}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd as any}
          isValidConnection={isValidConnectionCallback}
          connectionLineComponent={CustomConnectionLine}
          onPaneContextMenu={onPaneContextMenu}
          fitView
          panOnDrag={interactionMode === 'pan'}
          panOnScroll={true}
          selectionOnDrag={interactionMode === 'select'}
          selectionMode={SelectionMode.Partial}
          className="studio-canvas"
          defaultEdgeOptions={{
            type: 'dataType',
            animated: false,
            className: 'studio-edge',
          }}
        >
          <Panel position="top-left">
            <InteractionModeToggle />
          </Panel>
          <Background color="var(--studio-grid-dot)" gap={16} />
          {menu && <ContextMenu onClick={onPaneClick} {...menu} />}
          <Controls />
          <MiniMap />
          {Object.entries(remoteCursors).map(([userId, cursor]) => (
            <Cursor
              key={userId}
              x={cursor.x}
              y={cursor.y}
              color={cursor.color}
              name={cursor.name}
            />
          ))}
        </ReactFlow>
      </div>
  );
}

interface StudioCanvasProps {
  embedded?: boolean;
  brandProfileId?: string;
}

export function StudioCanvas({ embedded = false, brandProfileId }: StudioCanvasProps) {
  const realtime = useCanvasRealtime(brandProfileId || '');
  const { user } = useSession();
  
  return (
    <ReactFlowProvider>
      <PresenceProvider
        onlineUsers={realtime.onlineUsers}
        currentUserId={user?.id}
        remoteCursors={realtime.remoteCursors}
        updateCursor={realtime.updateCursor}
        updatePresence={realtime.updatePresence}
        status={realtime.status}
        isLoading={realtime.isLoading}
      >
        <div className="flex h-full flex-col bg-background">
          {!embedded && (
              <div className="h-14 border-b px-4 flex items-center justify-between bg-background z-[100] relative shrink-0">
                  <div className="flex items-center gap-4">
                    <div className="font-bold text-lg flex items-center gap-2">
                      <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Continuum</span>
                      <span className="text-muted-foreground font-normal">Studio</span>
                    </div>
                    <div className="h-4 w-px bg-border hidden sm:block opacity-20" />
                    <div className="flex items-center h-10 px-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                      <ActiveUsersStack onlineUsers={realtime.onlineUsers} status={realtime.status as any} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Toolbar />
                  </div>
              </div>
          )}
          <div className="flex-1 flex overflow-hidden">
              <aside className="w-64 border-r border-subtle bg-default p-4 flex flex-col gap-3 overflow-y-auto z-10">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm text-secondary">Library</div>
                      <div className="flex items-center gap-2">
                        <LoadWorkflowDialog brandProfileId={brandProfileId} />
                        <SaveWorkflowDialog brandProfileId={brandProfileId} />
                      </div>
                    </div>
                    {embedded && (
                      <div className="scale-90 origin-right">
                        <Toolbar />
                      </div>
                    )}
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
                            {section.items.map((item) => {
                              const isDisabled = Boolean((item as { disabled?: boolean }).disabled);
                              return (
                              <div
                                key={item.type}
                                className={`p-3 border border-subtle rounded-md bg-surface transition-colors shadow-sm ${
                                  isDisabled ? 'cursor-not-allowed opacity-60' : `cursor-grab ${item.borderColor}`
                                }`}
                                draggable={!isDisabled}
                                onDragStart={(event) => {
                                  if (isDisabled) return;
                                  event.dataTransfer.setData('application/reactflow', item.type);
                                }}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <div className="font-medium text-sm text-primary">{item.label}</div>
                                  <Badge variant="secondary" className="text-xs">
                                    {item.tag}
                                  </Badge>
                                </div>
                                <div className="text-xs text-secondary">{item.desc}</div>
                              </div>
                            );
                            })}
                          </div>
                        </AccordionPrimitive.Content>
                      </AccordionPrimitive.Item>
                    ))}
                  </AccordionPrimitive.Root>
              </aside>
              <main className="flex-1 relative bg-slate-50 dark:bg-slate-950">
                  <Flow brandProfileId={brandProfileId} />
              </main>
          </div>
        </div>
      </PresenceProvider>
    </ReactFlowProvider>
  );
}
