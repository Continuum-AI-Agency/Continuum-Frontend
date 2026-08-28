import {
  type Edge,
  MiniMap,
  type Connection as ReactFlowConnection,
  ReactFlowProvider,
  reconnectEdge,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { ContextMenu as ContextMenuPrimitive } from '@base-ui/react/context-menu';
import { type ActionId, type UnsplashPhoto, validateWorkflowGraph } from '@continuum/contracts';
import { AtSign, Camera, FolderOpen } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

import { Canvas } from '@/components/ai-elements/canvas';
import { Connection as ConnectionLine } from '@/components/ai-elements/connection';
import { Controls } from '@/components/ai-elements/controls';
import { Panel } from '@/components/ai-elements/panel';
import { CanvasMediaLoader } from '@/components/ai-studio/CanvasMediaLoader';
import { AIStudioChat } from '@/components/ai-studio/chat/AIStudioChat';
import { CanvasComposer } from '@/components/ai-studio/composer/CanvasComposer';
import { useCanvasRealtime } from '@/components/ai-studio/hooks/useCanvasRealtime';
import { useCanvasRooms } from '@/components/ai-studio/hooks/useCanvasRooms';
import { useCanvasRunRequests } from '@/components/ai-studio/hooks/useCanvasRunRequests';
import { StudioMediaLibraryPanel } from '@/components/creative-assets/StudioMediaLibraryPanel';
import { Cursor } from '@/components/realtime/cursor';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { useToast } from '@/components/ui/ToastProvider';
import { canvasRoomHref } from '@/lib/ai-studio/canvasRoomLocation';
import { inlineRemoteImage } from '@/lib/ai-studio/inlineRemoteImage';
import {
  type TechniqueItem,
  techniqueApplyOptions,
  useTechniques,
} from '@/lib/ai-studio/techniques';
import { trackUnsplashDownload } from '@/lib/api/aiStudioUnsplash.client';
import type { PlannerAiStudioHandoff } from '@/lib/organic/ai-studio-bridge';
import { CanvasRuntimeProvider } from '../contexts/CanvasRuntimeContext';
import { useApplyBackToPlanner } from '../hooks/useApplyBackToPlanner';
import { useApplyWorkflow } from '../hooks/useApplyWorkflow';
import { useCanvasDnD } from '../hooks/useCanvasDnD';
import { useCanvasKeyboardShortcuts } from '../hooks/useCanvasKeyboardShortcuts';
import { useEdgeDropNode } from '../hooks/useEdgeDropNode';
import { CANVAS_NODE_TYPES_WITH_FOLD, useFoldedGraph } from '../hooks/useFoldedGraph';
import { usePlannerSeedHydration } from '../hooks/usePlannerSeedHydration';
import { useTimelineRenderContinuations } from '../hooks/useTimelineRenderContinuations';
import { useWorkflowExecution } from '../hooks/useWorkflowExecution';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { DEFAULT_BRAND_BOOK_PIECES } from '../utils/brandEnforcement';
import { buildReferenceNodes, type ReferenceMediaItem } from '../utils/buildReferenceNodes';
import { computeReadyNodeIds, computeStyledEdges } from '../utils/edgeStyling';
import { executeWorkflow } from '../utils/executeWorkflow';
import { STUDIO_FIT_VIEW_OPTIONS } from '../utils/fitViewOptions';
import { inlineReferenceImageNodes } from '../utils/inlineReferenceImageNodes';
import { isValidConnection } from '../utils/isValidConnection';
import { layoutInRow } from '../utils/layoutImportedNodes';
import type { VideoGeneratorModel } from '../utils/videoModel';
import type { StudioCanvasNodeType } from './addNodeCatalog';
import { CanvasContextMenuContent } from './CanvasContextMenuContent';
import { CanvasFloatingPanel } from './CanvasFloatingPanel';
import { CanvasShortcutsPanel } from './CanvasShortcutsPanel';
import { CanvasValidationPanel } from './CanvasValidationPanel';
import { createNodeConfig, edgeTypes, nodeTypes } from './canvasNodeTypes';
import { InstagramMediaBrowser } from './InstagramMediaBrowser';
import { InteractionModeToggle } from './InteractionModeToggle';
import { LoadWorkflowDialog } from './LoadWorkflowDialog';
import { NodeInspectorPanel } from './NodeInspectorPanel';
import { SaveStarterDialog } from './SaveStarterDialog';
import { SourceDropNodePicker } from './SourceDropNodePicker';
import { StudioCanvasHeader } from './StudioCanvasHeader';
import { UnsplashBrowser } from './UnsplashBrowser';

function Flow({
  brandProfileId,
  realtime,
  activeRoomId,
  focusNodeId,
  organicPlannerSeed,
}: {
  brandProfileId?: string;
  realtime: ReturnType<typeof useCanvasRealtime>;
  activeRoomId?: string;
  focusNodeId?: string;
  organicPlannerSeed?: PlannerAiStudioHandoff | null;
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
    interactionMode,
    setInteractionMode,
    keyboardScope,
    triggerSave,
    setBrandId,
    setActiveRoomId,
    updateNodeData,
  } = useStudioStore();

  const { remoteCursors, updateCursor, isLoading } = realtime;

  // Pick up MCP-issued run requests for this room and execute them on the open
  // canvas (results persist + broadcast through the normal autosave path).
  useCanvasRunRequests(brandProfileId || '', activeRoomId);
  useTimelineRenderContinuations(brandProfileId, activeRoomId);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const lastMousePositionRef = useRef({ x: 240, y: 180 });
  const contextMenuAnchorRef = useRef<{ x: number; y: number } | null>(null);

  const { screenToFlowPosition, fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    if (brandProfileId) {
      setBrandId(brandProfileId);
    }
  }, [brandProfileId, setBrandId]);

  useEffect(() => {
    setActiveRoomId(activeRoomId);
  }, [activeRoomId, setActiveRoomId]);

  const focusedNodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNodeId || isLoading || focusedNodeRef.current === focusNodeId) return;
    const target = nodes.find((node) => node.id === focusNodeId);
    if (!target) return;
    focusedNodeRef.current = focusNodeId;
    setNodes(nodes.map((node) => ({ ...node, selected: node.id === focusNodeId })));
    const handle = requestAnimationFrame(() => {
      fitView({ nodes: [target], padding: 0.65, duration: 350 });
    });
    return () => cancelAnimationFrame(handle);
  }, [fitView, focusNodeId, isLoading, nodes, setNodes]);

  // When the walkthrough seeds starter nodes, frame them so the tour's node
  // steps always have an on-screen target. Runs once per Flow instance.
  const hasFitTourSeedRef = useRef(false);
  useEffect(() => {
    if (hasFitTourSeedRef.current) return;
    if (!nodes.some((node) => node.data?.isTourSeed === true)) return;
    hasFitTourSeedRef.current = true;
    const handle = requestAnimationFrame(() => {
      fitView({ ...STUDIO_FIT_VIEW_OPTIONS, duration: 0 });
    });
    return () => cancelAnimationFrame(handle);
  }, [nodes, fitView]);

  const {
    onConnectStart,
    onConnectEnd,
    pendingSourceDrop,
    resolveSourceDropPick,
    dismissSourceDropPick,
  } = useEdgeDropNode();
  const { show } = useToast();
  const [isLoadWorkflowOpen, setIsLoadWorkflowOpen] = useState(false);
  const [isInstagramBrowserOpen, setIsInstagramBrowserOpen] = useState(false);
  const [isUnsplashBrowserOpen, setIsUnsplashBrowserOpen] = useState(false);
  const [isLibraryBrowserOpen, setIsLibraryBrowserOpen] = useState(false);
  const [isSaveStarterOpen, setIsSaveStarterOpen] = useState(false);
  // Where an added node lands: the right-click point, pinned when the Add Node submenu
  // opens. Read from a ref at add time rather than lastMousePositionRef, because the
  // submenus are portalled outside the canvas wrapper and the mouse crosses live canvas
  // on the way to them — and because Base UI nulls contextMenuAnchorRef on close, which
  // can run before a row's own click handler.
  const addNodeAnchorRef = useRef<{ x: number; y: number } | null>(null);
  // A cmdk row is not a menu item, so choosing one closes nothing by itself.
  const contextMenuActionsRef = useRef<ContextMenuPrimitive.Root.Actions | null>(null);
  // Team chat open/closed lifted here so the composer can reserve the chat panel's
  // footprint and the two overlays never fight for the same bottom-right region.
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [starterSelectionNodes, setStarterSelectionNodes] = useState<StudioNode[]>([]);

  const openSaveStarter = useCallback(() => {
    setStarterSelectionNodes(nodes.filter((node) => node.selected));
    setIsSaveStarterOpen(true);
  }, [nodes]);

  // The Composer builds; the user runs. Same execution path as the toolbar's Run
  // Flow — the composed workflow is an ordinary canvas, with nothing special about it.
  const composerExecutionControls = useWorkflowExecution();
  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes],
  );
  const handleComposerRun = useCallback(() => {
    void executeWorkflow(composerExecutionControls, { brandId: brandProfileId });
  }, [composerExecutionControls, brandProfileId]);

  // Applies full brand-book enforcement to every selected generation node at once,
  // so the user can brand-enforce a whole flow in one action. Reference/text nodes
  // are ignored (they carry no generation prompt).
  const enforceBrandBookOnSelection = useCallback(() => {
    const targets = nodes.filter(
      (node) =>
        node.selected &&
        (node.type === 'nanoGen' ||
          node.type === 'videoGen' ||
          node.type === 'veoDirector' ||
          node.type === 'veoFast'),
    );
    if (targets.length === 0) {
      show({
        title: 'No generation nodes selected',
        description: 'Select image or video generation nodes to enforce the brand book.',
        variant: 'error',
      });
      return;
    }
    targets.forEach((node) => {
      updateNodeData(node.id, { brandBookPieces: DEFAULT_BRAND_BOOK_PIECES });
    });
    triggerSave();
    show({
      title: 'Brand book enforced',
      description: `${targets.length} node${targets.length === 1 ? '' : 's'} will follow the full brand book.`,
      variant: 'success',
    });
  }, [nodes, show, triggerSave, updateNodeData]);

  // Places unfurled media as unattached reference nodes, laid out in a centered
  // row at the viewport center. Nodes have no edges, so they are inert references
  // until the user wires them into a generator.
  const placeImportedReferenceNodes = useCallback(
    (items: ReferenceMediaItem[], { inline = true }: { inline?: boolean } = {}) => {
      if (items.length === 0) return;
      takeSnapshot();
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
      const center = screenToFlowPosition({ x: viewportWidth / 2, y: viewportHeight / 2 });
      const positions = layoutInRow(items.length, center);
      const built = buildReferenceNodes(items, positions, () => uuidv4());
      const newNodes = built.map(
        (node) =>
          ({
            id: node.id,
            type: node.type,
            position: node.position,
            data: node.data as StudioNode['data'],
            style: node.style,
          }) as StudioNode,
      );
      setNodes(nodes.concat(newNodes));
      triggerSave();

      // Instagram CDN urls EXPIRE, so those references are inlined to base64 in
      // the background. Sources whose urls are durable and public opt out with
      // `inline: false` and stay hotlinked — which the wire already supports
      // (a node holding an http url ships as `reference_images[].image_url`, and
      // the Backend fetches it at generation time).
      if (inline) {
        void inlineReferenceImageNodes(built, {
          inline: inlineRemoteImage,
          updateNodeData,
        });
      }
    },
    [nodes, screenToFlowPosition, setNodes, takeSnapshot, triggerSave, updateNodeData],
  );

  // Unsplash photos stay hotlinked rather than inlined: their urls are durable
  // and public, and the licence requires the CDN url to be the one displayed.
  // Selecting a photo is also the moment Unsplash must be told about — that ping
  // credits the photographer, so it fires here and is deliberately not awaited.
  const placeUnsplashPhoto = useCallback(
    (photo: UnsplashPhoto) => {
      if (brandProfileId) {
        void trackUnsplashDownload({
          brandId: brandProfileId,
          downloadLocation: photo.downloadLocation,
        });
      }
      placeImportedReferenceNodes(
        [
          {
            kind: 'image',
            url: photo.url,
            width: photo.width,
            height: photo.height,
            ...(photo.alt ? { alt: photo.alt } : {}),
            attribution: {
              provider: 'unsplash',
              photographerName: photo.photographerName,
              photographerUrl: photo.photographerUrl,
              sourceUrl: photo.unsplashUrl,
            },
          },
        ],
        { inline: false },
      );
    },
    [brandProfileId, placeImportedReferenceNodes],
  );

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
    (
      type: StudioCanvasNodeType,
      options?: { model?: VideoGeneratorModel; actionId?: ActionId },
    ) => {
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

  const handleAddNodeOpenChange = useCallback((open: boolean) => {
    if (open) {
      addNodeAnchorRef.current = contextMenuAnchorRef.current ?? lastMousePositionRef.current;
    }
  }, []);

  const addNodeFromPalette = useCallback(
    (
      type: StudioCanvasNodeType,
      options?: { model?: VideoGeneratorModel; actionId?: ActionId },
    ) => {
      if (addNodeAnchorRef.current) lastMousePositionRef.current = addNodeAnchorRef.current;
      addNodeAtPointer(type, options);
      contextMenuActionsRef.current?.close();
    },
    [addNodeAtPointer],
  );

  // The Techniques submenu: the same anchor a node add lands on, through the one apply
  // path every saved graph travels (useApplyWorkflow snapshots, saves and fits the view).
  const techniques = useTechniques(brandProfileId);
  const applyWorkflow = useApplyWorkflow();
  const applyTechniqueFromPalette = useCallback(
    (technique: TechniqueItem, { collapsed }: { collapsed: boolean }) => {
      const anchor = addNodeAnchorRef.current ?? lastMousePositionRef.current;
      const position = screenToFlowPosition(anchor);
      contextMenuActionsRef.current?.close();
      void applyWorkflow(technique.workflow, techniqueApplyOptions(position, collapsed));
    },
    [applyWorkflow, screenToFlowPosition],
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

  usePlannerSeedHydration({ organicPlannerSeed, activeRoomId, isLoading });

  useCanvasKeyboardShortcuts();

  const readyNodeIds = useMemo(() => computeReadyNodeIds(nodes, edges), [edges, nodes]);

  const styledEdges = useMemo(
    () => computeStyledEdges(edges, nodes, readyNodeIds),
    [edges, nodes, readyNodeIds],
  );

  const { onDragOver, onDrop, onNodeDragStart, onNodeDragStop } = useCanvasDnD();

  const isValidConnectionCallback = useCallback(
    (connection: ReactFlowConnection | Edge) => {
      return isValidConnection(connection, edges, nodes);
    },
    [edges, nodes],
  );

  // Collapsed-technique fold: a pure display derivation between the store and the
  // canvas. With nothing collapsed it returns the inputs by reference and every
  // handler unwrapped, so an unfolded canvas is bit-for-bit unchanged.
  const folded = useFoldedGraph(nodes, styledEdges, {
    onNodesChange,
    onConnect,
    isValidConnection: isValidConnectionCallback,
  });
  const validationIssues = useMemo(
    () => validateWorkflowGraph({ nodes, edges }).issues,
    [edges, nodes],
  );

  // xyflow only fires onReconnect when the dragged endpoint lands on a handle. Dropping it
  // on empty canvas fires nothing at all, so without the pair below the edge silently snaps
  // back: the user watches the image detach and reattach, and the publisher keeps counting
  // it as connected because state.edges never changed.
  const reconnectLandedOnHandle = useRef(false);

  const onReconnectStart = useCallback(() => {
    reconnectLandedOnHandle.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, connection: ReactFlowConnection) => {
      // Set before validating: an incompatible handle is still a drop on a handle, and that
      // must keep the edge — we warn instead — rather than fall through to deletion.
      reconnectLandedOnHandle.current = true;
      const normalized = connection as ReactFlowConnection;
      const remainingEdges = edges.filter((edge) => edge.id !== oldEdge.id);
      if (!isValidConnection(normalized, remainingEdges, nodes)) {
        show({
          title: 'That connection does not fit',
          description: 'Choose a compatible port with available capacity.',
          variant: 'error',
        });
        return;
      }
      takeSnapshot();
      setEdges(reconnectEdge(oldEdge, normalized, edges));
      triggerSave();
    },
    [edges, nodes, setEdges, show, takeSnapshot, triggerSave],
  );

  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, oldEdge: Edge) => {
      if (reconnectLandedOnHandle.current) return;
      takeSnapshot();
      setEdges(edges.filter((edge) => edge.id !== oldEdge.id));
      triggerSave();
    },
    [edges, setEdges, takeSnapshot, triggerSave],
  );

  if (isLoading) {
    return <CanvasMediaLoader />;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: canvas wrapper tracks cursor position for real-time collaboration; no semantic role applies
    <div
      className="relative h-full min-h-0 w-full"
      ref={reactFlowWrapper}
      onMouseMove={handleMouseMove}
    >
      {/* A modal editor portals to document.body but stays inside the REACT tree under
          the trigger, so its right-clicks bubble into ContextMenuTrigger's onContextMenu
          and open the canvas menu over the dialog. Base UI's trigger has no disabled prop
          of its own — it reads the menu ROOT's `disabled` off the store and bails before
          opening — so the stand-down belongs here, on the root, mirroring deleteKeyCode. */}
      <ContextMenu
        disabled={keyboardScope === 'modal'}
        onOpenChange={handleContextMenuOpenChange}
        actionsRef={contextMenuActionsRef}
      >
        <ContextMenuTrigger className="block h-full w-full">
          <Canvas
            nodes={folded.nodes}
            edges={folded.edges}
            onNodesChange={folded.onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={folded.onConnect}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            edgesReconnectable
            nodeTypes={CANVAS_NODE_TYPES_WITH_FOLD}
            edgeTypes={edgeTypes}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            isValidConnection={folded.isValidConnection}
            connectionLineComponent={ConnectionLine}
            // Default 20px is tight against our 12-16px handles, especially on
            // video-generator nodes stacking up to 6 target handles closely.
            connectionRadius={24}
            // While a modal editor owns the keyboard, disable React Flow's own
            // Backspace/Delete node-deletion. Spread conditionally: passing
            // deleteKeyCode={undefined} would still override the Canvas default
            // (["Backspace","Delete"]) since Canvas spreads props after it, so
            // only inject the prop in the modal case. null = no delete key.
            {...(keyboardScope === 'modal' ? { deleteKeyCode: null } : {})}
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
            <Panel
              position="top-left"
              className="flex items-center gap-2 bg-background/95 p-1 backdrop-blur"
            >
              <InteractionModeToggle />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsLibraryBrowserOpen((open) => !open)}
                aria-label="Browse media library"
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                Library
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsInstagramBrowserOpen((open) => !open)}
                aria-label="Import media from Instagram"
              >
                <AtSign className="mr-2 h-4 w-4" />
                Import from Instagram
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsUnsplashBrowserOpen((open) => !open)}
                aria-label="Search Unsplash photos"
              >
                <Camera className="mr-2 h-4 w-4" />
                Unsplash
              </Button>
            </Panel>

            {isLibraryBrowserOpen && (
              <CanvasFloatingPanel
                title="Media Library"
                icon={<FolderOpen className="size-4" aria-hidden />}
                onClose={() => setIsLibraryBrowserOpen(false)}
                className="h-[560px] w-[360px]"
              >
                <StudioMediaLibraryPanel brandProfileId={brandProfileId || ''} />
              </CanvasFloatingPanel>
            )}

            {isInstagramBrowserOpen && (
              <InstagramMediaBrowser
                brandProfileId={brandProfileId}
                onPlace={placeImportedReferenceNodes}
                onClose={() => setIsInstagramBrowserOpen(false)}
              />
            )}

            {isUnsplashBrowserOpen && (
              <UnsplashBrowser
                brandProfileId={brandProfileId}
                onPick={placeUnsplashPhoto}
                onClose={() => setIsUnsplashBrowserOpen(false)}
              />
            )}

            <CanvasValidationPanel
              issues={validationIssues}
              onFocusIssue={(nodeId) => {
                setNodes(nodes.map((node) => ({ ...node, selected: node.id === nodeId })));
                void fitView({ nodes: [{ id: nodeId }], duration: 250, padding: 0.5 });
              }}
            />

            <NodeInspectorPanel onEnforceBrandBook={enforceBrandBookOnSelection} />

            <Controls fitViewOptions={STUDIO_FIT_VIEW_OPTIONS} />
            {/* Same corner as Controls; the left margin clears the control bar so they sit side by side. */}
            <MiniMap position="bottom-left" className="!ml-14 !border !bg-background/95" />

            {Object.entries(remoteCursors).map(([userId, cursor]) => (
              <Cursor
                key={userId}
                x={cursor.x}
                y={cursor.y}
                color={cursor.color}
                name={cursor.name}
              />
            ))}

            {pendingSourceDrop && (
              <SourceDropNodePicker
                candidates={pendingSourceDrop.candidates}
                screenPosition={pendingSourceDrop.screenPosition}
                onSelect={resolveSourceDropPick}
                onDismiss={dismissSourceDropPick}
              />
            )}

            <Panel
              position="bottom-right"
              className="mb-4 mr-4 border-none bg-transparent p-0 shadow-none"
            >
              <AIStudioChat
                brandProfileId={brandProfileId || ''}
                roomId={activeRoomId}
                onOpenChange={setIsChatOpen}
              />
            </Panel>

            <CanvasShortcutsPanel />
          </Canvas>
        </ContextMenuTrigger>

        <CanvasContextMenuContent
          addNode={addNodeFromPalette}
          onAddNodeOpenChange={handleAddNodeOpenChange}
          techniques={techniques}
          onApplyTechnique={applyTechniqueFromPalette}
          openLoadWorkflow={() => setIsLoadWorkflowOpen(true)}
          openInstagram={() => setIsInstagramBrowserOpen(true)}
          openSaveStarter={openSaveStarter}
          enforceBrandBookOnSelection={enforceBrandBookOnSelection}
          clearCanvas={clearCanvas}
          hasSelection={nodes.some((node) => node.selected)}
          interactionMode={interactionMode}
          setInteractionMode={setInteractionMode}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          fitView={fitView}
        />
      </ContextMenu>
      {/* Overlaid on the canvas rather than mounted as a React Flow Panel: the hero
          state centres itself on an empty canvas, which the Panel grid cannot express. */}
      <CanvasComposer
        brandProfileId={brandProfileId}
        roomId={activeRoomId}
        isCanvasEmpty={nodes.length === 0}
        selectedNodeIds={selectedNodeIds}
        chatOpen={isChatOpen}
        onRun={handleComposerRun}
      />
      <LoadWorkflowDialog
        brandProfileId={brandProfileId}
        open={isLoadWorkflowOpen}
        onOpenChange={setIsLoadWorkflowOpen}
        showTrigger={false}
      />
      <SaveStarterDialog
        open={isSaveStarterOpen}
        onOpenChange={setIsSaveStarterOpen}
        brandProfileId={brandProfileId}
        nodes={starterSelectionNodes}
      />
    </div>
  );
}

