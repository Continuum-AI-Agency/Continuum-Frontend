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
import { useLocale, useTranslations } from 'next-intl';
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
import { localizeAutomationsCopy } from '@/i18n/automationsCopy';
import type { ResolvedNodeCapability } from '@/lib/automations/capability-lifecycle';
import { automationSourceLabel } from '@/lib/automations/source-options';
import { formatAutomationWallClock } from '@/lib/automations/wall-clock';
import { cn } from '@/lib/utils';
import { automationControlLabel } from './automationControlLabels';
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

const nodeDetail = (
  node: AutomationWorkflowNode,
  t: ReturnType<typeof useTranslations<'automations'>>,
  locale: string,
): string => {
  switch (node.type) {
    case 'trigger.manual':
      return localizeAutomationsCopy('On demand', t);
    case 'trigger.schedule':
      return node.config.schedule.kind === 'cron'
        ? t('m_aaccb4b635', { expression: node.config.schedule.expr })
        : `${localizeAutomationsCopy(node.config.schedule.kind[0].toUpperCase() + node.config.schedule.kind.slice(1), t)} · ${formatAutomationWallClock(node.config.schedule.time, locale)}`;
    case 'trigger.event':
      return node.config.eventType;
    case 'trigger.metric':
      return `${node.config.metric} ${automationControlLabel(node.config.operator, t)} ${new Intl.NumberFormat(locale, { maximumSignificantDigits: 21 }).format(node.config.value)}`;
    case 'trigger.webhook':
      return node.config.hookId
        ? t('m_16c5f2eb62', { id: node.config.hookId })
        : localizeAutomationsCopy('Hook created on publish', t);
    case 'source':
      return `${automationSourceLabel(node.config.source, t)} · ${localizeAutomationsCopy(node.config.mode === 'live' ? 'Live at run time' : 'Pinned records', t)}`;
    case 'integration.query':
      return `${node.config.provider} · ${node.config.operation}`;
    case 'mcp.read':
      return node.config.toolName;
    case 'instruction':
      return t('promptCharacters', { count: node.config.text.length });
    case 'agent':
      return t('agentOutput', {
        agent:
          node.config.agent === 'jaina' ? 'Jaina' : localizeAutomationsCopy('Organic agent', t),
        format: automationControlLabel(node.config.outputFormat, t),
      });
    case 'output.formatter':
      return `${node.config.contract.contractId}@${node.config.contract.version}`;
    case 'report':
      return t('reportSections', { count: node.config.sections.length });
    case 'logic.if':
      return `${node.config.condition.path} ${automationControlLabel(node.config.condition.operator, t)}`;
    case 'logic.switch':
      return t('namedCases', { count: node.config.cases.length });
    case 'logic.parallel':
      return localizeAutomationsCopy('Concurrent branches', t);
    case 'logic.join':
      return t('waitBranches', { mode: node.config.mode });
    case 'logic.repeat_until':
      return t('repeatTimes', { count: node.config.iterations });
    case 'action.email':
      return t('recipientsCount', {
        count:
          node.config.recipients.memberUserIds.length +
          node.config.recipients.externalEmails.length,
      });
    case 'action.library_save':
      return node.config.titleTemplate;
    case 'action.planner_upsert':
      return node.config.platform;
    case 'action.organic_publish':
      return node.config.platform;
    case 'action.ai_studio_generate':
      return localizeAutomationsCopy(
        node.config.roomId ? 'Existing AI Studio room' : 'New AI Studio generation',
        t,
      );
    case 'action.paid_optimizer':
      return [
        automationControlLabel(node.config.operation, t),
        node.config.targetType ? automationControlLabel(node.config.targetType, t) : null,
      ]
        .filter(Boolean)
        .join(' · ');
    case 'action.outbound_webhook': {
      if (node.config.destinationId) return t('managedDestination', { method: node.config.method });
      if (!node.config.url) return t('destinationRequired', { method: node.config.method });
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

const portTypeLabel = (
  value: string | string[],
  t: ReturnType<typeof useTranslations<'automations'>>,
) =>
  (Array.isArray(value) ? value : [value])
    .map((type) => automationControlLabel(type, t))
    .join(' / ');

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
  const uiText = useTranslations('automations');
  const uiLocale = useLocale();
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
  const catalogItem = getAutomationNodeCatalogItem(node.type, uiText);
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
                  aria-label={uiText('nodeInputPort', { node: node.label, handle })}
                />
              }
            />
            <TooltipContent side="left">
              {uiText('m_2f36ce6eb9', { handle, type: portTypeLabel(spec.inputs[handle], uiText) })}
              {spec.requiredInputs?.includes(handle) ? uiText('required_9317109') : ''}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}

      <AiNode
        handles={{ source: false, target: false }}
        selected={selected}
        aria-label={uiText('workflowNodeLabel', { node: node.label, type: catalogItem.label })}
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
              <NodeDescription className="mt-0.5 truncate text-xs">
                {catalogItem.label}
              </NodeDescription>
            </div>
          </div>
          {errors.length > 0 ? (
            <TriangleAlert
              className="size-4 text-destructive"
              aria-label={uiText('validation_error_2aa2d0b')}
            />
          ) : locked ? (
            <Lock
              className="size-3.5 text-muted-foreground"
              aria-label={uiText('published_and_locked_55f4729')}
            />
          ) : null}
        </NodeHeader>

        <NodeContent className="workflow-node-details flex flex-col gap-3">
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
            {node.description || catalogItem.description}
          </p>
          <div className="workflow-node-meta flex items-center justify-between gap-2 border-t border-border/60 pt-2">
            <span className="truncate text-xs text-muted-foreground">
              {nodeDetail(node, uiText, uiLocale)}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {unavailable ? (
                <Badge variant="destructive">{uiText('unavailable_ca18449')}</Badge>
              ) : needsBinding ? (
                <Badge variant="warning">{uiText('needs_setup_b6df244')}</Badge>
              ) : lifecycle === 'preview' ? (
                <Badge variant="muted">{uiText('preview_324b134')}</Badge>
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
            {localizeAutomationsCopy(executionState.label, uiText)}
          </Pill>
          <span className="font-mono text-2xs text-muted-foreground">
            {uiText.rich('sentence_233f75300623', {
              v0: () => inputs.length,
              v1: () => outputs.length,
            })}
          </span>
        </NodeFooter>
      </AiNode>

      <Toolbar isVisible={selected} className="nodrag nopan">
        <Badge variant={errors.length > 0 ? 'destructive' : 'outline'}>
          {errors.length > 0
            ? uiText('m_377dd3a8aa', { count: errors.length })
            : locked
              ? uiText('published_version_e5dfd8a')
              : uiText('editing_draft_70dc585')}
        </Badge>
        {!locked ? (
          <>
            <NodeToolbarAction
              label={uiText('configure_node_c1cff8c')}
              onClick={() => onConfigure?.(node.id)}
            >
              <Settings2 aria-hidden="true" />
            </NodeToolbarAction>
            <NodeToolbarAction
              label={uiText('duplicate_node_85fd274')}
              onClick={() => onDuplicate?.(node.id)}
            >
              <Copy aria-hidden="true" />
            </NodeToolbarAction>
            <NodeToolbarAction
              label={node.disabled ? uiText('enable_node_d9e2181') : uiText('disable_node_91a6e06')}
              onClick={() => onToggleDisabled?.(node.id)}
            >
              <Power aria-hidden="true" />
            </NodeToolbarAction>
            <NodeToolbarAction
              label={uiText('delete_node_b50c024')}
              destructive
              onClick={() => onDelete?.(node.id)}
            >
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
                  aria-label={uiText('nodeOutputPort', { node: node.label, handle })}
                />
              }
            />
            <TooltipContent side="right">
              {uiText.rich('sentence_19ab06f1618b', {
                v0: () => handle,
                v1: () => portTypeLabel(spec.outputs[handle], uiText),
              })}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </motion.div>
  );
}
