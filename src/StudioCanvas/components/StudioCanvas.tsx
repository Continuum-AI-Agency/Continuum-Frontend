import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Connection as ReactFlowConnection,
  type Edge,
  SelectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { FolderOpen, Plus, ScanLine, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

import { Canvas } from '@/components/ai-elements/canvas';
import { Controls } from '@/components/ai-elements/controls';
import { Panel } from '@/components/ai-elements/panel';
import { Connection as ConnectionLine } from '@/components/ai-elements/connection';
import { Edge as AiElementsEdge } from '@/components/ai-elements/edge';

import { useStudioStore } from '../stores/useStudioStore';
import { StringNode } from '../nodes/StringNode';
import { ImageGenBlock } from '../nodes/ImageGenBlock';
import { VideoGenBlock } from '../nodes/VideoGenBlock';
import { ExtendVideoBlock } from '../nodes/ExtendVideoBlock';
import { ImageNode } from '../nodes/ImageNode';
import { AudioNode } from '../nodes/AudioNode';
import { DocumentNode } from '../nodes/DocumentNode';
import { VideoReferenceNode } from '../nodes/VideoReferenceNode';
import { Toolbar } from './Toolbar';
import { InteractionModeToggle } from './InteractionModeToggle';
import { SaveWorkflowDialog } from './SaveWorkflowDialog';
import { LoadWorkflowDialog } from './LoadWorkflowDialog';
import { useEdgeDropNode } from '../hooks/useEdgeDropNode';
import { useToast } from '@/components/ui/ToastProvider';
import { CREATIVE_ASSET_DRAG_TYPE } from '@/lib/creative-assets/drag';
import { resolveDroppedBase64 } from '@/lib/ai-studio/referenceDropClient';
import { resolveCreativeAssetDrop } from '../utils/resolveCreativeAssetDrop';
import { isValidConnection } from '../utils/isValidConnection';
import { useCanvasRealtime } from '@/components/ai-studio/hooks/useCanvasRealtime';
import { Cursor } from '@/components/realtime/cursor';
import { CanvasSyncStatus } from '@/components/ai-studio/CanvasSyncStatus';
import { ActiveUsersStack } from '@/components/presence/ActiveUsersStack';
import { AIStudioChat } from '@/components/ai-studio/chat/AIStudioChat';
import { CanvasRoomsTabs } from '@/components/ai-studio/CanvasRoomsTabs';
import { useCanvasRooms } from '@/components/ai-studio/hooks/useCanvasRooms';
import { CanvasMediaLoader } from '@/components/ai-studio/CanvasMediaLoader';
import { StudioNode } from '../types';
import {
  DEFAULT_VIDEO_GENERATOR_MODEL,
  VIDEO_GENERATOR_MODEL_LABELS,
  VIDEO_GENERATOR_MODELS,
  type VideoGeneratorModel,
} from '../utils/videoModel';

const RF_DRAG_MIME = 'application/reactflow-node-data';
const TEXT_MIME = 'text/plain';

type StudioCanvasNodeType =
  | 'nanoGen'
  | 'videoGen'
  | 'veoDirector'
  | 'veoFast'
  | 'extendVideo'
  | 'string'
  | 'image'
  | 'audio'
  | 'document'
  | 'video';

type LibraryItem = {
  type: StudioCanvasNodeType;
  label: string;
  desc: string;
  tag: string;
  modelOptions?: readonly VideoGeneratorModel[];
  disabled?: boolean;
};

type LibrarySection = {
  value: string;
  label: string;
  items: LibraryItem[];
};

type OrganicPlannerSeedContext = {
  draftId: string;
  title: string;
  summary: string;
  captionPreview: string;
  creativeDirectionPrompt?: string;
  thumbnailPrompt?: string;
};

const LIBRARY_SECTIONS: LibrarySection[] = [
  {
    value: 'image',
    label: 'Image',
    items: [
      {
        type: 'nanoGen',
        label: 'Image Generation',
        desc: 'Canvas and generator output',
        tag: 'Creative',
      },
      {
        type: 'image',
        label: 'Image Reference',
        desc: 'Image file input',
        tag: 'Utility',
      },
    ],
  },
  {
    value: 'video',
    label: 'Video',
    items: [
      {
        type: 'videoGen',
        label: 'Video Generation',
        desc: 'Generate clips with selectable models',
        tag: 'Creative',
        modelOptions: VIDEO_GENERATOR_MODELS,
      },
      {
        type: 'extendVideo',
        label: 'Extend Video',
        desc: 'Continue existing footage',
        tag: 'Creative',
      },
      {
        type: 'video',
        label: 'Video Reference',
        desc: 'Video file input',
        tag: 'Utility',
      },
    ],
  },
  {
    value: 'utility',
    label: 'Utility',
    items: [
      {
        type: 'audio',
        label: 'Audio Reference',
        desc: 'Voice or sound input',
        tag: 'Utility',
      },
      {
        type: 'document',
        label: 'Document Context',
        desc: 'PDF and text knowledge',
        tag: 'Utility',
      },
      {
        type: 'string',
        label: 'Text Block',
        desc: 'Prompt and enrichment input',
        tag: 'Intelligence',
      },
    ],
  },
];

const NODE_TYPES = new Set<StudioCanvasNodeType>([
  'nanoGen',
  'videoGen',
  'veoDirector',
  'veoFast',
  'extendVideo',
  'string',
  'image',
  'audio',
  'document',
  'video',
]);

const isStudioCanvasNodeType = (value: string): value is StudioCanvasNodeType =>
  NODE_TYPES.has(value as StudioCanvasNodeType);

const createNodeConfig = (
  type: StudioCanvasNodeType,
  options?: { model?: VideoGeneratorModel }
): { data: Record<string, unknown>; style?: Record<string, number> } => {
  if (type === 'nanoGen') {
    return {
      data: { model: 'nano-banana-2', imageSize: '512px', positivePrompt: '', aspectRatio: '16:9' },
      style: { width: 400, height: 225 },
    };
  }

  if (type === 'videoGen' || type === 'veoDirector' || type === 'veoFast') {
    const model =
      options?.model ??
      (type === 'veoDirector' ? 'veo-3.1' : type === 'veoFast' ? 'veo-3.1-fast' : DEFAULT_VIDEO_GENERATOR_MODEL);
    const referenceMode = model === 'veo-3.1-fast' ? 'frames' : model === 'kling-omni' ? 'omni' : 'images';
    return {
      data: { model, prompt: '', negativePrompt: '', enhancePrompt: false, referenceMode },
      style: { width: 512, height: 288 },
    };
  }

  if (type === 'extendVideo') {
    return {
      data: { prompt: '' },
      style: { width: 360, height: 200 },
    };
  }

  if (type === 'string') {
    return { data: { value: '' } };
  }

  if (type === 'image') {
    return {
      data: { image: undefined, aspectRatio: '1:1' },
      style: { width: 192, height: 192 },
    };
  }

  if (type === 'audio') {
    return {
      data: { audio: undefined },
      style: { width: 192, height: 100 },
    };
  }

  if (type === 'document') {
    return {
      data: { documents: [] },
      style: { width: 200, height: 200 },
    };
  }

  return {
    data: { video: undefined },
    style: { width: 192, height: 192 },
  };
};

const nodeTypes = {
  nanoGen: ImageGenBlock,
  videoGen: VideoGenBlock,
  veoDirector: VideoGenBlock,
  veoFast: VideoGenBlock,
  extendVideo: ExtendVideoBlock,
  string: StringNode,
  image: ImageNode,
  audio: AudioNode,
  document: DocumentNode,
  video: VideoReferenceNode,
};

const edgeTypes = {
  button: AiElementsEdge.DataType,
  dataType: AiElementsEdge.DataType,
};

function Flow({
  brandProfileId,
  realtime,
  activeRoomId,
  organicPlannerSeed,
}: {
  brandProfileId?: string;
  realtime: ReturnType<typeof useCanvasRealtime>;
  activeRoomId?: string;
  organicPlannerSeed?: OrganicPlannerSeedContext | null;
}) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    takeSnapshot,
    undo,
    redo,
    interactionMode,
    setInteractionMode,
    triggerSave,
    setBrandId,
  } = useStudioStore();

  const { remoteCursors, updateCursor, isLoading } = realtime;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastMousePositionRef = useRef({ x: 240, y: 180 });
  const contextMenuAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const { screenToFlowPosition, deleteElements, fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    if (brandProfileId) {
      setBrandId(brandProfileId);
    }
  }, [brandProfileId, setBrandId]);

  const { onConnectStart, onConnectEnd } = useEdgeDropNode();
  const { show } = useToast();
  const [isLoadWorkflowOpen, setIsLoadWorkflowOpen] = useState(false);
  const hydratedPlannerSeedRef = useRef<string | null>(null);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      lastMousePositionRef.current = { x: event.clientX, y: event.clientY };
      if (!reactFlowWrapper.current) return;
      const { x, y } = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      updateCursor(x, y);
    },
    [screenToFlowPosition, updateCursor],
  );

  const addNodeAtPointer = useCallback(
    (type: StudioCanvasNodeType, options?: { model?: VideoGeneratorModel }) => {
      takeSnapshot();
      const anchorPosition = contextMenuAnchorRef.current ?? lastMousePositionRef.current;
      const position = screenToFlowPosition(anchorPosition);
      const canonicalType: StudioCanvasNodeType =
        type === 'veoDirector' || type === 'veoFast' ? 'videoGen' : type;
      const { data, style } = createNodeConfig(canonicalType, options);

      const newNode: StudioNode = {
        id: uuidv4(),
        type: canonicalType,
        position,
        data: data as StudioNode['data'],
        style,
      } as StudioNode;

      setNodes(nodes.concat(newNode));
      triggerSave();
    },
    [nodes, screenToFlowPosition, setNodes, takeSnapshot, triggerSave],
  );

  const handleCanvasContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    contextMenuAnchorRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    if (!open) {
      contextMenuAnchorRef.current = null;
    }
  }, []);

  const clearCanvas = useCallback(() => {
    takeSnapshot();
    setNodes([]);
    setEdges([]);
    triggerSave();
  }, [setEdges, setNodes, takeSnapshot, triggerSave]);

  useEffect(() => {
    if (isLoading) return;
    if (!organicPlannerSeed) return;
    if (nodes.length > 0 || edges.length > 0) return;

    const roomScope = activeRoomId ?? 'default-room';
    const hydrationKey = `${roomScope}:${organicPlannerSeed.draftId}`;
    if (hydratedPlannerSeedRef.current === hydrationKey) return;

    const promptSections = [
      organicPlannerSeed.title ? `Title: ${organicPlannerSeed.title}` : '',
      organicPlannerSeed.summary ? `Summary: ${organicPlannerSeed.summary}` : '',
      organicPlannerSeed.captionPreview ? `Draft caption:\n${organicPlannerSeed.captionPreview}` : '',
      organicPlannerSeed.creativeDirectionPrompt
        ? `Creative direction:\n${organicPlannerSeed.creativeDirectionPrompt}`
        : '',
      organicPlannerSeed.thumbnailPrompt
        ? `Thumbnail direction:\n${organicPlannerSeed.thumbnailPrompt}`
        : '',
      'Goal: Generate a clean social thumbnail concept with clear hierarchy and one focal subject.',
    ].filter(Boolean);

    const textNodeId = `organic-seed-text-${organicPlannerSeed.draftId}`;
    const imageGenNodeId = `organic-seed-image-${organicPlannerSeed.draftId}`;

    const starterNodes: StudioNode[] = [
      {
        id: textNodeId,
        type: 'string',
        position: { x: 120, y: 160 },
        data: {
          value: promptSections.join('\n\n'),
        },
        style: { width: 420, height: 240 },
      } as StudioNode,
      {
        id: imageGenNodeId,
        type: 'nanoGen',
        position: { x: 620, y: 190 },
        data: {
          model: 'nano-banana-2',
          positivePrompt: '',
          aspectRatio: '1:1',
          imageSize: '1K',
        },
        style: { width: 420, height: 420 },
      } as StudioNode,
    ];

    const starterEdges: Edge[] = [
      {
        id: `e-${textNodeId}-${imageGenNodeId}-prompt`,
        source: textNodeId,
        sourceHandle: 'text',
        target: imageGenNodeId,
        targetHandle: 'prompt',
        type: 'dataType',
        data: { dataType: 'text', pathType: 'bezier' },
      },
    ];

    takeSnapshot();
    setNodes(starterNodes);
    setEdges(starterEdges);
    triggerSave();
    hydratedPlannerSeedRef.current = hydrationKey;
  }, [
    activeRoomId,
    edges.length,
    isLoading,
    nodes.length,
    organicPlannerSeed,
    setEdges,
    setNodes,
    takeSnapshot,
    triggerSave,
  ]);

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
        const selectedNodes = nodes.filter((node) => node.selected);
        const selectedEdges = edges.filter((edge) => edge.selected);

        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          takeSnapshot();
          deleteElements({ nodes: selectedNodes, edges: selectedEdges });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteElements, edges, nodes, redo, setInteractionMode, takeSnapshot, undo]);

  const readyNodeIds = useMemo(() => {
    const isGeneratorReady = (node: StudioNode) => {
      if (node.type === 'nanoGen') {
        const hasPromptEdge = edges.some((edge) => edge.target === node.id && edge.targetHandle === 'prompt');
        const promptValue =
          typeof (node.data as { positivePrompt?: string }).positivePrompt === 'string'
            ? (node.data as { positivePrompt?: string }).positivePrompt?.trim()
            : '';
        return hasPromptEdge || !!promptValue;
      }

      if (node.type === 'videoGen' || node.type === 'veoDirector' || node.type === 'veoFast') {
        const hasPromptEdge = edges.some((edge) => edge.target === node.id && edge.targetHandle === 'prompt-in');
        const promptValue =
          typeof (node.data as { prompt?: string }).prompt === 'string'
            ? (node.data as { prompt?: string }).prompt?.trim()
            : '';
        return hasPromptEdge || !!promptValue;
      }

      return false;
    };

    return new Set(nodes.filter(isGeneratorReady).map((node) => node.id));
  }, [edges, nodes]);

  const styledEdges = useMemo(() => {
    const nodeTypeById = new Map(nodes.map((node) => [node.id, node.type]));

    const resolveDataType = (edge: Edge) => {
      const dataType = (edge.data as { dataType?: string } | undefined)?.dataType;
      if (dataType === 'image' || dataType === 'video' || dataType === 'audio' || dataType === 'document' || dataType === 'text') {
        return dataType;
      }
      if (edge.sourceHandle === 'image') return 'image';
      if (edge.sourceHandle === 'video') return 'video';
      if (edge.sourceHandle === 'audio') return 'audio';
      if (edge.sourceHandle === 'document') return 'document';
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
      const isTargetGenerator =
        targetType === 'nanoGen' ||
        targetType === 'videoGen' ||
        targetType === 'veoDirector' ||
        targetType === 'veoFast';
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

  const onNodeDragStop = useCallback(() => {
    triggerSave();
  }, [triggerSave]);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      takeSnapshot();

      const droppedType = event.dataTransfer.getData('application/reactflow');
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      if (isStudioCanvasNodeType(droppedType)) {
        const canonicalType: StudioCanvasNodeType =
          droppedType === 'veoDirector' || droppedType === 'veoFast' ? 'videoGen' : droppedType;
        const { data, style } = createNodeConfig(canonicalType);
        const newNode: StudioNode = {
          id: uuidv4(),
          type: canonicalType,
          position,
          data: data as StudioNode['data'],
          style,
        } as StudioNode;

        setNodes(nodes.concat(newNode));
        triggerSave();
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
          documents: [
            {
              name: resolved.fileName || 'Document',
              content: resolved.dataUrl,
              type: resolved.mimeType === 'application/pdf' ? 'pdf' : 'txt',
            },
          ],
        };
        style = { width: 200, height: 200 };
      }

      const newNode: StudioNode = {
        id: uuidv4(),
        type: assetNodeType,
        position,
        data: assetData as StudioNode['data'],
        style,
      } as StudioNode;

      setNodes(nodes.concat(newNode));
      triggerSave();
    },
    [nodes, screenToFlowPosition, setNodes, show, takeSnapshot, triggerSave],
  );

  const isValidConnectionCallback = useCallback(
    (connection: ReactFlowConnection | Edge) => {
      return isValidConnection(connection, edges, nodes);
    },
    [edges, nodes],
  );

  if (isLoading) {
    return <CanvasMediaLoader />;
  }

  return (
    <div className="h-full min-h-0 w-full" ref={reactFlowWrapper} onMouseMove={handleMouseMove}>
      <ContextMenu onOpenChange={handleContextMenuOpenChange}>
        <ContextMenuTrigger className="block h-full w-full">
          <Canvas
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
            onNodeDragStop={onNodeDragStop}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnectionCallback}
            connectionLineComponent={ConnectionLine}
            panOnDrag={interactionMode === 'pan'}
            panOnScroll
            selectionOnDrag={interactionMode === 'select'}
            selectionMode={SelectionMode.Partial}
            className="studio-canvas"
            onPaneContextMenu={handleCanvasContextMenu}
            defaultEdgeOptions={{
              type: 'dataType',
              animated: false,
              className: 'studio-edge',
            }}
          >
            <Panel position="top-left" className="flex items-center gap-2 bg-background/95 p-1 backdrop-blur">
              <InteractionModeToggle />
            </Panel>

            <Controls />
            <MiniMap className="!border !bg-background/95" />

            {Object.entries(remoteCursors).map(([userId, cursor]) => (
              <Cursor key={userId} x={cursor.x} y={cursor.y} color={cursor.color} name={cursor.name} />
            ))}

            <Panel position="bottom-right" className="mb-4 mr-4 border-none bg-transparent p-0 shadow-none">
              <AIStudioChat brandProfileId={brandProfileId || ''} roomId={activeRoomId} />
            </Panel>
          </Canvas>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-72">
          <ContextMenuLabel>Canvas Actions</ContextMenuLabel>
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
              <Plus className="mr-2 h-4 w-4" />
              Add Node
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-72">
              {LIBRARY_SECTIONS.map((section) => (
                <ContextMenuSub key={section.value}>
                  <ContextMenuSubTrigger inset>{section.label}</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-72">
                    {section.items.map((item) =>
                      item.modelOptions ? (
                        <ContextMenuSub key={`${item.type}-models`}>
                          <ContextMenuSubTrigger inset>{item.label}</ContextMenuSubTrigger>
                          <ContextMenuSubContent className="w-56">
                            {item.modelOptions.map((model) => (
                              <ContextMenuItem
                                key={`${item.type}-${model}`}
                                onClick={() => addNodeAtPointer(item.type, { model })}
                              >
                                <div className="flex min-w-0 flex-col">
                                  <span>{VIDEO_GENERATOR_MODEL_LABELS[model]}</span>
                                  <span className="text-xs text-muted-foreground">{item.desc}</span>
                                </div>
                                <ContextMenuShortcut>{item.tag}</ContextMenuShortcut>
                              </ContextMenuItem>
                            ))}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                      ) : (
                        <ContextMenuItem
                          key={item.type}
                          disabled={Boolean(item.disabled)}
                          onClick={() => addNodeAtPointer(item.type)}
                        >
                          <div className="flex min-w-0 flex-col">
                            <span>{item.label}</span>
                            <span className="text-xs text-muted-foreground">{item.desc}</span>
                          </div>
                          <ContextMenuShortcut>{item.tag}</ContextMenuShortcut>
                        </ContextMenuItem>
                      )
                    )}
                  </ContextMenuSubContent>
                </ContextMenuSub>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuItem inset onSelect={() => setIsLoadWorkflowOpen(true)}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Load Workflow
          </ContextMenuItem>

          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
              <ScanLine className="mr-2 h-4 w-4" />
              View and Interaction
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-64">
              <ContextMenuCheckboxItem checked={interactionMode === 'pan'} onClick={() => setInteractionMode('pan')}>
                Pan Mode
                <ContextMenuShortcut>H</ContextMenuShortcut>
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem checked={interactionMode === 'select'} onClick={() => setInteractionMode('select')}>
                Select Mode
                <ContextMenuShortcut>V</ContextMenuShortcut>
              </ContextMenuCheckboxItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => zoomIn({ duration: 250 })}>
                <ZoomIn className="mr-2 h-4 w-4" />
                Zoom In
              </ContextMenuItem>
              <ContextMenuItem onClick={() => zoomOut({ duration: 250 })}>
                <ZoomOut className="mr-2 h-4 w-4" />
                Zoom Out
              </ContextMenuItem>
              <ContextMenuItem onClick={() => fitView({ padding: 0.2, duration: 350 })}>
                Fit View
                <ContextMenuShortcut>Shift+F</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive" onClick={clearCanvas}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Canvas
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <LoadWorkflowDialog
        brandProfileId={brandProfileId}
        open={isLoadWorkflowOpen}
        onOpenChange={setIsLoadWorkflowOpen}
        showTrigger={false}
      />
    </div>
  );
}

