'use client';

import type { AutomationWorkflowNode } from '@continuum/contracts';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Copy,
  Crosshair,
  Eye,
  Focus,
  LockOpen,
  MessageSquareText,
  PanelLeft,
  PanelRight,
  Plus,
  Power,
  Search,
  Trash2,
  Unplug,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import {
  ContextMenu,
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
import { ContextMenuItemInfo } from '@/components/ui/context-menu-item-info';
import { AUTOMATION_NODE_CATALOG, localizedAutomationNodeCatalog } from './automationNodeCatalog';

export type WorkflowMenuTarget =
  | { kind: 'pane'; position: { x: number; y: number } }
  | { kind: 'node'; nodeId: string }
  | { kind: 'edge'; edgeId: string };

type WorkflowCanvasContextMenuProps = {
  /** Single element: it becomes the context-menu trigger via Base UI `render`. */
  children: ReactElement;
  target: WorkflowMenuTarget;
  locked: boolean;
  node: AutomationWorkflowNode | null;
  onAddNode: (type: AutomationWorkflowNode['type'], position: { x: number; y: number }) => void;
  onAddConnectedNode: (nodeId: string, type: AutomationWorkflowNode['type']) => void;
  onOpenLibrary: () => void;
  onConfigureNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
  onToggleNode: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onSelectEdgeSource: (edgeId: string) => void;
  onSelectEdgeTarget: (edgeId: string) => void;
  onFitView: () => void;
  onResetZoom: () => void;
  onSelectAll: () => void;
  onOpenInspector: () => void;
  onUnpublish: () => void;
};

export function WorkflowCanvasContextMenu({
  children,
  target,
  locked,
  node,
  onAddNode,
  onAddConnectedNode,
  onConfigureNode,
  onDeleteEdge,
  onDeleteNode,
  onDuplicateNode,
  onFitView,
  onOpenInspector,
  onOpenLibrary,
  onResetZoom,
  onSelectAll,
  onSelectEdgeSource,
  onSelectEdgeTarget,
  onToggleNode,
  onUnpublish,
}: WorkflowCanvasContextMenuProps) {
  const uiText = useTranslations('automations');
  const promptNode =
    node?.type === 'instruction' ||
    node?.type === 'agent' ||
    node?.type === 'output.formatter' ||
    node?.type === 'report' ||
    node?.type === 'action.ai_studio_generate';

  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="automation-workflow-popover w-64 rounded-lg p-1.5">
        {target.kind === 'pane' ? (
          <>
            <ContextMenuLabel>{uiText('canvas_3824a9f')}</ContextMenuLabel>
            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={locked}>
                <Plus className="mr-2 size-4" aria-hidden="true" />
                {uiText('add_node_here_91627a3')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="automation-workflow-popover w-56 rounded-lg p-1.5">
                {localizedAutomationNodeCatalog(uiText).map((group) => (
                  <ContextMenuSub key={group.category}>
                    <ContextMenuSubTrigger>{group.label}</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="automation-workflow-popover w-64 rounded-lg p-1.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <ContextMenuItem
                            key={item.type}
                            onSelect={() => onAddNode(item.type, target.position)}
                          >
                            <Icon className="mr-2 size-4" aria-hidden="true" />
                            <span className="truncate">{item.label}</span>
                          </ContextMenuItem>
                        );
                      })}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem onSelect={onOpenLibrary}>
              <Search className="mr-2 size-4" aria-hidden="true" />
              {uiText('m_33fb3ac6c0')}
              <ContextMenuShortcut>N</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onSelectAll}>
              <Crosshair className="mr-2 size-4" aria-hidden="true" />
              {uiText('m_913afff1fa')}
              <ContextMenuShortcut>⌘A</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={onFitView}>
              <Focus className="mr-2 size-4" aria-hidden="true" />
              {uiText('m_05e2160184')}
              <ContextMenuShortcut>F</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={onResetZoom}>
              <Eye className="mr-2 size-4" aria-hidden="true" />
              {uiText('m_e5737972ce')}
              <ContextMenuShortcut>0</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onOpenLibrary}>
              <PanelLeft className="mr-2 size-4" aria-hidden="true" />
              {uiText('open_node_library_e2b630d')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={onOpenInspector}>
              <PanelRight className="mr-2 size-4" aria-hidden="true" />
              {uiText('open_inspector_21dadf3')}
            </ContextMenuItem>
          </>
        ) : null}

        {target.kind === 'node' && node ? (
          <>
            <ContextMenuLabel className="truncate">{node.label}</ContextMenuLabel>
            <ContextMenuItem onSelect={() => onConfigureNode(node.id)}>
              {promptNode ? (
                <MessageSquareText className="mr-2 size-4" aria-hidden="true" />
              ) : (
                <PanelRight className="mr-2 size-4" aria-hidden="true" />
              )}
              {promptNode
                ? uiText('edit_prompt_and_inputs_b344ed0')
                : uiText('inspect_and_configure_99efdc2')}
              <ContextMenuShortcut>↵</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={locked}>
                <ArrowRight className="mr-2 size-4" aria-hidden="true" />
                {uiText('add_connected_step_fce7fb7')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="automation-workflow-popover w-60 rounded-lg p-1.5">
                {localizedAutomationNodeCatalog(uiText).map((group) => (
                  <ContextMenuSub key={group.category}>
                    <ContextMenuSubTrigger>{group.label}</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="automation-workflow-popover w-64 rounded-lg p-1.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <ContextMenuItem
                            key={item.type}
                            onSelect={() => onAddConnectedNode(node.id, item.type)}
                          >
                            <Icon className="mr-2 size-4" aria-hidden="true" />
                            <span className="truncate">{item.label}</span>
                          </ContextMenuItem>
                        );
                      })}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={locked} onSelect={() => onDuplicateNode(node.id)}>
              <Copy className="mr-2 size-4" aria-hidden="true" />
              {uiText('m_972d57379d')}
              <ContextMenuShortcut>⌘D</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem disabled={locked} onSelect={() => onToggleNode(node.id)}>
              <Power className="mr-2 size-4" aria-hidden="true" />
              {node.disabled ? uiText('enable_node_d9e2181') : uiText('disable_node_91a6e06')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={locked}
              className="text-destructive focus:text-destructive"
              onSelect={() => onDeleteNode(node.id)}
            >
              <Trash2 className="mr-2 size-4" aria-hidden="true" />
              {uiText('delete_node_b50c024')}
              <ContextMenuShortcut>⌫</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : null}

        {target.kind === 'edge' ? (
          <>
            <ContextMenuLabel>{uiText('connection_639a40e')}</ContextMenuLabel>
            <ContextMenuItem onSelect={onOpenInspector}>
              <Eye className="mr-2 size-4" aria-hidden="true" />
              {uiText('inspect_connection_3c0650e')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onSelectEdgeSource(target.edgeId)}>
              <ArrowUpFromLine className="mr-2 size-4" aria-hidden="true" />
              {uiText('go_to_source_step_7b45559')}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onSelectEdgeTarget(target.edgeId)}>
              <ArrowDownToLine className="mr-2 size-4" aria-hidden="true" />
              {uiText('go_to_next_step_8f37efe')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={locked}
              className="text-destructive focus:text-destructive"
              onSelect={() => onDeleteEdge(target.edgeId)}
            >
              <Unplug className="mr-2 size-4" aria-hidden="true" />
              {uiText('m_dfa71a6fbc')}
              <ContextMenuShortcut>⌫</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : null}

        {locked ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onUnpublish}>
              <LockOpen className="mr-2 size-4" aria-hidden="true" />
              {uiText('unpublish_to_edit_ef91531')}
              <ContextMenuItemInfo
                description={uiText('stops_this_automation_and_unlocks_the_current_e5c7267')}
              />
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
