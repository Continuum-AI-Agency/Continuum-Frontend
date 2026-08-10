'use client';

import type { AutomationValidationIssue, AutomationWorkflowNode } from '@continuum/contracts';
import { getAutomationNodePortSpec } from '@continuum/contracts';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import {
  CircleCheck,
  CircleDashed,
  CircleSlash2,
  CircleX,
  Clock3,
  Copy,
  LoaderCircle,
  Lock,
  Power,
  Settings2,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import {
  Node as AiNode,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from '@/components/ai-elements/node';
import { Toolbar } from '@/components/ai-elements/toolbar';
import { Pill } from '@/components/kibo-ui/pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ResolvedNodeCapability } from '@/lib/automations/capability-lifecycle';
import { cn } from '@/lib/utils';
import {
  automationNodeNeedsBinding,
  getAutomationNodeCatalogItem,
  getAutomationNodeLifecycle,
} from './automationNodeCatalog';
import type { WorkflowNodeExecutionView } from './workflowVisualState';

export type WorkflowCanvasNodeData = {
  workflowNode: AutomationWorkflowNode;
  locked: boolean;
  issues: AutomationValidationIssue[];
  /**
   * Server-resolved lifecycle for this node. The workspace owns the capabilities
   * response, so it resolves once and hands the answer down; the bundled
   * constant is only the fallback for a card rendered without one.
   */
  capability?: ResolvedNodeCapability;
  execution?: WorkflowNodeExecutionView;
  onConfigure?: (nodeId: string) => void;
  onDuplicate?: (nodeId: string) => void;
  onToggleDisabled?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
};

export type WorkflowCanvasNode = Node<WorkflowCanvasNodeData, 'workflow'>;

const nodeDetail = (node: AutomationWorkflowNode): string => {
  switch (node.type) {
    case 'trigger.manual':
      return 'On demand';
    case 'trigger.schedule':
      return node.config.schedule.kind === 'cron'
        ? `cron · ${node.config.schedule.expr}`
        : `${node.config.schedule.kind} · ${node.config.schedule.time}`;
    case 'trigger.event':
      return node.config.eventType.replaceAll('.', ' ');
    case 'trigger.metric':
      return `${node.config.metric} ${node.config.operator} ${node.config.value}`;
    case 'trigger.webhook':
      return node.config.hookId ? `Hook ${node.config.hookId}` : 'Hook created on publish';
    case 'source':
      return `${node.config.source.replaceAll('_', ' ')} · ${node.config.mode}`;
    case 'integration.query':
      return `${node.config.provider} · ${node.config.operation}`;
    case 'mcp.read':
      return node.config.toolName;
    case 'instruction':
      return `${node.config.text.length.toLocaleString()} prompt characters`;
    case 'agent':
      return `${node.config.agent} · ${node.config.outputFormat} output`;
    case 'output.formatter':
      return `${node.config.contract.contractId}@${node.config.contract.version}`;
    case 'report':
      return `${node.config.sections.length} report section${node.config.sections.length === 1 ? '' : 's'}`;
    case 'logic.if':
      return `${node.config.condition.path} ${node.config.condition.operator}`;
    case 'logic.switch':
      return `${node.config.cases.length} named case${node.config.cases.length === 1 ? '' : 's'}`;
    case 'logic.parallel':
      return 'Concurrent branches';
    case 'logic.join':
      return `Wait for ${node.config.mode}`;
    case 'logic.repeat_until':
      return `Repeat ${node.config.iterations} time${node.config.iterations === 1 ? '' : 's'}`;
    case 'action.email':
      return `${node.config.recipients.memberUserIds.length + node.config.recipients.externalEmails.length} recipients`;
    case 'action.library_save':
      return node.config.titleTemplate;
    case 'action.planner_upsert':
      return node.config.platform;
    case 'action.organic_publish':
      return node.config.platform;
    case 'action.ai_studio_generate':
      return node.config.roomId ? 'Existing AI Studio room' : 'New AI Studio generation';
    case 'action.paid_optimizer':
      return `${node.config.operation.replaceAll('_', ' ')} ${node.config.targetType}`;
    case 'action.outbound_webhook': {
      if (node.config.destinationId) return `${node.config.method} · managed destination`;
      if (!node.config.url) return `${node.config.method} · destination required`;
      try {
        return `${node.config.method} ${new URL(node.config.url).hostname}`;
      } catch {
        return `${node.config.method} webhook`;
      }
    }
  }
};

const executionPresentation = (execution?: WorkflowNodeExecutionView) => {
  if (!execution) {
    return { icon: CircleDashed, label: 'Not run', variant: 'muted' as const };
  }
  if (execution.status === 'pending') {
    return { icon: Clock3, label: 'Pending', variant: 'warning' as const };
  }
  if (execution.status === 'running') {
    return { icon: LoaderCircle, label: 'Running', variant: 'violet' as const };
  }
  if (execution.status === 'completed') {
    return { icon: CircleCheck, label: 'Passed', variant: 'success' as const };
  }
  if (execution.status === 'failed') {
    return { icon: CircleX, label: 'Failed', variant: 'destructive' as const };
  }
  return { icon: CircleSlash2, label: 'Skipped', variant: 'muted' as const };
};

const portTypeLabel = (value: string | string[]) =>
  (Array.isArray(value) ? value : [value]).join(' / ');

function NodeToolbarAction({
  label,
  children,
  onClick,
  destructive = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant={destructive ? 'destructive' : 'ghost'}
            aria-label={label}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function WorkflowNodeCard({ data, selected }: NodeProps<WorkflowCanvasNode>) {
  const shouldReduceMotion = useReducedMotion();
  const {
    workflowNode: node,
    issues,
    capability,
    execution,
    locked,
    onConfigure,
    onDelete,
    onDuplicate,
    onToggleDisabled,
  } = data;
  const spec = getAutomationNodePortSpec(node);
  const catalogItem = getAutomationNodeCatalogItem(node.type);
  const lifecycle = capability?.lifecycle ?? getAutomationNodeLifecycle(node);
  const unavailable = capability?.availability === 'unavailable';
  const needsBinding = automationNodeNeedsBinding(node);
  const inputs = Object.keys(spec.inputs);
  const outputs = Object.keys(spec.outputs);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const executionState = executionPresentation(execution);
  const ExecutionIcon = executionState.icon;
  const Icon = catalogItem.icon;

  return (
    <motion.div
      className="workflow-node-shell relative"
      data-category={catalogItem.category}
      data-execution={execution?.status ?? 'idle'}
      initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.96 }}
      animate={{
        opacity: 1,
        scale: 1,
        x: execution?.status === 'failed' && !shouldReduceMotion ? [0, -2, 2, -1, 1, 0] : 0,
      }}
      whileHover={shouldReduceMotion || locked ? undefined : { y: -2 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      {execution?.status === 'running' ? (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 top-0 z-10 h-0.5 origin-left rounded-full bg-primary"
          animate={
            shouldReduceMotion
              ? { opacity: 1, scaleX: 1 }
              : { opacity: [0.45, 1, 0.45], scaleX: [0.2, 1, 0.2] }
          }
          transition={{ duration: 1.25, ease: 'easeInOut', repeat: Number.POSITIVE_INFINITY }}
        />
      ) : null}
      {inputs.map((handle, index) => (
        <TooltipProvider key={handle} delay={120}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Handle
                  id={handle}
                  type="target"
                  position={Position.Left}
                  className="workflow-port size-3! border-2! border-background! bg-muted-foreground! transition-transform hover:scale-125"
                  style={{ top: `${((index + 1) / (inputs.length + 1)) * 100}%` }}
                  aria-label={`${node.label} ${handle} input`}
                />
              }
            />
            <TooltipContent side="left">
              {handle} input · {portTypeLabel(spec.inputs[handle])}
              {spec.requiredInputs?.includes(handle) ? ' · required' : ''}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}

      <AiNode
        handles={{ source: false, target: false }}
        selected={selected}
        aria-label={`${node.label}, ${catalogItem.label} workflow node`}
        className={cn(
          'workflow-node-card w-64 overflow-hidden border-border/85 bg-card text-card-foreground transition-[border-color,box-shadow,opacity]',
          selected && 'border-primary ring-2 ring-primary/15',
          errors.length > 0 && 'border-destructive/60',
          execution?.status === 'failed' && 'border-destructive ring-2 ring-destructive/15',
          execution?.status === 'running' && 'border-primary/70',
          (node.disabled || lifecycle === 'preview' || unavailable) &&
            'opacity-55 grayscale-[0.35]',
          unavailable && 'border-destructive/50',
        )}
      >
        <NodeHeader className="bg-card/90">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-md border',
                catalogItem.category === 'trigger' &&
                  'border-success/30 bg-success/10 text-success',
                catalogItem.category === 'context' && 'border-secondary/25 bg-secondary/10',
                catalogItem.category === 'intelligence' &&
                  'border-primary/25 bg-primary/10 text-primary',
                catalogItem.category === 'logic' && 'border-warning/30 bg-warning/10 text-warning',
                catalogItem.category === 'outcome' && 'border-border bg-muted text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <NodeTitle className="truncate text-sm">{node.label}</NodeTitle>
              <NodeDescription className="mt-0.5 truncate text-[11px]">
                {catalogItem.label}
              </NodeDescription>
            </div>
          </div>
          {errors.length > 0 ? (
            <TriangleAlert className="size-4 text-destructive" aria-label="Validation error" />
          ) : locked ? (
            <Lock className="size-3.5 text-muted-foreground" aria-label="Published and locked" />
          ) : null}
        </NodeHeader>

        <NodeContent className="workflow-node-details flex flex-col gap-3">
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {node.description || catalogItem.description}
          </p>
          <div className="workflow-node-meta flex items-center justify-between gap-2 border-t border-border/60 pt-2">
            <span className="truncate text-[11px] text-muted-foreground">{nodeDetail(node)}</span>
            <div className="flex shrink-0 items-center gap-1">
              {unavailable ? (
                <Badge variant="destructive">Unavailable</Badge>
              ) : needsBinding ? (
                <Badge variant="warning">Needs setup</Badge>
              ) : lifecycle === 'preview' ? (
                <Badge variant="muted">Preview</Badge>
              ) : null}
            </div>
          </div>
        </NodeContent>

        <NodeFooter className="workflow-node-footer justify-between gap-2 bg-muted/40">
          <Pill variant={executionState.variant}>
            <ExecutionIcon
              className={cn(
                execution?.status === 'running' && !shouldReduceMotion && 'animate-spin',
              )}
              aria-hidden="true"
            />
            {executionState.label}
          </Pill>
          <span className="font-mono text-[10px] text-muted-foreground">
            {inputs.length} in · {outputs.length} out
          </span>
        </NodeFooter>
      </AiNode>

      <Toolbar isVisible={selected} className="nodrag nopan">
        <Badge variant={errors.length > 0 ? 'destructive' : 'outline'}>
          {errors.length > 0
            ? `${errors.length} error${errors.length === 1 ? '' : 's'}`
            : locked
              ? 'Published version'
              : 'Editing draft'}
        </Badge>
        {!locked ? (
          <>
            <NodeToolbarAction label="Configure node" onClick={() => onConfigure?.(node.id)}>
              <Settings2 aria-hidden="true" />
            </NodeToolbarAction>
            <NodeToolbarAction label="Duplicate node" onClick={() => onDuplicate?.(node.id)}>
              <Copy aria-hidden="true" />
            </NodeToolbarAction>
            <NodeToolbarAction
              label={node.disabled ? 'Enable node' : 'Disable node'}
              onClick={() => onToggleDisabled?.(node.id)}
            >
              <Power aria-hidden="true" />
            </NodeToolbarAction>
            <NodeToolbarAction label="Delete node" destructive onClick={() => onDelete?.(node.id)}>
              <Trash2 aria-hidden="true" />
            </NodeToolbarAction>
          </>
        ) : null}
      </Toolbar>

      {outputs.map((handle, index) => (
        <TooltipProvider key={handle} delay={120}>
          <Tooltip>
            <TooltipTrigger
              render={
                <Handle
                  id={handle}
                  type="source"
                  position={Position.Right}
                  className="workflow-port size-3! border-2! border-background! bg-primary! transition-transform hover:scale-125"
                  style={{ top: `${((index + 1) / (outputs.length + 1)) * 100}%` }}
                  aria-label={`${node.label} ${handle} output`}
                />
              }
            />
            <TooltipContent side="right">
              {handle} output · {portTypeLabel(spec.outputs[handle])}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </motion.div>
  );
}
