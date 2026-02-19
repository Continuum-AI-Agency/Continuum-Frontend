"use client";
import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import {
  MiniMap,
  useReactFlow,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Canvas } from '@/components/ai-elements/canvas';
import { Controls } from '@/components/ai-elements/controls';
import { Panel } from '@/components/ai-elements/panel';
import { Connection } from '@/components/ai-elements/connection';
import { Edge } from '@/components/ai-elements/edge';

import { useCampaignStore } from '../stores/useCampaignStore';
import { CampaignNode } from '../nodes/CampaignNode';
import { AdSetNode } from '../nodes/AdSetNode';
import { AdNode } from '../nodes/AdNode';
import { AudienceNode } from '../nodes/AudienceNode';
import { CreativeNode } from '../nodes/CreativeNode';
import { BudgetNode } from '../nodes/BudgetNode';
import { type CampaignNodeType } from '../types';
import { Button } from '@/components/ui/button';
import { Plus, Send, ShieldCheck, Download, Undo, Redo, Settings, MousePointer2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

const nodeTypes = {
  campaign: CampaignNode,
  'ad-set': AdSetNode,
  ad: AdNode,
  audience: AudienceNode,
  creative: CreativeNode,
  budget: BudgetNode,
};

const edgeTypes = {
  animated: Edge.Animated,
};

export const CampaignCanvas = () => {
  const { 
    nodes, 
    edges, 
    onNodesChange, 
    onEdgesChange, 
    onConnect, 
    addNode, 
    removeNode,
    duplicateNode,
    undo,
    redo,
    edgeStyle,
    setEdgeStyle,
    validateGraph 
  } = useCampaignStore();

  const { screenToFlowPosition, fitView } = useReactFlow();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { show: toast } = useToast();

  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    lastMousePos.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleAddNode = useCallback((type: CampaignNodeType) => {
    const position = screenToFlowPosition({
      x: lastMousePos.current.x,
      y: lastMousePos.current.y,
    });
    addNode(type, {}, position);
  }, [addNode, screenToFlowPosition]);

  const confirmDelete = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;
    
    selectedNodes.forEach((n) => removeNode(n.id));
    toast({
      title: "Nodes deleted",
      description: `Removed ${selectedNodes.length} node(s) from the canvas.`,
    });
    
    setShowDeleteDialog(false);
  }, [nodes, removeNode, toast]);

  const handleExport = useCallback(() => {
    const data = { nodes, edges };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaign-structure.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Campaign structure downloaded as JSON." });
  }, [nodes, edges, toast]);

  const selectedCount = useMemo(() => nodes.filter(n => n.selected).length, [nodes]);

  const defaultEdgeOptions = useMemo(() => ({
    type: 'animated',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: 'var(--ring)',
    },
  }), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmd = event.metaKey || event.ctrlKey;
      
      if (isCmd && event.key === 'z') {
        if (event.shiftKey) {
          redo();
          toast({ title: "Redo", duration: 1000 });
        } else {
          undo();
          toast({ title: "Undo", duration: 1000 });
        }
      } else if (isCmd && event.key === 'd') {
        event.preventDefault();
        const selected = nodes.find(n => n.selected);
        if (selected) duplicateNode(selected.id);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        const activeElement = document.activeElement;
        if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
          const selectedNodes = nodes.filter(n => n.selected);
          if (selectedNodes.length > 0) {
            setShowDeleteDialog(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, undo, redo, duplicateNode, toast]);

  return (
    <div className="relative h-full w-full" onMouseMove={handleMouseMove}>
      <ContextMenu>
        <ContextMenuTrigger className="h-full w-full block">
          <Canvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            connectionLineComponent={Connection}
            fitView
          >
            <Controls />
            <MiniMap zoomable pannable className="!bg-background border shadow-sm" />
            
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
                  <Badge variant="secondary" className="gap-2 px-3 py-1 text-xs font-medium border shadow-sm animate-in fade-in slide-in-from-top-2">
                    <MousePointer2 className="h-3 w-3" />
                    {selectedCount} nodes selected
                  </Badge>
               </Panel>
            )}

            <Panel position="bottom-right" className="flex flex-col gap-2 bg-transparent border-none shadow-none!">
              <Button variant="outline" className="gap-2 bg-background shadow-lg" onClick={validateGraph}>
                <ShieldCheck className="h-4 w-4 text-primary" />
                Validate
              </Button>
              <Button className="gap-2 shadow-lg" onClick={() => console.log('Deploying...')}>
                <Send className="h-4 w-4" />
                Deploy
              </Button>
            </Panel>
          </Canvas>
        </ContextMenuTrigger>
        
        <ContextMenuContent className="w-64">
          <ContextMenuLabel>Workspace Actions</ContextMenuLabel>
          <ContextMenuItem inset onClick={() => toast({ title: "Paste", description: "Functionality coming soon" })}>
            Paste
            <ContextMenuShortcut>⌘V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem inset onClick={() => toast({ title: "Select All", description: "Functionality coming soon" })}>
            Select All
            <ContextMenuShortcut>⌘A</ContextMenuShortcut>
          </ContextMenuItem>
          
          <ContextMenuSeparator />
          
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
              <Plus className="mr-2 h-4 w-4" />
              Add Component
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              <ContextMenuItem onClick={() => handleAddNode('campaign')}>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  Campaign
                </div>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleAddNode('ad-set')}>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-purple-500" />
                  Ad Set
                </div>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleAddNode('ad')}>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  Ad
                </div>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => handleAddNode('audience')}>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  Audience
                </div>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleAddNode('creative')}>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-pink-500" />
                  Creative
                </div>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleAddNode('budget')}>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500" />
                  Budget
                </div>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuLabel>Canvas & View</ContextMenuLabel>
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
               <Settings className="mr-2 h-4 w-4" />
               View Settings
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
               <ContextMenuCheckboxItem checked={edgeStyle === 'curved'} onClick={() => setEdgeStyle('curved')}>
                  Curved Connections
               </ContextMenuCheckboxItem>
               <ContextMenuCheckboxItem checked={edgeStyle === 'straight'} onClick={() => setEdgeStyle('straight')}>
                  Straight Connections
               </ContextMenuCheckboxItem>
               <ContextMenuSeparator />
               <ContextMenuItem onClick={() => fitView({ duration: 800 })}>
                  Fit to Screen
                  <ContextMenuShortcut>⇧F</ContextMenuShortcut>
               </ContextMenuItem>
               <ContextMenuItem onClick={() => fitView({ padding: 0.5, duration: 800 })}>
                  Zoom to Content
               </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>

          <ContextMenuSeparator />

          <ContextMenuLabel>Campaign Tools</ContextMenuLabel>
          <ContextMenuItem inset onClick={validateGraph}>
            <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
            Validate Structure
          </ContextMenuItem>
          <ContextMenuItem inset onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Schema (JSON)
          </ContextMenuItem>
          
          <ContextMenuSeparator />
          
          <ContextMenuItem inset className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => setShowDeleteDialog(true)} disabled={selectedCount === 0}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Selected
            <ContextMenuShortcut>⌫</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected
              node(s) and all their associated connections.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
