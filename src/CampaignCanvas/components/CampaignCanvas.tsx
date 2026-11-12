'use client';

import {
  type Connection as FlowConnection,
  MarkerType,
  MiniMap,
  type NodeTypes,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type OnConnectStartParams,
  type NodeProps as ReactFlowNodeProps,
  useReactFlow,
} from '@xyflow/react';
import { useTranslations } from 'next-intl';
import React, {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import '@xyflow/react/dist/style.css';

import {
  Download,
  MousePointer2,
  Plus,
  Redo,
  Settings,
  ShieldCheck,
  Trash2,
  Undo,
} from 'lucide-react';
import { Canvas } from '@/components/ai-elements/canvas';
import { Connection } from '@/components/ai-elements/connection';
import { Controls } from '@/components/ai-elements/controls';
import { Edge } from '@/components/ai-elements/edge';
import { Panel } from '@/components/ai-elements/panel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useToast } from '@/components/ui/ToastProvider';
import { buildCampaignCanvasPayload } from '@/lib/campaign-canvas/payload';
import { AdNode } from '../nodes/AdNode';
import { AdSetNode } from '../nodes/AdSetNode';
import { AudienceNode } from '../nodes/AudienceNode';
import { CampaignNode } from '../nodes/CampaignNode';
import { CreativeNode } from '../nodes/CreativeNode';
import { OpenAiAdGroupNode } from '../nodes/OpenAiAdGroupNode';
import { OpenAiAdNode } from '../nodes/OpenAiAdNode';
import { OpenAiCampaignNode } from '../nodes/OpenAiCampaignNode';
import { seedDataForConnectedNode, useCampaignStore } from '../stores/useCampaignStore';
import type { CampaignNodeType } from '../types';
import { getNodeTypeToCreateFromHandle, getTargetHandleIdFor } from '../types/hierarchyNavigation';
import {
  getSingleParentConstraintMessage,
  hasExistingSingleParentAttachment,
  isSingleParentRelationship,
} from '../validation/hierarchyRelationships';
import { CanvasInspector } from './inspector/CanvasInspector';

const nodeTypes: NodeTypes = {
  campaign: CampaignNode as unknown as ComponentType<ReactFlowNodeProps>,
  'ad-set': AdSetNode as unknown as ComponentType<ReactFlowNodeProps>,
  ad: AdNode as unknown as ComponentType<ReactFlowNodeProps>,
  audience: AudienceNode as unknown as ComponentType<ReactFlowNodeProps>,
  creative: CreativeNode as unknown as ComponentType<ReactFlowNodeProps>,
  'openai-campaign': OpenAiCampaignNode as unknown as ComponentType<ReactFlowNodeProps>,
  'openai-ad-group': OpenAiAdGroupNode as unknown as ComponentType<ReactFlowNodeProps>,
  'openai-ad': OpenAiAdNode as unknown as ComponentType<ReactFlowNodeProps>,
};

const edgeTypes = {
  animated: Edge.Animated,
};

function getClientPositionFromPointerEvent(
  event: MouseEvent | TouchEvent,
): { x: number; y: number } | null {
  if ('changedTouches' in event && event.changedTouches.length > 0) {
    return {
      x: event.changedTouches[0]!.clientX,
      y: event.changedTouches[0]!.clientY,
    };
  }

  if ('clientX' in event && 'clientY' in event) {
    return { x: event.clientX, y: event.clientY };
  }

  return null;
}

export const CampaignCanvas = () => {
  const uiText = useTranslations('scale');
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    connectionBlockReason,
    childBlockReason,
    editLocked,
    addNode,
    removeNode,
    duplicateNode,
    undo,
    redo,
    edgeStyle,
    setEdgeStyle,
    validateGraph,
    platform,
  } = useCampaignStore();

  const { screenToFlowPosition, fitView } = useReactFlow();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { show: toast } = useToast();

  const surfaceRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const connectStartRef = useRef<OnConnectStartParams | null>(null);

  /**
   * Where the pointer last was, so "Add Component" drops a node under the cursor.
   *
   * Attached imperatively rather than as an `onMouseMove` prop: a bare handler on a
   * plain div is an interaction with no role and no keyboard path, which is what
   * `a11y/noStaticElementInteractions` exists to catch. This listener adds no
   * affordance — every one of them lives in a child (the canvas, the context menu, the
   * buttons) and each is reachable on its own — so the honest fix is to keep it out of
   * the accessibility tree rather than label the div interactive.
   */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const track = (event: MouseEvent) => {
      lastMousePos.current = { x: event.clientX, y: event.clientY };
    };
    surface.addEventListener('mousemove', track, { passive: true });
    return () => surface.removeEventListener('mousemove', track);
  }, []);

  const handleAddNode = useCallback(
    (type: CampaignNodeType) => {
      const position = screenToFlowPosition({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y,
      });
      addNode(type, {}, position);
    },
    [addNode, screenToFlowPosition],
  );

  const handleConnect = useCallback<OnConnect>(
    (connection) => {
      const reason = connectionBlockReason(connection);
      if (reason) {
        toast({ title: uiText('connection_blocked_e312a28'), description: reason });
        return;
      }
      onConnect(connection);
    },
    [connectionBlockReason, onConnect, toast, uiText],
  );

  const isValidConnection = useCallback(
    (connection: FlowConnection | { source: string | null; target: string | null }) => {
      if (!connection.source || !connection.target) return true;
      return (
        connectionBlockReason({
          source: connection.source,
          target: connection.target,
          sourceHandle: 'sourceHandle' in connection ? (connection.sourceHandle ?? null) : null,
          targetHandle: 'targetHandle' in connection ? (connection.targetHandle ?? null) : null,
        }) === null
      );
    },
    [connectionBlockReason],
  );

  const handleConnectStart = useCallback<OnConnectStart>((_event, params) => {
    connectStartRef.current = params;
  }, []);

  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      const connectStart = connectStartRef.current;
      connectStartRef.current = null;

      if (!connectStart?.nodeId || !connectStart.handleType) {
        return;
      }

      // A valid drop onto an existing node is handled by React Flow via onConnect.
      if (connectionState.toNode) {
        return;
      }

      const startNode = nodes.find((node) => node.id === connectStart.nodeId);
      if (!startNode) {
        return;
      }

      const nodeTypeToCreate = getNodeTypeToCreateFromHandle(
        startNode.type,
        connectStart.handleType,
        connectStart.handleId ?? null,
      );
      if (!nodeTypeToCreate) {
        return;
      }

      if (
        connectStart.handleType === 'target' &&
        isSingleParentRelationship(startNode.type, nodeTypeToCreate) &&
        hasExistingSingleParentAttachment(startNode.id, nodeTypeToCreate, nodes, edges)
      ) {
        toast({
          title: uiText('connection_blocked_e312a28'),
          description: getSingleParentConstraintMessage(startNode.type, nodeTypeToCreate, uiText),
        });
        return;
      }

      // Asked BEFORE the node exists: a child the rules refuse would otherwise be drawn and then
      // left stranded when its edge is refused.
      const childRefusal =
        connectStart.handleType === 'source'
          ? childBlockReason(startNode.id, nodeTypeToCreate)
          : null;
      if (childRefusal) {
        toast({ title: uiText('connection_blocked_e312a28'), description: childRefusal });
        return;
      }

      const pointerPosition = getClientPositionFromPointerEvent(event);
      if (!pointerPosition) {
        return;
      }

      const nodePosition = screenToFlowPosition(pointerPosition);
      const newNodeId = addNode(
        nodeTypeToCreate,
        seedDataForConnectedNode(startNode, nodeTypeToCreate),
        nodePosition,
      );

      if (connectStart.handleType === 'source') {
        handleConnect({
          source: connectStart.nodeId,
          sourceHandle: connectStart.handleId,
          target: newNodeId,
          targetHandle: getTargetHandleIdFor(startNode.type, nodeTypeToCreate),
        });
        return;
      }

      handleConnect({
        source: newNodeId,
        sourceHandle: null,
        target: connectStart.nodeId,
        targetHandle: connectStart.handleId,
      });
    },
    [addNode, childBlockReason, edges, handleConnect, nodes, screenToFlowPosition, toast, uiText],
  );

  const confirmDelete = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    selectedNodes.forEach((n) => removeNode(n.id));
    toast({
      title: uiText('nodes_deleted_f2aeda3'),
      description: `Removed ${selectedNodes.length} node(s) from the canvas.`,
    });

    setShowDeleteDialog(false);
  }, [nodes, removeNode, toast, uiText]);

  const handleExport = useCallback(() => {
    const payload = buildCampaignCanvasPayload(nodes, edges, { source: 'export' });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaign-canvas-payload.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: uiText('exported_391065e'),
      description: uiText('canonical_campaign_payload_downloaded_as_json_c448c35'),
    });
  }, [nodes, edges, toast, uiText]);

  const handleValidateStructure = useCallback(() => {
    const validationResult = validateGraph();
    if (!validationResult.payloadValid) {
      toast({
        title: uiText('validation_failed_23a86f5'),
        description: validationResult.payloadError ?? 'Payload schema check failed.',
      });
      return;
    }

    if (validationResult.invalidNodeCount > 0) {
      toast({
        title: uiText('validation_warnings_d423e07'),
        description: `Found ${validationResult.invalidNodeCount} node(s) with errors. Payload schema passed.`,
      });
      return;
    }

    toast({
      title: uiText('structure_valid_30aaa9d'),
      description: uiText('graph_rules_and_canonical_payload_schema_both_6ad4494'),
    });
  }, [toast, validateGraph, uiText]);

  const selectedCount = useMemo(() => nodes.filter((n) => n.selected).length, [nodes]);

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'animated',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: 'var(--ring)',
      },
    }),
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmd = event.metaKey || event.ctrlKey;
      // Inside a field, ⌘Z is the field's own text undo. The inspector commits on blur,
      // so the canvas history only ever holds whole edits.
      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if (isCmd && event.key === 'z' && !inField) {
        if (event.shiftKey) {
          redo();
          toast({ title: uiText('redo_7427398'), durationMs: 1000 });
        } else {
          undo();
          toast({ title: uiText('undo_a8283ad'), durationMs: 1000 });
        }
      } else if (event.shiftKey && !isCmd && event.key.toLowerCase() === 'f' && !inField) {
        // The shortcut the "Fit to Screen" menu item advertises.
        fitView({ duration: 800 });
      } else if (isCmd && event.key === 'd' && !inField) {
        event.preventDefault();
        const selected = nodes.find((n) => n.selected);
        if (selected) duplicateNode(selected.id);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        const activeElement = document.activeElement;
        if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
          const selectedNodes = nodes.filter((n) => n.selected);
          if (selectedNodes.length > 0) {
            setShowDeleteDialog(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, undo, redo, duplicateNode, toast, fitView, uiText]);

  return (
    <div ref={surfaceRef} className="relative h-full w-full">
      <ContextMenu>
        {/*
          `contents` so this trigger does not generate a box that sits on top of
          React Flow. A `block h-full w-full` trigger ate pointer-down, which is
          why dragging a handle never completed an edge.
        */}
        <ContextMenuTrigger className="contents">
          <Canvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
            isValidConnection={isValidConnection}
            nodesConnectable={!editLocked}
            nodesDraggable={!editLocked}
            deleteKeyCode={editLocked ? null : undefined}
            panOnDrag
            selectionOnDrag={false}
            nodeTypes={nodeTypes as unknown as NodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineComponent={Connection}
            fitView
          >
            <Controls />
            {/* Bottom-left beside Controls, as on the Studio canvas: the right edge is the inspector's. */}
            <MiniMap
              position="bottom-left"
              zoomable
              pannable
              className="!ml-14 !bg-background border shadow-sm"
            />
            <CanvasInspector />

            <Panel position="top-left" className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={undo} className="h-8 w-8">
                <Undo className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={redo} className="h-8 w-8">
                <Redo className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleExport} className="h-8 w-8 ml-2">
                <Download className="h-4 w-4" />
              </Button>
            </Panel>

            {selectedCount > 1 && (
              <Panel position="top-right">
                <Badge
                  variant="secondary"
                  className="gap-2 px-3 py-1 text-xs font-medium border shadow-sm animate-in fade-in slide-in-from-top-2"
                >
                  {uiText.rich('sentence_edff45178e3b', {
                    v0: () => <MousePointer2 className="h-3 w-3" />,
                    v1: () => <span className="tabular-nums">{selectedCount}</span>,
                  })}
                </Badge>
              </Panel>
            )}

            <Panel
              position="bottom-right"
              className="flex flex-col gap-2 bg-transparent border-none shadow-none!"
            >
              <Button
                variant="outline"
                className="gap-2 bg-background shadow-lg"
                onClick={handleValidateStructure}
              >
                <ShieldCheck className="h-4 w-4 text-primary" />
                {uiText('validate_40611ab')}
              </Button>
            </Panel>
          </Canvas>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-[clamp(13rem,17vw,17rem)]">
          <ContextMenuLabel>{uiText('workspace_actions_a6d9491')}</ContextMenuLabel>
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
              <Plus className="mr-2 h-4 w-4" />
              {uiText('add_component_861860d')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              {platform === 'openai' ? (
                <>
                  <ContextMenuItem onClick={() => handleAddNode('openai-campaign')}>
                    <div className="flex items-center gap-2">
                      {uiText.rich('sentence_3e4f5e6a6aba', {
                        v0: () => <div className="h-2 w-2 rounded-full bg-emerald-500" />,
                      })}
                    </div>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleAddNode('openai-ad-group')}>
                    <div className="flex items-center gap-2">
                      {uiText.rich('sentence_a6676650b37f', {
                        v0: () => <div className="h-2 w-2 rounded-full bg-emerald-400" />,
                      })}
                    </div>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleAddNode('openai-ad')}>
                    <div className="flex items-center gap-2">
                      {uiText.rich('sentence_5740eb5d5ff0', {
                        v0: () => <div className="h-2 w-2 rounded-full bg-emerald-300" />,
                      })}
                    </div>
                  </ContextMenuItem>
                </>
              ) : (
                <>
                  <ContextMenuItem onClick={() => handleAddNode('campaign')}>
                    <div className="flex items-center gap-2">
                      {uiText.rich('sentence_3e4f5e6a6aba', {
                        v0: () => <div className="h-2 w-2 rounded-full bg-blue-500" />,
                      })}
                    </div>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleAddNode('ad-set')}>
                    <div className="flex items-center gap-2">
                      {uiText.rich('sentence_ae6f479f7b45', {
                        v0: () => <div className="h-2 w-2 rounded-full bg-primary" />,
                      })}
                    </div>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleAddNode('ad')}>
                    <div className="flex items-center gap-2">
                      {uiText.rich('sentence_82d9c2e74f58', {
                        v0: () => <div className="h-2 w-2 rounded-full bg-emerald-500" />,
                      })}
                    </div>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => handleAddNode('audience')}>
                    <div className="flex items-center gap-2">
                      {uiText.rich('sentence_8e2f9c33320e', {
                        v0: () => <div className="h-2 w-2 rounded-full bg-orange-500" />,
                      })}
                    </div>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleAddNode('creative')}>
                    <div className="flex items-center gap-2">
                      {uiText.rich('sentence_20dd3d8e9c28', {
                        v0: () => <div className="h-2 w-2 rounded-full bg-pink-500" />,
                      })}
                    </div>
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuLabel>{uiText('canvas_view_d9410cb')}</ContextMenuLabel>
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
              <Settings className="mr-2 h-4 w-4" />
              {uiText('view_settings_0f649a1')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              <ContextMenuCheckboxItem
                checked={edgeStyle === 'curved'}
                onClick={() => setEdgeStyle('curved')}
              >
                {uiText('curved_connections_4dd9330')}
              </ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem
                checked={edgeStyle === 'straight'}
                onClick={() => setEdgeStyle('straight')}
              >
                {uiText('straight_connections_14f63e9')}
              </ContextMenuCheckboxItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => fitView({ duration: 800 })}>
                {uiText.rich('sentence_a331638dfbc1', {
                  v0: () => <ContextMenuShortcut>⇧F</ContextMenuShortcut>,
                })}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => fitView({ padding: 0.5, duration: 800 })}>
                {uiText('zoom_to_content_9d7bcbf')}
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuLabel>{uiText('campaign_tools_962da48')}</ContextMenuLabel>
          <ContextMenuItem inset onClick={handleValidateStructure}>
            <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
            {uiText('validate_structure_b3a79fd')}
          </ContextMenuItem>
          <ContextMenuItem inset onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            {uiText('export_schema_json_1b4b72d')}
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem
            inset
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
            onClick={() => setShowDeleteDialog(true)}
            disabled={selectedCount === 0}
          >
            {uiText.rich('sentence_345ed10a1eac', {
              v0: () => <Trash2 className="mr-2 h-4 w-4" />,
              v1: () => <ContextMenuShortcut>⌫</ContextMenuShortcut>,
            })}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{uiText('are_you_absolutely_sure_0c88f5e')}</AlertDialogTitle>
            <AlertDialogDescription>
              {uiText('this_action_cannot_be_undone_this_will_perman_bbdbe79')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {uiText('delete_e2d0a54')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
