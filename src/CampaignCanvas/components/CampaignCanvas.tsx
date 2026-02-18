import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import {
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  Node,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Canvas } from '@/components/ai-elements/canvas';
import { Controls } from '@/components/ai-elements/controls';
import { Panel } from '@/components/ai-elements/panel';
import { Connection } from '@/components/ai-elements/connection';
import { Edge } from '@/components/ai-elements/edge';

import { useCampaignStore } from '../stores/useCampaignStore';
import { CampaignNode } from './CampaignNode';
import { AdSetNode } from './AdSetNode';
import { AdNode } from './AdNode';
import { AudienceNode } from './AudienceNode';
import { CreativeNode } from './CreativeNode';
import { BudgetNode } from './BudgetNode';
import { type CampaignNodeType } from '../types';
import { Button } from '@/components/ui/button';
import { Plus, Send, ShieldCheck, Trash2, Undo, Redo, Settings, MousePointer2, Download } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
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
    updateNodeData,
    undo,
    redo,
    edgeStyle,
    setEdgeStyle,
    validateGraph 
  } = useCampaignStore();

  const { screenToFlowPosition, fitView } = useReactFlow();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

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
    if (selectedNodes.length === 0 && !selectedNodeId) return;
    
    if (selectedNodes.length > 0) {
      selectedNodes.forEach((n) => removeNode(n.id));
      toast({
        title: "Nodes deleted",
        description: `Removed ${selectedNodes.length} node(s) from the canvas.`,
      });
    } else if (selectedNodeId) {
       removeNode(selectedNodeId);
       toast({
        title: "Node deleted",
        description: "The selected node has been removed.",
      });
    }
    
    setSelectedNodeId(null);
    setShowDeleteDialog(false);
  }, [nodes, removeNode, selectedNodeId, toast]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

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

  useEffect(() => {
    const selected = nodes.find(n => n.selected);
    if (selected && selected.id !== selectedNodeId) {
      setSelectedNodeId(selected.id);
    }
  }, [nodes, selectedNodeId]);

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
          if (selectedNodes.length > 0 || (selectedNodeId && nodes.find(n => n.id === selectedNodeId)?.selected)) {
            setShowDeleteDialog(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, selectedNodeId, undo, redo, duplicateNode, toast]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

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
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
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
            <ContextMenuSubTrigger inset>Add Node</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuItem onClick={() => handleAddNode('campaign')}>
                <Plus className="mr-2 h-4 w-4" /> Campaign
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleAddNode('ad-set')}>
                <Plus className="mr-2 h-4 w-4" /> Ad Set
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleAddNode('ad')}>
                <Plus className="mr-2 h-4 w-4" /> Ad
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => handleAddNode('audience')}>
                <Plus className="mr-2 h-4 w-4" /> Audience
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleAddNode('creative')}>
                <Plus className="mr-2 h-4 w-4" /> Creative
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleAddNode('budget')}>
                <Plus className="mr-2 h-4 w-4" /> Budget
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger inset>
               <Settings className="mr-2 h-4 w-4" /> Canvas Settings
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
               <ContextMenuCheckboxItem checked={edgeStyle === 'curved'} onClick={() => setEdgeStyle('curved')}>
                  Curved Connections
               </ContextMenuCheckboxItem>
               <ContextMenuCheckboxItem checked={edgeStyle === 'straight'} onClick={() => setEdgeStyle('straight')}>
                  Straight Connections
               </ContextMenuCheckboxItem>
               <ContextMenuSeparator />
               <ContextMenuItem onClick={() => fitView({ duration: 800 })}>
                  Fit to Screen
               </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuContent>
      </ContextMenu>

      {/* Properties Sheet */}
      <Sheet open={!!selectedNodeId} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Node Properties</SheetTitle>
            <SheetDescription>
              Edit {selectedNode?.type} details.
            </SheetDescription>
          </SheetHeader>
          
          <Separator className="my-4" />

          {selectedNode && (
            <div className="grid gap-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Label</Label>
                <Input
                  id="name"
                  value={selectedNode.data.label as string}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                />
              </div>
              
              <Separator />
              
              <div className="flex flex-col gap-2 pt-4">
                 <Button variant="outline" className="w-full justify-start gap-2" onClick={() => duplicateNode(selectedNode.id)}>
                    <Plus className="h-4 w-4" /> Duplicate Node
                 </Button>
                 <Button variant="destructive" className="w-full justify-start gap-2" onClick={() => setShowDeleteDialog(true)}>
                    <Trash2 className="h-4 w-4" /> Delete Node
                 </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

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