interface StudioCanvasProps {
  embedded?: boolean;
  brandProfileId?: string;
  organicPlannerSeed?: OrganicPlannerSeedContext | null;
}

export function StudioCanvas({
  embedded = false,
  brandProfileId,
  organicPlannerSeed,
}: StudioCanvasProps) {
  const { rooms } = useCanvasRooms(brandProfileId || '');
  const [activeRoomId, setActiveRoomId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!activeRoomId && rooms.length > 0) {
      setActiveRoomId(rooms[0].id);
    }
  }, [activeRoomId, rooms]);

  const realtime = useCanvasRealtime(brandProfileId || '', activeRoomId);

  return (
    <ReactFlowProvider>
      <div className="flex h-full min-h-0 w-full flex-col bg-background">
        {!embedded && (
          <div className="relative z-[100] flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">Continuum</span>
                <span className="font-normal text-muted-foreground">Studio</span>
              </div>
              <div className="hidden h-4 w-px bg-border opacity-20 sm:block" />
              <div className="flex h-10 items-center rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
                <CanvasSyncStatus status={realtime.status} dbStatus={realtime.dbStatus} isSaving={realtime.isSaving} />
                <div className="mx-1 h-4 w-px bg-indigo-500/20" />
                <ActiveUsersStack onlineUsers={realtime.onlineUsers} status={realtime.status as never} />
              </div>
              <div className="hidden h-4 w-px bg-border opacity-20 sm:block" />
              <CanvasRoomsTabs
                brandProfileId={brandProfileId || ''}
                activeRoomId={activeRoomId}
                onRoomChange={setActiveRoomId}
              />
            </div>

            <div className="flex items-center gap-2">
              <LoadWorkflowDialog brandProfileId={brandProfileId} />
              <SaveWorkflowDialog brandProfileId={brandProfileId} />
              <Toolbar />
            </div>
          </div>
        )}

        <main className="relative flex-1 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
          <Flow
            brandProfileId={brandProfileId}
            realtime={realtime}
            activeRoomId={activeRoomId}
            organicPlannerSeed={organicPlannerSeed}
          />
        </main>
      </div>
    </ReactFlowProvider>
  );
}