interface StudioCanvasProps {
  embedded?: boolean;
  brandProfileId?: string;
  initialRoomId?: string;
  focusNodeId?: string;
  organicPlannerSeed?: PlannerAiStudioHandoff | null;
}

export function StudioCanvas({
  embedded = false,
  brandProfileId,
  initialRoomId,
  focusNodeId,
  organicPlannerSeed,
}: StudioCanvasProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.toString();
  const { rooms, isLoading: roomsLoading } = useCanvasRooms(brandProfileId || '');
  // A room id only means something paired with the brand it was picked for. An in-app brand
  // switch is a soft refresh, so this component stays mounted and a room held on its own is
  // still the PREVIOUS brand's on the render the new brand arrives — which realtime, its
  // canvas_active_view heartbeat and the run-request hooks would all read as a real pair,
  // before any effect gets a chance to correct it. Stamping the brand onto the selection and
  // deriving the room during render makes that pair unrepresentable, while the
  // server-resolved initialRoomId still connects on first paint.
  const [roomSelection, setRoomSelection] = useState<{
    brandProfileId?: string;
    roomId?: string;
  }>(() => ({ brandProfileId, roomId: initialRoomId }));
  const activeRoomId =
    roomSelection.brandProfileId === brandProfileId ? roomSelection.roomId : undefined;
  const selectRoom = useCallback(
    (roomId: string | undefined) => {
      if (roomId !== activeRoomId) {
        useStudioStore.getState().resetForRoomSwitch();
      }
      setRoomSelection({ brandProfileId, roomId });
      router.replace(canvasRoomHref(currentSearch, roomId), { scroll: false });
    },
    [activeRoomId, brandProfileId, currentSearch, router],
  );
  const plannerApply = useApplyBackToPlanner({ brandProfileId, organicPlannerSeed });

  // The room itself is fenced above; this drops the previous brand's graph and its room
  // param. resetForBrandSwitch takes the new brand because child effects run before parent
  // ones — Flow's setBrandId has already run by the time this does, and an arg-less reset
  // would wipe it back to undefined.
  const previousBrandRef = useRef(brandProfileId);
  useEffect(() => {
    if (previousBrandRef.current === brandProfileId) return;
    previousBrandRef.current = brandProfileId;
    useStudioStore.getState().resetForBrandSwitch(brandProfileId);
    router.replace(canvasRoomHref(currentSearch, undefined), { scroll: false });
  }, [brandProfileId, currentSearch, router]);

  // useCanvasRooms keeps the previous brand's rows until its refetch lands, so fall back to
  // the first room OF THIS BRAND rather than the first row in the array.
  useEffect(() => {
    if (activeRoomId) return;
    const firstBrandRoom = rooms.find((room) => room.brand_profile_id === brandProfileId);
    if (firstBrandRoom) {
      selectRoom(firstBrandRoom.id);
    }
  }, [activeRoomId, brandProfileId, rooms, selectRoom]);

  const realtime = useCanvasRealtime(brandProfileId || '', activeRoomId);
  const canvasRuntime = useMemo(
    () =>
      brandProfileId && activeRoomId
        ? {
            brandProfileId,
            roomId: activeRoomId,
            flushSave: realtime.saveCanvasToDatabase,
          }
        : null,
    [activeRoomId, brandProfileId, realtime.saveCanvasToDatabase],
  );
  return (
    <ReactFlowProvider>
      <div className="flex h-full min-h-0 w-full flex-col bg-background">
        {!embedded && (
          <StudioCanvasHeader
            brandProfileId={brandProfileId}
            activeRoomId={activeRoomId}
            onRoomChange={selectRoom}
            roomsLoading={roomsLoading}
            realtime={realtime}
            apply={plannerApply}
          />
        )}

        <main className="relative flex-1 min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-950">
          <CanvasRuntimeProvider value={canvasRuntime}>
            <Flow
              brandProfileId={brandProfileId}
              realtime={realtime}
              activeRoomId={activeRoomId}
              focusNodeId={focusNodeId}
              organicPlannerSeed={organicPlannerSeed}
            />
          </CanvasRuntimeProvider>
        </main>
      </div>
    </ReactFlowProvider>
  );
}
