'use client';

import {
  DownloadIcon,
  Edit2Icon,
  FileTextIcon,
  Loader2Icon,
  PlayIcon,
  SaveIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const AnimatedShaderBackground = dynamic(
  () =>
    import('@/components/ui/animated-shader-background').then(
      (mod) => mod.AnimatedShaderBackground,
    ),
  { ssr: false },
);

import type {
  AgentSessionListFilters,
  JainaToolApprovalRequiredPayload,
  JainaUIMessage,
  PaidScaffoldGate,
} from '@continuum/contracts';
import {
  AGENT_RUN_QUEUED,
  JAINA_MAX_AD_ACCOUNTS,
  normalizeAdAccountId,
  updateAgentSessionTagsResponseSchema,
} from '@continuum/contracts';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCampaignAI } from '@/CampaignCanvas/hooks/useCampaignAI';
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from '@/components/ai-elements/queue';
import { AutomationSheets } from '@/components/automations/AutomationSheets';
import { AgentDataScopePicker } from '@/components/chat/AgentDataScopePicker';
import { ChatProvenanceBanner } from '@/components/chat/AgentInitiatorPill';
import {
  buildAgentAttachmentContext,
  buildInlineTextContextBlock,
  mergeAttachmentReferences,
} from '@/components/chat/attachmentReferences';
import type { Attachment } from '@/components/chat/attachments';
import { ChatMarker } from '@/components/chat/ChatMarker';
import { ChatTranscript } from '@/components/chat/ChatTranscript';
import { useCollapsibleConversations } from '@/components/chat/collapsibleConversations';
import { PromptInput } from '@/components/chat/prompt-input';
import { useChatAttachments } from '@/components/chat/useChatAttachments';
import { prependUnseen, useEarlierHistory } from '@/components/chat/useEarlierHistory';
import type { ToolApprovalDecision } from '@/components/paid-media/jaina/components/JainaToolApprovalCard';
import type { ScaffoldDecision } from '@/components/paid-media/jaina/scaffold/PaidScaffoldCard';
import { useActiveProjectOptional } from '@/components/projects';
import { useToast } from '@/components/ui/ToastProvider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useBrandIntegrations } from '@/hooks/useBrandIntegrations';
import { useJainaChat } from '@/hooks/useJainaChat';
import {
  isTerminalRunStatus,
  type JainaRunStatusRow,
  useJainaRunStatusRealtime,
} from '@/hooks/useJainaRunStatusRealtime';
import type {
  AgentDocumentAttachment,
  AgentMentionProvider,
  AgentMentionReference,
  AgentMentionSuggestion,
} from '@/lib/agent-references';
import { isSessionStreaming, selectRunForSession, useAgentRunStore } from '@/lib/agents/runStore';
import { http } from '@/lib/api/http';
import {
  campaignCanvasActionsEnvelopeSchema,
  extractCampaignCanvasActionsEnvelope,
} from '@/lib/campaign-canvas/agent-actions';
import {
  buildCampaignCanvasProposalBlock,
  type CampaignCanvasPayload,
} from '@/lib/campaign-canvas/payload';
import { cancelJainaRun, clearJainaMemory } from '@/lib/jaina/chatControls';
import { useJainaConversationSidebarStore } from '@/lib/jaina/conversation-sidebar-store';
import {
  createConversationSessionResponseSchema,
  type JainaConversationMessage,
  type JainaConversationRun,
  type JainaConversationSession,
  jainaConversationListResponseSchema,
  jainaConversationRunsHydrationResponseSchema,
  jainaConversationUiListResponseSchema,
  mapConversationCreateResponse,
} from '@/lib/jaina/conversations';
import {
  frontendCheckpointReportSchema,
  type JainaObjectiveStatus,
  type JainaPlanAction,
  type JainaScaffoldAction,
  type JainaToolAction,
  reportAssemblySchema,
} from '@/lib/jaina/schemas';
import { canvasActionsOf, toJainaChatMessage } from '@/lib/jaina/uiMessageProjection';
import { isPersistedResultStub, parsePersistedResultWrapper } from '@/lib/jaina/unwrapping';
import { usePaidMediaPerformanceStore } from '@/lib/paid-media/performance-store';
import type { CampaignPerformanceRow } from '@/lib/paid-media/performance-types';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { JainaConversationSidebar } from './components/JainaConversationSidebar';
import { JainaEmptyState } from './components/JainaEmptyState';
import { JainaHeader } from './components/JainaHeader';
import { JainaMessageItem } from './components/JainaMessageItem';

/**
 * Tool name to database gate. The database enforces gate ORDER, so a wrong mapping
 * would not fail loudly — it would open the wrong gate.
 */
const SCAFFOLD_GATE_BY_TOOL_NAME: Record<string, PaidScaffoldGate> = {
  paid_scaffold_build: 'build',
  paid_scaffold_populate: 'populate',
  paid_scaffold_activate: 'activate',
};

import type { PlanStatus } from '@/components/ai-elements/plan';
import type { PlanFeedbackPayload } from './components/PlanSection';
import { deriveJainaAnchors, milestonesForJainaMessage } from './deriveJainaAnchors';
import { getReportSummary, hasReportContent } from './jainaUtils';
import { parsePersistedReportV2Value, parsePersistedReportValue } from './persistedReport';
import {
  enqueueMessage,
  type QueuedJainaMessage,
  removeQueuedMessage,
  shouldQueueSubmission,
  updateQueuedMessageContent,
} from './queueing';
import type { JainaChatMessage } from './types';

export { parsePersistedResultWrapper } from '@/lib/jaina/unwrapping';

function ConversationSkeleton() {
  return (
    <div className="space-y-6 px-4 py-6" aria-hidden="true">
      <div className="flex justify-end">
        <div className="h-9 w-48 animate-pulse rounded-2xl bg-muted/50" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted/30" />
      </div>
      <div className="flex justify-end">
        <div className="h-9 w-64 animate-pulse rounded-2xl bg-muted/50" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-3/5 animate-pulse rounded bg-muted/40" />
        <div className="h-4 w-2/5 animate-pulse rounded bg-muted/30" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted/20" />
      </div>
    </div>
  );
}

type JainaChatSurfaceProps = {
  brandProfileId: string;
  brandName: string;
  adAccountId: string | null;
  campaignId?: string | null;
  campaignCanvasPayload?: CampaignCanvasPayload | null;
  userId?: string | null;
  initialSessionId?: string | null;
  initialPrompt?: string | null;
  onInitialPromptConsumed?: () => void;
  onCanvasActionApplied?: () => void;
  goalsAccessEnabled?: boolean;
  className?: string;
};

type ReportArtifactJobStatus = 'pending' | 'running' | 'done' | 'failed';

type ReportArtifactJobTracker = {
  jobId: string;
  status: ReportArtifactJobStatus;
  reportModel?: string;
  statusEndpoint: string;
  fileUrlEndpoint: string;
  fileUrl?: string;
  error?: string;
};

const REPORT_ARTIFACT_POLL_INTERVAL_MS = 3500;

type JainaMentionAdSet = {
  id: string;
  name: string;
  status?: string;
};

function metaAccountOptions(
  adAccountId: string | null,
  accounts:
    | Array<{
        integrationAccountId: string;
        externalAccountId: string | null;
        alias: string | null;
        name: string;
        type: string | null;
      }>
    | undefined,
) {
  if (!adAccountId) return [];
  const primaryKey = normalizeAdAccountId(adAccountId);
  const seen = new Set<string>();
  const options: Array<{ id: string; label: string }> = [];

  for (const account of accounts ?? []) {
    if (account.type !== 'meta_ad_account') continue;
    const sourceId = account.externalAccountId ?? account.integrationAccountId;
    const key = normalizeAdAccountId(sourceId);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      id: key === primaryKey ? adAccountId : sourceId,
      label: account.alias ?? account.name,
    });
  }

  const primary = options.find(({ id }) => normalizeAdAccountId(id) === primaryKey);
  if (primary) return [primary, ...options.filter((option) => option !== primary)];
  return [{ id: adAccountId, label: adAccountId }, ...options];
}

function matchesJainaMentionQuery(
  query: string,
  values: Array<string | null | undefined>,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

function formatMetricHint(campaign: CampaignPerformanceRow): string | undefined {
  const spend = campaign.metrics?.spend;
  const roas = campaign.metrics?.roas;
  if (typeof spend !== 'number' && typeof roas !== 'number') return undefined;
  const parts: string[] = [];
  if (typeof spend === 'number') {
    parts.push(`$${Math.round(spend).toLocaleString()} spend`);
  }
  if (typeof roas === 'number') {
    parts.push(`${roas.toFixed(2)} ROAS`);
  }
  return parts.join(' · ');
}

function createCampaignReference(
  campaign: CampaignPerformanceRow,
  adAccountId: string,
): AgentMentionReference {
  return {
    id: campaign.id,
    type: 'campaign',
    label: campaign.name,
    source: 'jaina',
    metadata: {
      campaignId: campaign.id,
      adAccountId,
      status: campaign.status,
      objective: campaign.objective,
    },
  };
}

function createCampaignSuggestion(
  campaign: CampaignPerformanceRow,
  adAccountId: string,
  options?: { children?: boolean },
): AgentMentionSuggestion {
  const metricHint = formatMetricHint(campaign);
  return {
    key: `${options?.children ? 'campaign-adsets' : 'campaign'}:${campaign.id}`,
    label: options?.children ? `Ad sets in ${campaign.name}` : campaign.name,
    type: 'campaign',
    source: 'jaina',
    group: options?.children ? 'Ad Sets' : 'Campaigns',
    description: [campaign.status, campaign.objective, metricHint].filter(Boolean).join(' · '),
    badge: options?.children ? 'choose' : 'campaign',
    reference: createCampaignReference(campaign, adAccountId),
    ...(options?.children ? { childrenLabel: 'Choose an ad set' } : {}),
  };
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function createJainaSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `jaina-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createQueuedMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `queued-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSessionTitle(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'execution plan') return null;
  return trimmed;
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getNestedRecord(
  record: Record<string, unknown>,
  key: 'data' | 'job',
): Record<string, unknown> | null {
  return asPlainRecord(record[key]);
}

function getStringFromRecords(
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | undefined {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return undefined;
}

function normalizeReportArtifactJobStatus(value: unknown): ReportArtifactJobStatus {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['done', 'completed', 'complete', 'ready', 'success', 'succeeded'].includes(status)) {
    return 'done';
  }
  if (['failed', 'failure', 'error', 'errored'].includes(status)) return 'failed';
  if (['running', 'processing', 'in_progress', 'generating'].includes(status)) {
    return 'running';
  }
  return 'pending';
}

function resolveReportArtifactEndpoint(endpoint: string | undefined, fallback: string): string {
  const candidate = endpoint?.trim();
  if (candidate?.startsWith('/api/agents/jaina/')) return candidate;
  return fallback;
}

function buildReportArtifactJobTracker(
  job: NonNullable<ReturnType<typeof createReportArtifactJobFromEvent>>,
): ReportArtifactJobTracker {
  return {
    jobId: job.jobId,
    status: job.status,
    reportModel: job.reportModel,
    statusEndpoint: resolveReportArtifactEndpoint(
      job.statusEndpoint,
      `/api/agents/jaina/report-artifacts/jobs/${job.jobId}`,
    ),
    fileUrlEndpoint: resolveReportArtifactEndpoint(
      job.fileUrlEndpoint,
      `/api/agents/jaina/report-artifacts/jobs/${job.jobId}/file-url`,
    ),
  };
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const detail = await response.text().catch(() => fallback);
  if (!detail) return fallback;
  try {
    const parsed = JSON.parse(detail) as { error?: unknown };
    if (typeof parsed.error === 'string' && parsed.error.length > 0) {
      return parsed.error;
    }
  } catch {
    // plain text
  }
  return detail;
}

function createReportArtifactJobFromEvent(job: JainaChatMessage['reportArtifactJob']): {
  jobId: string;
  status: ReportArtifactJobStatus;
  reportModel?: string;
  statusEndpoint?: string;
  fileUrlEndpoint?: string;
} | null {
  if (!job?.job_id) return null;
  return {
    jobId: job.job_id,
    status: normalizeReportArtifactJobStatus(job.status),
    reportModel: job.report_model,
    statusEndpoint: job.status_endpoint,
    fileUrlEndpoint: job.file_url_endpoint,
  };
}

function extractReportArtifactJobStatus(payload: unknown): {
  status: ReportArtifactJobStatus;
  error?: string;
} {
  const root = asPlainRecord(payload) ?? {};
  const data = getNestedRecord(root, 'data');
  const job = getNestedRecord(root, 'job');
  const status = getStringFromRecords([root, data, job], ['status', 'state']);
  const error = getStringFromRecords([root, data, job], ['error', 'error_message', 'message']);
  return {
    status: normalizeReportArtifactJobStatus(status),
    error,
  };
}

function extractReportArtifactFileUrl(payload: unknown): string | undefined {
  const root = asPlainRecord(payload) ?? {};
  const data = getNestedRecord(root, 'data');
  const job = getNestedRecord(root, 'job');
  return getStringFromRecords([root, data, job], ['url', 'file_url', 'signed_url', 'download_url']);
}

function parsePersistedReport(
  message: JainaConversationMessage,
): JainaChatMessage['report'] | undefined {
  return parsePersistedReportValue({
    report: message.report,
    content: message.content,
    reasoning: message.reasoning,
  });
}

function parsePersistedReportV2(
  message: JainaConversationMessage,
): JainaChatMessage['reportV2'] | undefined {
  return parsePersistedReportV2Value({
    report: message.report,
    content: message.content,
    reasoning: message.reasoning,
  });
}

function parsePersistedReportAssembly(
  message: JainaConversationMessage,
): JainaChatMessage['reportAssembly'] | undefined {
  const parsed = reportAssemblySchema.safeParse(message.reportAssembly);
  return parsed.success ? parsed.data : undefined;
}

function parseReportAssemblyFromUnknown(
  value: unknown,
  depth = 0,
): JainaChatMessage['reportAssembly'] | undefined {
  if (depth > 5 || value == null) return undefined;

  const direct = reportAssemblySchema.safeParse(value);
  if (direct.success) return direct.data;

  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;

  const candidates = [
    record.report_assembly,
    record.reportAssembly,
    record.result_payload,
    record.report,
    record.payload,
    record.data,
    record.content,
    record.detail,
    record.message,
    record.response,
  ];

  for (const candidate of candidates) {
    const parsed = parseReportAssemblyFromUnknown(candidate, depth + 1);
    if (parsed) return parsed;
  }

  return undefined;
}

function deriveObjectivesFromReport(
  report: JainaChatMessage['report'] | undefined,
): JainaChatMessage['objectives'] | undefined {
  if (!report || ('type' in report && report.type === 'direct_answer')) {
    return undefined;
  }

  const parsedReport = frontendCheckpointReportSchema.safeParse(report);
  if (!parsedReport.success) {
    return undefined;
  }

  if (
    !Array.isArray(parsedReport.data.execution_objectives) ||
    parsedReport.data.execution_objectives.length === 0
  ) {
    return undefined;
  }

  const objectives = parsedReport.data.execution_objectives
    .filter((objective) => typeof objective?.id === 'string' && objective.id.trim().length > 0)
    .map((objective) => ({
      ...objective,
      id: objective.id,
      title: objective.title || objective.id,
      status: normalizePersistedObjectiveStatus(objective.status),
      description: objective.details ?? objective.scope ?? undefined,
    }));

  return objectives.length > 0 ? objectives : undefined;
}

function normalizePersistedObjectiveStatus(
  value: unknown,
): 'pending' | 'in_progress' | 'completed' | 'failed' {
  if (
    value === 'pending' ||
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'failed'
  ) {
    return value;
  }
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    normalized === 'in_progress' ||
    normalized === 'in-progress' ||
    normalized === 'running' ||
    normalized === 'active'
  ) {
    return 'in_progress';
  }
  if (
    normalized === 'completed' ||
    normalized === 'complete' ||
    normalized === 'done' ||
    normalized === 'success'
  ) {
    return 'completed';
  }
  if (
    normalized === 'failed' ||
    normalized === 'error' ||
    normalized === 'errored' ||
    normalized === 'cancelled' ||
    normalized === 'canceled'
  ) {
    return 'failed';
  }
  return 'pending';
}

const messageObjectiveStatusRank: Record<JainaObjectiveStatus, number> = {
  pending: 0,
  in_progress: 1,
  deferred: 1,
  partial: 2,
  blocked: 2,
  failed: 2,
  cancelled: 2,
  completed: 3,
};

function mergeMessageObjectives(
  persistedObjectives: JainaChatMessage['objectives'],
  localObjectives: JainaChatMessage['objectives'],
): JainaChatMessage['objectives'] | undefined {
  if (!localObjectives || localObjectives.length === 0) return persistedObjectives;
  if (!persistedObjectives || persistedObjectives.length === 0) return localObjectives;

  const byId = new Map<string, NonNullable<JainaChatMessage['objectives']>[number]>();
  const titleToId = new Map<string, string>();

  for (const objective of persistedObjectives) {
    byId.set(objective.id, objective);
    titleToId.set(objective.title.trim().toLowerCase(), objective.id);
  }

  for (const localObjective of localObjectives) {
    const titleKey = localObjective.title.trim().toLowerCase();
    const targetId = byId.has(localObjective.id)
      ? localObjective.id
      : (titleToId.get(titleKey) ?? localObjective.id);
    const persistedObjective = byId.get(targetId);

    if (!persistedObjective) {
      byId.set(targetId, localObjective);
      titleToId.set(titleKey, targetId);
      continue;
    }

    const localRank = messageObjectiveStatusRank[localObjective.status];
    const persistedRank = messageObjectiveStatusRank[persistedObjective.status];
    const status = localRank >= persistedRank ? localObjective.status : persistedObjective.status;

    byId.set(targetId, {
      ...persistedObjective,
      ...localObjective,
      id: targetId,
      title: localObjective.title || persistedObjective.title,
      description: localObjective.description ?? persistedObjective.description,
      status,
    });
  }

  return Array.from(byId.values());
}

function objectivesChanged(
  previous: JainaChatMessage['objectives'],
  next: JainaChatMessage['objectives'],
): boolean {
  return JSON.stringify(previous ?? []) !== JSON.stringify(next ?? []);
}

function deriveObjectivesFromPersistedSources(input: {
  message: JainaConversationMessage;
  report: JainaChatMessage['report'] | undefined;
}): JainaChatMessage['objectives'] | undefined {
  if (Array.isArray(input.message.objectives) && input.message.objectives.length > 0) {
    return input.message.objectives as JainaChatMessage['objectives'];
  }

  const report = input.report;
  if (!report || ('type' in report && report.type === 'direct_answer')) {
    return undefined;
  }

  const parsedReport = frontendCheckpointReportSchema.safeParse(report);
  if (!parsedReport.success) {
    return undefined;
  }

  if (
    !Array.isArray(parsedReport.data.execution_objectives) ||
    parsedReport.data.execution_objectives.length === 0
  ) {
    return undefined;
  }

  const objectives = parsedReport.data.execution_objectives
    .filter((objective) => typeof objective?.id === 'string' && objective.id.trim().length > 0)
    .map((objective) => ({
      ...objective,
      id: objective.id,
      title: objective.title || objective.id,
      status: normalizePersistedObjectiveStatus(objective.status),
      description: objective.details ?? objective.scope ?? undefined,
    }));

  return objectives.length > 0 ? objectives : undefined;
}

function isFallbackCheckpointMessage(content: string): boolean {
  return /synthesis summary unavailable/i.test(content);
}

function isPersistedErrorMessage(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === 'stream error' ||
    normalized.startsWith('jaina error') ||
    normalized.startsWith('malformed ') ||
    normalized.startsWith('invalid ') ||
    normalized.includes('failed to parse jaina stream event json')
  );
}

function findPendingPlanId(messages: JainaChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const plan = messages[i].plan;
    if (plan?.status === 'awaiting_approval') return plan.id;
  }
  return null;
}

/**
 * Human-in-the-loop gate state the persisted snapshot CANNOT rebuild.
 *
 * The backend stores an assistant turn's text; it does not store which approval that
 * turn is waiting on. So a message that reaches this merge holding a pending approval
 * is the only copy of it, and letting the persisted row win deletes the card the user
 * has to answer — with no error and no log, on the one turn where silence is the
 * failure. Observed live: a gate pause persists the deterministic sentence "I need
 * your approval before I create anything on Meta.", the contents match exactly, and
 * the local copy carrying the approval is discarded a moment after it renders.
 */
const hasGateState = (message: JainaChatMessage): boolean =>
  Boolean(message.scaffold) ||
  (message.pendingToolApprovals?.length ?? 0) > 0 ||
  Object.keys(message.resolvedApprovals ?? {}).length > 0;

function sortConversationSessions(
  sessions: JainaConversationSession[],
): JainaConversationSession[] {
  const sorted = [...sessions];
  sorted.sort((a, b) => {
    const aLast = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bLast = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    if (aLast !== bLast) return bLast - aLast;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  return sorted;
}

function upsertConversationSession(
  sessions: JainaConversationSession[],
  nextSession: JainaConversationSession,
): JainaConversationSession[] {
  const existingIndex = sessions.findIndex(
    (session) => session.sessionId === nextSession.sessionId,
  );
  if (existingIndex === -1) {
    return sortConversationSessions([nextSession, ...sessions]);
  }

  const updated = [...sessions];
  updated[existingIndex] = nextSession;
  return sortConversationSessions(updated);
}

export function JainaChatSurface({
  brandProfileId,
  brandName,
  adAccountId,
  campaignId,
  campaignCanvasPayload,
  userId,
  initialSessionId,
  initialPrompt,
  onInitialPromptConsumed,
  onCanvasActionApplied,
  goalsAccessEnabled = process.env.NODE_ENV !== 'production',
  className,
}: JainaChatSurfaceProps) {
  const { show } = useToast();
  const { integrations } = useBrandIntegrations(brandProfileId);
  const { processAIAction } = useCampaignAI();
  const loadCampaignPerformance = usePaidMediaPerformanceStore(
    (store) => store.loadCampaignPerformance,
  );
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const prefersReducedMotion = useReducedMotion();

  // Transport notices, which are deliberately NOT transcript entries. The heartbeat only keeps
  // a proxy from closing an idle connection. The fence says this turn is parked behind one that
  // is already running for the same session — the NDJSON wire sent that too and Jaina's reader
  // dropped it on the floor, so a queued turn looked like a turn that did nothing.
  const handleStreamNotice = React.useCallback(
    (notice: Record<string, unknown>) => {
      if (notice.type !== AGENT_RUN_QUEUED) return;
      show({
        title: 'Queued behind the current turn',
        description: 'Jaina is still finishing the previous request in this conversation.',
        variant: 'info',
      });
    },
    [show],
  );

  // The optional sub-brand scope. Brand identity is unchanged; what narrows on the Backend
  // is the evidence — ad accounts and the documents the turn may read.
  const activeProjectId = useActiveProjectOptional()?.activeProjectId ?? null;
  const accountScopeOptions = React.useMemo(
    () => metaAccountOptions(adAccountId, integrations?.facebook?.accounts),
    [adAccountId, integrations],
  );
  const [selectedAdAccountIds, setSelectedAdAccountIds] = React.useState<string[]>(() =>
    adAccountId ? [adAccountId] : [],
  );
  React.useEffect(() => {
    setSelectedAdAccountIds(adAccountId ? [adAccountId] : []);
  }, [adAccountId]);

  const [isJainaProMode, setIsJainaProMode] = React.useState(false);
  const { isCollapsed: isSidebarCollapsed, toggle: toggleSidebarCollapsed } =
    useCollapsibleConversations('jaina:conversations-collapsed');
  const [reportArtifactJob, setReportArtifactJob] = React.useState<ReportArtifactJobTracker | null>(
    null,
  );
  const [isReportArtifactDownloading, setIsReportArtifactDownloading] = React.useState(false);
  const [pendingReportArtifactResponseId, setPendingReportArtifactResponseId] = React.useState<
    string | null
  >(null);
  const [optimisticApprovalDecisions, setOptimisticApprovalDecisions] = React.useState<
    Record<string, ToolApprovalDecision>
  >({});
  const [optimisticPlanStatusById, setOptimisticPlanStatusById] = React.useState<
    Record<string, PlanStatus>
  >({});
  const [sessionId, setSessionId] = React.useState<string>(() => createJainaSessionId());
  const attachments = useChatAttachments({ brandId: brandProfileId, sessionId });
  // Lifted out under a distinct name: handleSubmit takes an `attachments` parameter
  // that shadows the controller, so the scope key has to be captured here.
  const attachmentScopeKey = attachments.scopeKey;

  const [conversationSessions, setConversationSessions] = React.useState<
    JainaConversationSession[]
  >([]);
  const [sessionTitleById, setSessionTitleById] = React.useState<Record<string, string>>({});

  const {
    messages: uiMessages,
    status: chatStatus,
    error: chatError,
    sendTurn,
    stop: stopChat,
    setMessages: setUiMessages,
  } = useJainaChat({ sessionId, onNotice: handleStreamNotice });
  const isStreaming = chatStatus === 'submitted' || chatStatus === 'streaming';

  // ONE transcript. `useChat.messages` is it — live turn, resumed turn and persisted history
  // alike. There used to be three: this reader's own NDJSON fold, a second fold of the
  // app-level store's frame log for a run it did not own, and the persisted snapshot, merged
  // pairwise. `resume: true` replaces the second (the SDK reconnects on GET and the Backend
  // replays the durable log through the same adapter the live path uses), and history arrives
  // already parts-shaped, which replaces the third.
  //
  // A `silent` user message is an approval verdict the request schema forced us to send. It is
  // not something a reader typed, so it never reaches the transcript.
  const messages = React.useMemo(
    () =>
      uiMessages
        .filter((message) => message.metadata?.silent !== true)
        .map((message, index) => {
          const projected = toJainaChatMessage(message, {
            isStreaming: isStreaming && index === uiMessages.length - 1,
            sessionTitle: sessionTitleById[sessionId],
          });
          const optimisticStatus = projected.plan
            ? optimisticPlanStatusById[projected.plan.id]
            : undefined;
          return optimisticStatus && projected.plan
            ? { ...projected, plan: { ...projected.plan, status: optimisticStatus } }
            : projected;
        }),
    [uiMessages, isStreaming, sessionTitleById, sessionId, optimisticPlanStatusById],
  );

  /** The turn on screen right now, projected once so the effects below share one object. */
  const liveMessage = uiMessages.at(-1) ?? null;
  const liveChatMessage = messages.at(-1) ?? null;
  const activeResponseId =
    isStreaming && liveChatMessage?.role === 'assistant' ? liveChatMessage.id : null;
  const pendingClarificationId = liveChatMessage?.pendingClarification?.id;

  // Per-viewed-session streaming from the app-level store: true when the conversation on screen
  // has a run in flight — whether this reader owns it (local `isStreaming`) or it is a detached
  // run still executing after the user switched away and came back. Drives the Stop control and
  // guards the queue so a returned-to running session doesn't dispatch a second turn.
  const viewedSessionStreaming = useAgentRunStore(isSessionStreaming(sessionId));
  const isViewedStreaming = isStreaming || viewedSessionStreaming;

  const anchors = React.useMemo(() => deriveJainaAnchors(messages), [messages]);
  const [shaderState, setShaderState] = React.useState<'visible' | 'sweeping' | 'hidden'>(
    'visible',
  );
  const [shaderReady, setShaderReady] = React.useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = React.useState(false);
  const [isConversationSwitching, setIsConversationSwitching] = React.useState(false);
  const [deletingSessionId, setDeletingSessionId] = React.useState<string | null>(null);
  const [generatingSessionIds, setGeneratingSessionIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [queuedMessages, setQueuedMessages] = React.useState<QueuedJainaMessage[]>([]);
  const [editingQueueMessageId, setEditingQueueMessageId] = React.useState<string | null>(null);
  const [queueEditDraft, setQueueEditDraft] = React.useState('');
  const processedToolResultIdsRef = React.useRef<Set<string>>(new Set());
  const processedCanvasEnvelopeKeysRef = React.useRef<Set<string>>(new Set());
  const processedReportArtifactJobIdsRef = React.useRef<Set<string>>(new Set());
  const persistedAssistantResponseIdsRef = React.useRef<Set<string>>(new Set());
  const conversationChannelRef = React.useRef<RealtimeChannel | null>(null);
  const activeSessionIdRef = React.useRef(sessionId);
  // Deep link (?sessionId=) wins over "most recent" exactly once, on first bootstrap.
  const deepLinkSessionIdRef = React.useRef(initialSessionId ?? null);
  const activeResponseIdRef = React.useRef<string | null>(null);
  const activeRunIdRef = React.useRef<string | undefined>(undefined);
  const streamBusyRef = React.useRef(false);
  const queueDispatchInFlightRef = React.useRef(false);
  const promptInputWrapperRef = React.useRef<HTMLDivElement>(null);
  const mentionAdSetsCacheRef = React.useRef<Map<string, JainaMentionAdSet[]>>(new Map());

  const jainaMentionProvider = React.useMemo<AgentMentionProvider>(
    () => ({
      getSuggestions: async ({ query }) => {
        if (!adAccountId) return [];
        const campaigns = await loadCampaignPerformance(
          {
            brandId: brandProfileId,
            adAccountId,
            platform: 'meta',
            range: { preset: 'last_7d' },
          },
          { force: false },
        ).catch(() => [] as CampaignPerformanceRow[]);

        const filteredCampaigns = campaigns
          .filter((campaign) =>
            matchesJainaMentionQuery(query, [campaign.name, campaign.status, campaign.objective]),
          )
          .slice(0, 8);

        return [
          ...filteredCampaigns.map((campaign) => createCampaignSuggestion(campaign, adAccountId)),
          ...filteredCampaigns.map((campaign) =>
            createCampaignSuggestion(campaign, adAccountId, { children: true }),
          ),
        ];
      },
      getChildSuggestions: async (parent) => {
        if (!adAccountId || !parent.reference) return [];
        const campaignId =
          typeof parent.reference.metadata?.campaignId === 'string'
            ? parent.reference.metadata.campaignId
            : parent.reference.id;
        const campaignName = parent.reference.label;
        const cached = mentionAdSetsCacheRef.current.get(campaignId);
        const adSets =
          cached ??
          (await supabase.functions
            .invoke(
              `paid-media-reporting/adsets?brandId=${brandProfileId}&adAccountId=${adAccountId}&campaignId=${campaignId}`,
              {
                method: 'POST',
                body: {
                  brandId: brandProfileId,
                  adAccountId,
                  campaignId,
                },
              },
            )
            .then(({ data, error }) => {
              if (error) throw new Error(error.message);
              const rows = Array.isArray((data as { adsets?: unknown[] } | null)?.adsets)
                ? (data as { adsets: unknown[] }).adsets
                : [];
              return rows
                .map((row): JainaMentionAdSet | null => {
                  if (!row || typeof row !== 'object') return null;
                  const record = row as Record<string, unknown>;
                  const id = typeof record.id === 'string' ? record.id : null;
                  const name = typeof record.name === 'string' ? record.name : null;
                  if (!id || !name) return null;
                  return {
                    id,
                    name,
                    status: typeof record.status === 'string' ? record.status : undefined,
                  };
                })
                .filter((row): row is JainaMentionAdSet => row !== null);
            })
            .catch(() => []));

        if (!cached) {
          mentionAdSetsCacheRef.current.set(campaignId, adSets);
        }

        return adSets.slice(0, 20).map((adSet) => ({
          key: `adset:${campaignId}:${adSet.id}`,
          label: adSet.name,
          type: 'adset' as const,
          source: 'jaina' as const,
          group: 'Ad Sets',
          description: [campaignName, adSet.status].filter(Boolean).join(' · '),
          badge: 'adset',
          reference: {
            id: adSet.id,
            type: 'adset' as const,
            label: adSet.name,
            source: 'jaina' as const,
            metadata: {
              adsetId: adSet.id,
              campaignId,
              campaignName,
              adAccountId,
              status: adSet.status,
            },
          },
        }));
      },
    }),
    [adAccountId, brandProfileId, loadCampaignPerformance, supabase],
  );

  const setConversationSessionsWithCache = React.useCallback(
    (next: React.SetStateAction<JainaConversationSession[]>) => {
      setConversationSessions((previous) => {
        const resolved =
          typeof next === 'function'
            ? (next as (sessions: JainaConversationSession[]) => JainaConversationSession[])(
                previous,
              )
            : next;
        if (adAccountId) {
          useJainaConversationSidebarStore
            .getState()
            .setSessions({ brandProfileId, adAccountId }, resolved);
        }
        return resolved;
      });
    },
    [adAccountId, brandProfileId],
  );

  const getFreshConversationSessionsFromCache = React.useCallback(() => {
    if (!adAccountId) return null;
    return useJainaConversationSidebarStore.getState().getFreshSessions({
      brandProfileId,
      adAccountId,
    });
  }, [adAccountId, brandProfileId]);

  const currentSessionTitle = sessionTitleById[sessionId];

  React.useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  // Tell the app-level run store which session is on screen so completion toasts are
  // suppressed for work the user is already watching finish.
  React.useEffect(() => {
    useAgentRunStore.getState().setViewingSession(sessionId);
    return () => {
      useAgentRunStore.getState().setViewingSession(null);
    };
  }, [sessionId]);

  React.useEffect(() => {
    streamBusyRef.current = isStreaming || Boolean(activeResponseId);
  }, [activeResponseId, isStreaming]);

  React.useEffect(() => {
    const eventJob = createReportArtifactJobFromEvent(liveChatMessage?.reportArtifactJob);
    if (!eventJob) return;
    if (processedReportArtifactJobIdsRef.current.has(eventJob.jobId)) return;

    processedReportArtifactJobIdsRef.current.add(eventJob.jobId);
    setPendingReportArtifactResponseId(null);
    setReportArtifactJob(buildReportArtifactJobTracker(eventJob));
  }, [liveChatMessage?.reportArtifactJob]);

  React.useEffect(() => {
    if (!reportArtifactJob) return;
    if (reportArtifactJob.status === 'done' || reportArtifactJob.status === 'failed') {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const pollJob = async () => {
      try {
        const payload = await http.request<Record<string, unknown>>({
          path: reportArtifactJob.statusEndpoint,
          cache: 'no-store',
        });
        if (cancelled) return;

        const next = extractReportArtifactJobStatus(payload);

        if (next.status === 'done') {
          const filePayload = await http.request<Record<string, unknown>>({
            path: reportArtifactJob.fileUrlEndpoint,
            cache: 'no-store',
          });
          if (cancelled) return;
          const fileUrl = extractReportArtifactFileUrl(filePayload);
          setReportArtifactJob((previous) =>
            previous?.jobId === reportArtifactJob.jobId
              ? {
                  ...previous,
                  fileUrl,
                  status: 'done',
                  error: next.error ?? previous.error,
                }
              : previous,
          );
          return;
        }

        setReportArtifactJob((previous) =>
          previous?.jobId === reportArtifactJob.jobId
            ? {
                ...previous,
                status: next.status,
                error: next.error ?? previous.error,
              }
            : previous,
        );

        if (next.status === 'failed') return;
        timer = window.setTimeout(pollJob, REPORT_ARTIFACT_POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unable to refresh report job.';
        setReportArtifactJob((previous) =>
          previous?.jobId === reportArtifactJob.jobId ? { ...previous, error: message } : previous,
        );
        timer = window.setTimeout(pollJob, REPORT_ARTIFACT_POLL_INTERVAL_MS);
      }
    };

    timer = window.setTimeout(pollJob, 800);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reportArtifactJob]);

  React.useEffect(() => {
    if (shaderState !== 'sweeping') return;
    const timeoutMs = prefersReducedMotion ? 80 : 820;
    const timer = window.setTimeout(() => {
      setShaderState('hidden');
    }, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion, shaderState]);

  const handleReportArtifactAction = React.useCallback(async () => {
    if (reportArtifactJob?.status === 'failed') {
      setReportArtifactJob(null);
      setIsJainaProMode(true);
      return;
    }

    if (!reportArtifactJob || reportArtifactJob.status !== 'done') {
      setIsJainaProMode((previous) => !previous);
      return;
    }

    setIsReportArtifactDownloading(true);
    try {
      const fileUrl =
        reportArtifactJob.fileUrl ??
        extractReportArtifactFileUrl(
          await http.request<Record<string, unknown>>({
            path: reportArtifactJob.fileUrlEndpoint,
            cache: 'no-store',
          }),
        );

      if (!fileUrl) {
        throw new Error('Report file URL is not available yet.');
      }

      setReportArtifactJob((previous) =>
        previous?.jobId === reportArtifactJob.jobId ? { ...previous, fileUrl } : previous,
      );
      window.open(fileUrl, '_blank');
    } catch (error) {
      show({
        title: 'Report unavailable',
        description:
          error instanceof Error ? error.message : 'Unable to open the generated report.',
        variant: 'error',
      });
    } finally {
      setIsReportArtifactDownloading(false);
    }
  }, [reportArtifactJob, show]);

  const fetchConversationHistory = React.useCallback(
    async (targetSessionId?: string, before?: string) => {
      if (!adAccountId) return null;

      const searchParams = new URLSearchParams({
        brandId: brandProfileId,
        adAccountId,
        sessionsLimit: '40',
        messagesLimit: '300',
        // The Backend owns the at-rest to parts mapping, beside the live one. A transcript
        // reassembled a second time on the client is the thing this migration deletes.
        shape: 'ui',
      });

      if (targetSessionId) {
        searchParams.set('sessionId', targetSessionId);
      }
      if (before) {
        searchParams.set('before', before);
      }

      const response = await fetch(
        `/api/agents/jaina/chat/conversations?${searchParams.toString()}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => 'Failed to load conversation history.');
        throw new Error(detail || 'Failed to load conversation history.');
      }

      const payload = await response.json().catch(() => null);
      const parsed = jainaConversationUiListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error('Invalid conversation history payload.');
      }

      return {
        ...parsed.data,
        uiMessages: (parsed.data.uiMessages ?? []) as unknown as JainaUIMessage[],
      };
    },
    [adAccountId, brandProfileId],
  );

  // Server-side chat-history search. Filtered results are returned to the sidebar
  // and deliberately NOT written into conversationSessions/the sidebar cache: the
  // cache holds the brand's full list, and seeding it with a filtered page would
  // leave the unfiltered sidebar looking empty.
  // Provenance header: an AI-initiated conversation links back to its caller run.
  const activeConversationSession = React.useMemo(
    () => conversationSessions.find((session) => session.sessionId === sessionId) ?? null,
    [conversationSessions, sessionId],
  );

  const searchConversations = React.useCallback(
    async (filters: AgentSessionListFilters): Promise<JainaConversationSession[]> => {
      const searchParams = new URLSearchParams({ brandId: brandProfileId, sessionsLimit: '40' });
      if (adAccountId) searchParams.set('adAccountId', adAccountId);
      if (filters.q) searchParams.set('q', filters.q);
      if (filters.initiator) searchParams.set('initiator', filters.initiator);
      if (filters.initiatorAgent) searchParams.set('initiator_agent', filters.initiatorAgent);
      if (filters.tags && filters.tags.length > 0) {
        searchParams.set('tags', filters.tags.join(','));
      }

      const response = await fetch(
        `/api/agents/jaina/chat/conversations?${searchParams.toString()}`,
        { method: 'GET', cache: 'no-store' },
      );
      if (!response.ok) {
        throw new Error('Failed to search conversations.');
      }
      const parsed = jainaConversationListResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      if (!parsed.success) {
        throw new Error('Invalid conversation search payload.');
      }
      return parsed.data.sessions;
    },
    [adAccountId, brandProfileId],
  );

  const updateConversationTags = React.useCallback(
    async (targetSessionId: string, tags: string[]): Promise<string[]> => {
      const response = await fetch(
        `/api/agents/jaina/chat/conversations/${encodeURIComponent(targetSessionId)}?brandId=${encodeURIComponent(brandProfileId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags }),
        },
      );
      if (!response.ok) {
        throw new Error('Failed to update tags.');
      }
      const parsed = updateAgentSessionTagsResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      const stored = parsed.success ? parsed.data.tags : tags;
      setConversationSessionsWithCache((previous) =>
        previous.map((session) =>
          session.sessionId === targetSessionId ? { ...session, tags: stored } : session,
        ),
      );
      return stored;
    },
    [brandProfileId, setConversationSessionsWithCache],
  );

  const ensureConversationSession = React.useCallback(
    async (preferredSessionId?: string) => {
      if (!adAccountId) return null;

      const response = await fetch('/api/agents/jaina/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          context: {
            adAccountId,
            brandId: brandProfileId,
            ...(preferredSessionId ? { sessionId: preferredSessionId } : {}),
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => 'Failed to create conversation session.');
        throw new Error(detail || 'Failed to create conversation session.');
      }

      const payload = await response.json().catch(() => null);
      const parsed = createConversationSessionResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error('Invalid conversation session response.');
      }

      const mapped = mapConversationCreateResponse(parsed.data);
      const now = new Date().toISOString();
      const normalizedSessionTitle = normalizeSessionTitle(mapped.title);

      setConversationSessionsWithCache((previous) =>
        upsertConversationSession(previous, {
          sessionId: mapped.sessionId,
          brandId: mapped.brandId,
          adAccountId: mapped.adAccountId,
          title: normalizedSessionTitle,
          lastMessageRole: null,
          lastMessagePreview: null,
          lastMessageAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      );

      if (normalizedSessionTitle) {
        setSessionTitleById((previous) => ({
          ...previous,
          [mapped.sessionId]: normalizedSessionTitle,
        }));
      }

      return mapped;
    },
    [adAccountId, brandProfileId, setConversationSessionsWithCache],
  );

  const { hasEarlier, isLoadingEarlier, loadEarlier, setEarlierCursor } =
    useEarlierHistory<JainaUIMessage>({
      fetchPage: React.useCallback(
        async (cursor: string) => {
          const payload = await fetchConversationHistory(sessionId, cursor);
          if (!payload) return null;
          return { items: payload.uiMessages, nextCursor: payload.nextCursor ?? null };
        },
        [fetchConversationHistory, sessionId],
      ),
      applyPage: React.useCallback(
        (older: JainaUIMessage[]) => {
          setUiMessages((current) => prependUnseen(current, older));
        },
        [setUiMessages],
      ),
    });

  const loadConversationSession = React.useCallback(
    async (targetSessionId: string, options?: { silent?: boolean }) => {
      if (!adAccountId) return;

      setIsConversationSwitching(true);
      try {
        const payload = await fetchConversationHistory(targetSessionId);
        if (!payload) return;

        processedToolResultIdsRef.current.clear();
        processedCanvasEnvelopeKeysRef.current.clear();
        persistedAssistantResponseIdsRef.current.clear();
        setQueuedMessages([]);
        setEditingQueueMessageId(null);
        setQueueEditDraft('');
        queueDispatchInFlightRef.current = false;
        setSessionId(targetSessionId);
        setConversationSessionsWithCache(sortConversationSessions(payload.sessions));
        setSessionTitleById((previous) => {
          const next = { ...previous };
          for (const session of payload.sessions) {
            const sessionTitle = normalizeSessionTitle(session.title ?? null);
            if (sessionTitle) {
              next[session.sessionId] = sessionTitle;
            }
          }
          return next;
        });
        setUiMessages(payload.uiMessages);
        setEarlierCursor(payload.nextCursor ?? null);
        setShaderState(payload.uiMessages.length > 0 ? 'hidden' : 'visible');
      } catch (error) {
        if (!options?.silent) {
          const message =
            error instanceof Error ? error.message : 'Unable to load conversation history.';
          show({
            title: 'History unavailable',
            description: message,
            variant: 'error',
          });
        }
      } finally {
        setIsConversationSwitching(false);
      }
    },
    [
      adAccountId,
      fetchConversationHistory,
      setConversationSessionsWithCache,
      setEarlierCursor,
      setUiMessages,
      show,
    ],
  );

  /**
   * Re-read the SESSION list. It used to re-read the transcript too and merge it into the
   * messages on screen — a polling second source for a turn the reader was watching arrive,
   * and the reason a finished answer could be replaced by an older snapshot of itself. The
   * transcript now has one owner, so this touches the sidebar and nothing else.
   */
  const refreshConversationSessions = React.useCallback(
    async (targetSessionId: string) => {
      if (!adAccountId) return;
      try {
        const payload = await fetchConversationHistory(targetSessionId);
        if (!payload) return;
        setConversationSessionsWithCache(sortConversationSessions(payload.sessions));
        setSessionTitleById((previous) => {
          const next = { ...previous };
          for (const session of payload.sessions) {
            const sessionTitle = normalizeSessionTitle(session.title ?? null);
            if (sessionTitle) {
              next[session.sessionId] = sessionTitle;
            }
          }
          return next;
        });
      } catch {
        // Silent polling refresh; keep existing UI state when sync fails.
      }
    },
    [adAccountId, fetchConversationHistory, setConversationSessionsWithCache],
  );

  // A turn ends exactly once, and the SDK says when. What used to live here was a
  // 200-line reconciler that re-derived the assistant message from a folded stream state on
  // every frame; `toJainaChatMessage` does that at render time now, from the parts. All that
  // is left is what genuinely happens ONCE at the end of a turn and is not a message field:
  // adopt the plan's title, and re-read the session list so the sidebar preview catches up.
  const settledResponseIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (chatStatus === 'submitted' || chatStatus === 'streaming') return;
    const settled = liveMessage;
    if (!settled || settled.role !== 'assistant') return;
    if (settledResponseIdRef.current === settled.id) return;
    settledResponseIdRef.current = settled.id;

    persistedAssistantResponseIdsRef.current.add(settled.id);
    setPendingReportArtifactResponseId(null);
    void refreshConversationSessions(sessionId);
  }, [chatStatus, liveMessage, refreshConversationSessions, sessionId]);

  // The planner names the conversation. Applied only when the session has no title yet, so a
  // later turn's plan cannot rename a conversation the reader has already learned to recognise.
  React.useEffect(() => {
    const planTitle = normalizeSessionTitle(liveChatMessage?.plan?.title ?? null);
    if (!planTitle) return;
    setSessionTitleById((previous) =>
      previous[sessionId] === planTitle ? previous : { ...previous, [sessionId]: planTitle },
    );
  }, [liveChatMessage?.plan?.title, sessionId]);

  // Mirror the active run/response into refs so the realtime run-status handler
  // (which fires outside React's render) can match the in-flight run.
  React.useEffect(() => {
    activeResponseIdRef.current = activeResponseId;
  }, [activeResponseId]);
  React.useEffect(() => {
    activeRunIdRef.current = liveChatMessage?.runId;
  }, [liveChatMessage?.runId]);

  // Recovery channel: even when the live NDJSON stream is lost, the durable run
  // row still transitions to completed/failed. Render the persisted result from
  // that signal, and drive the per-session "generating" indicator in the sidebar.
  const handleRunStatusRow = React.useCallback(
    (row: JainaRunStatusRow) => {
      setGeneratingSessionIds((previous) => {
        const next = new Set(previous);
        if (row.status === 'running' || row.status === 'pending') {
          next.add(row.sessionId);
        } else {
          next.delete(row.sessionId);
        }
        return next;
      });

      if (!isTerminalRunStatus(row.status)) return;

      const isActiveRun = Boolean(row.runId) && row.runId === activeRunIdRef.current;
      const responseId = activeResponseIdRef.current;
      if (!isActiveRun || !responseId || persistedAssistantResponseIdsRef.current.has(responseId)) {
        return;
      }

      // The durable run row can reach completed before the final assistant message and
      // response.done frame. Refresh opportunistically, but keep the live reader attached so
      // its buffered tail remains the authority until the stream finalizes the visible turn.
      if (row.status === 'completed') {
        void refreshConversationSessions(activeSessionIdRef.current);
        return;
      }

      persistedAssistantResponseIdsRef.current.add(responseId);
      // The failure is not patched onto the transcript from here any more. The run row going
      // terminal is a SECOND source for "how did this turn end", and letting it rewrite the
      // message is what allowed a stale snapshot to overwrite a live answer. The stream carries
      // its own `error` chunk; this path only surfaces the failure and releases the reader.
      show({
        title: 'Jaina error',
        description: row.errorMessage || 'Jaina run failed.',
        variant: 'error',
      });
      void refreshConversationSessions(activeSessionIdRef.current);
      // The run already reached a terminal status server-side — just release the local reader.
      // Cancelling here would flip the durable status to `cancelled` and mis-record a run that
      // actually completed.
      stopChat();
    },
    [refreshConversationSessions, show, stopChat],
  );

  useJainaRunStatusRealtime({
    enabled: Boolean(adAccountId),
    onRunStatus: handleRunStatusRow,
  });

  const generatingSessionIdsForSidebar = React.useMemo(() => {
    if (!isStreaming && !activeResponseId) return generatingSessionIds;
    const next = new Set(generatingSessionIds);
    next.add(sessionId);
    return next;
  }, [generatingSessionIds, isStreaming, activeResponseId, sessionId]);

  React.useEffect(() => {
    const toolResults = liveChatMessage?.toolResults ?? [];
    const proposedEnvelopes = liveMessage ? canvasActionsOf(liveMessage) : [];
    if (toolResults.length === 0 && proposedEnvelopes.length === 0) return;

    const envelopesToApply: Array<ReturnType<typeof extractCampaignCanvasActionsEnvelope>> = [];

    for (const toolResult of toolResults) {
      if (processedToolResultIdsRef.current.has(toolResult.id)) {
        continue;
      }
      processedToolResultIdsRef.current.add(toolResult.id);

      if (!toolResult.ok || !toolResult.output) {
        continue;
      }

      const envelope = extractCampaignCanvasActionsEnvelope(toolResult.output);
      if (envelope) {
        envelopesToApply.push(envelope);
      }
    }

    // The tool-result loop above cannot actually find an envelope today, and the reason is
    // structural rather than incidental: `sanitizeToolResultData` DELETES `output` from every
    // `tool.result` before it reaches either wire — unconditionally, not by size — and replaces
    // it with `output_summary`, which is a shape descriptor (`{omitted, type, keys,
    // approx_bytes}`), never the payload. It is kept because it costs nothing and is the only
    // path that ever carried this feature.
    //
    // `canvas.actions.proposed` as its own data part is the channel that CAN work, because the
    // sanitizer only touches tool frames. It is inert for a different reason: nothing in the
    // Backend emits that event, and it is absent from FORWARDABLE_EVENT_TYPES, so it would be
    // dropped before the mapper even if something did. Both gaps are pre-existing.
    for (const proposed of proposedEnvelopes) {
      const parsed = campaignCanvasActionsEnvelopeSchema.safeParse(proposed);
      if (parsed.success) envelopesToApply.push(parsed.data);
    }

    for (const envelope of envelopesToApply) {
      if (!envelope) continue;

      const envelopeKey = JSON.stringify({
        brandId: envelope.brandId,
        userId: envelope.userId,
        sessionId: envelope.sessionId,
        actions: envelope.actions,
      });
      if (processedCanvasEnvelopeKeysRef.current.has(envelopeKey)) {
        continue;
      }
      processedCanvasEnvelopeKeysRef.current.add(envelopeKey);

      const hasBrandMatch = envelope.brandId === brandProfileId;
      if (!hasBrandMatch) {
        continue;
      }

      const normalizedEnvelopeUserId = normalizeIdentity(envelope.userId);
      const normalizedSessionUserId = normalizeIdentity(userId);
      const hasUserMatch =
        !normalizedSessionUserId ||
        !normalizedEnvelopeUserId ||
        normalizedEnvelopeUserId === normalizedSessionUserId;
      if (!hasUserMatch) {
        console.warn(
          'Applying canvas action envelope despite userId mismatch',
          envelope.userId,
          userId,
        );
      }

      for (const action of envelope.actions) {
        processAIAction(action);
      }
      if (envelope.actions.length > 0) {
        onCanvasActionApplied?.();
      }

      show({
        title: 'Canvas updated by Jaina',
        description: `${envelope.actions.length} change(s) applied to this session.`,
        variant: 'success',
      });
    }
  }, [
    brandProfileId,
    onCanvasActionApplied,
    processAIAction,
    show,
    liveChatMessage?.toolResults,
    liveMessage,
    userId,
  ]);

  React.useEffect(() => {
    let cancelled = false;

    async function bootstrapHistory() {
      if (!adAccountId) {
        setConversationSessions([]);
        setShaderState('visible');
        return;
      }

      setUiMessages([]);
      setQueuedMessages([]);
      setEditingQueueMessageId(null);
      setQueueEditDraft('');
      setIsJainaProMode(false);
      setPendingReportArtifactResponseId(null);
      setReportArtifactJob(null);
      queueDispatchInFlightRef.current = false;
      processedToolResultIdsRef.current.clear();
      processedCanvasEnvelopeKeysRef.current.clear();
      processedReportArtifactJobIdsRef.current.clear();
      persistedAssistantResponseIdsRef.current.clear();
      setIsHistoryLoading(true);

      try {
        const cachedSessions = getFreshConversationSessionsFromCache();
        const sessions =
          cachedSessions ??
          sortConversationSessions((await fetchConversationHistory())?.sessions ?? []);
        if (cancelled) return;

        setConversationSessionsWithCache(sessions);
        setSessionTitleById((previous) => {
          const next = { ...previous };
          for (const session of sessions) {
            const sessionTitle = normalizeSessionTitle(session.title ?? null);
            if (sessionTitle) {
              next[session.sessionId] = sessionTitle;
            }
          }
          return next;
        });

        const deepLinkSessionId = deepLinkSessionIdRef.current;
        deepLinkSessionIdRef.current = null;
        const targetSessionId = deepLinkSessionId ?? sessions[0]?.sessionId;
        if (!targetSessionId) {
          setSessionId(createJainaSessionId());
          setUiMessages([]);
          setQueuedMessages([]);
          setShaderState('visible');
          return;
        }

        setSessionId(targetSessionId);
        const conversationPayload = await fetchConversationHistory(targetSessionId);
        if (!conversationPayload || cancelled) return;
        setConversationSessionsWithCache(sortConversationSessions(conversationPayload.sessions));
        setSessionTitleById((previous) => {
          const next = { ...previous };
          for (const session of conversationPayload.sessions) {
            const sessionTitle = normalizeSessionTitle(session.title ?? null);
            if (sessionTitle) {
              next[session.sessionId] = sessionTitle;
            }
          }
          return next;
        });
        setUiMessages(conversationPayload.uiMessages);
        setEarlierCursor(conversationPayload.nextCursor ?? null);
        setShaderState(conversationPayload.uiMessages.length > 0 ? 'hidden' : 'visible');
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : 'Unable to load conversation history.';
        show({
          title: 'History unavailable',
          description: message,
          variant: 'error',
        });
        setSessionId(createJainaSessionId());
        setQueuedMessages([]);
        setShaderState('visible');
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false);
        }
      }
    }

    void bootstrapHistory();

    return () => {
      cancelled = true;
    };
  }, [
    adAccountId,
    fetchConversationHistory,
    getFreshConversationSessionsFromCache,
    setConversationSessionsWithCache,
    setEarlierCursor,
    setUiMessages,
    show,
  ]);

  React.useEffect(() => {
    if (!adAccountId) return;

    const topic = `jaina:conversations:${brandProfileId}:${adAccountId}`;
    const channel = supabase.channel(topic, {
      config: {
        broadcast: { self: false },
      },
    });

    channel
      .on(
        'broadcast',
        { event: 'conversation_updated' },
        ({ payload }: { payload: Record<string, unknown> }) => {
          if (streamBusyRef.current) return;

          const payloadSessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
          const currentSessionId = activeSessionIdRef.current;

          if (payloadSessionId && payloadSessionId !== currentSessionId) {
            void fetchConversationHistory()
              .then((history) => {
                if (!history) return;
                setConversationSessionsWithCache(sortConversationSessions(history.sessions));
              })
              .catch(() => {});
            return;
          }

          void refreshConversationSessions(currentSessionId);
        },
      )
      .subscribe();

    conversationChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      if (conversationChannelRef.current === channel) {
        conversationChannelRef.current = null;
      }
    };
  }, [
    adAccountId,
    brandProfileId,
    fetchConversationHistory,
    refreshConversationSessions,
    setConversationSessionsWithCache,
    supabase,
  ]);

  const dispatchMessage = React.useCallback(
    async (input: {
      query: string;
      canvas: boolean;
      clarificationId?: string;
      images?: Array<{ url: string; name?: string; mediaType?: string }>;
      // Kept separate from `images` on purpose — that field is the pixels path, where
      // Jaina's media resolver warns on anything that is not an image.
      documents?: AgentDocumentAttachment[];
      documentScopeKey?: string;
      inlineTextContext?: string;
      references?: AgentMentionReference[];
      planAction?: JainaPlanAction;
      scaffoldAction?: JainaScaffoldAction;
      toolAction?: JainaToolAction;
      forceReportArtifact?: boolean;
      silentUserMessage?: boolean;
      onDispatchError?: (message: string) => void;
    }) => {
      const query = input.query.trim();
      if (!query) return false;

      if (!adAccountId) {
        show({
          title: 'Select an ad account',
          description: 'Jaina needs an ad account context.',
          variant: 'warning',
        });
        // Both early returns below tell the caller too. A caller holding optimistic UI
        // (an approval decision) otherwise keeps rendering "Approved" for a request
        // that never left the browser — the same silence `onDispatchError` exists for
        // on the fetch path.
        input.onDispatchError?.('Jaina needs an ad account context.');
        return false;
      }

      const now = new Date().toISOString();
      let activeSessionId = sessionId;

      try {
        const ensuredSession = await ensureConversationSession(sessionId);
        if (ensuredSession?.sessionId) {
          activeSessionId = ensuredSession.sessionId;
          if (ensuredSession.sessionId !== sessionId) {
            setSessionId(ensuredSession.sessionId);
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to initialize conversation session.';
        show({
          title: 'Conversation setup failed',
          description: message,
          variant: 'error',
        });
        input.onDispatchError?.(message);
        return false;
      }

      // No local user or assistant placeholder is built here any more. `sendTurn` appends the
      // user message and the SDK opens the assistant one from the stream's own `start` chunk,
      // so the transcript has a single author. The placeholder pair existed to give the NDJSON
      // fold something to write into, and keeping it would put a second message on screen for
      // every turn.
      if (shaderState === 'visible') {
        setShaderState('sweeping');
      }

      setConversationSessionsWithCache((previous) =>
        upsertConversationSession(previous, {
          sessionId: activeSessionId,
          brandId: brandProfileId,
          adAccountId,
          title: normalizeSessionTitle(sessionTitleById[activeSessionId]) ?? null,
          lastMessageRole: 'user',
          lastMessagePreview: query,
          lastMessageAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      );
      if (input.forceReportArtifact) {
        setPendingReportArtifactResponseId(activeSessionId);
        setReportArtifactJob(null);
      }
      processedToolResultIdsRef.current.clear();
      processedCanvasEnvelopeKeysRef.current.clear();

      // The canvas rides in the QUERY, not beside it: there is no Backend field for it,
      // and `paid_scaffold_propose` takes named string inputs with no free-form payload,
      // so the only way Jaina can act on the graph is to READ it. Folded in here rather
      // than at the call site so `userMessage.content` above stays the sentence the
      // human typed — the transcript shows a request, not a wall of nodes.
      const wireContext = [
        input.inlineTextContext,
        campaignCanvasPayload
          ? buildCampaignCanvasProposalBlock(
              campaignCanvasPayload,
              'This canvas is the human-reviewed graph. Propose it with paid_scaffold_propose, naming each node with the path_key shown.',
            )
          : null,
      ].filter((value): value is string => Boolean(value));
      const wireQuery = wireContext.length > 0 ? `${query}\n\n${wireContext.join('\n\n')}` : query;

      const hasReferences = Boolean(input.references?.length);
      const hasAttachments = Boolean(input.images?.length);

      // Fired here rather than in the Next proxy that used to carry it: the proxy exists only to
      // forward the stream, and the browser talks to the Backend directly now. Imported lazily —
      // a static `posthog-js` import lands in the root bundle on every route.
      void import('posthog-js')
        .then(({ default: posthog }) => {
          // The proxy read `body.sessionId`; the request schema nests it under `context`, so
          // this property has been null on every Jaina message ever sent.
          posthog.capture('jaina_chat_message_sent', { session_id: activeSessionId });
        })
        .catch(() => {});

      void sendTurn({
        query: wireQuery,
        // The transcript shows the sentence the reader typed, never the canvas block folded into
        // it — and nothing at all for a decision the schema forced us to phrase as a query.
        displayText: query,
        silent: input.silentUserMessage,
        ...(hasReferences || hasAttachments
          ? {
              mentions: {
                references: input.references ?? [],
                ...(hasAttachments ? { attachments: input.images } : {}),
              },
            }
          : {}),
        canvas: input.canvas || Boolean(campaignCanvasPayload),
        adAccountId,
        ...(selectedAdAccountIds.length > 1 ? { adAccountIds: selectedAdAccountIds } : {}),
        brandId: brandProfileId,
        projectId: activeProjectId,
        sessionId: activeSessionId,
        clarificationId: input.clarificationId,
        userId: userId ?? undefined,
        images: input.images,
        documents: input.documents,
        documentScopeKey: input.documentScopeKey,
        references: input.references,
        planAction: input.planAction,
        scaffoldAction: input.scaffoldAction,
        toolAction: input.toolAction,
        forceReportArtifact: input.forceReportArtifact,
        onDispatchError: (message) => {
          if (input.forceReportArtifact) {
            setPendingReportArtifactResponseId(null);
          }
          show({ title: 'Request failed', description: message, variant: 'error' });
          input.onDispatchError?.(message);
        },
      });

      return true;
    },
    [
      activeProjectId,
      adAccountId,
      selectedAdAccountIds,
      brandProfileId,
      campaignCanvasPayload,
      ensureConversationSession,
      sessionId,
      sessionTitleById,
      shaderState,
      show,
      sendTurn,
      setConversationSessionsWithCache,
      userId,
    ],
  );

  const queueMessageForLater = React.useCallback(
    (input: {
      query: string;
      canvas: boolean;
      clarificationId?: string;
      images?: QueuedJainaMessage['images'];
      inlineTextContext?: string;
      references?: AgentMentionReference[];
      forceReportArtifact?: boolean;
    }) => {
      const content = input.query.trim();
      if (!content) return;
      const queuedMessage: QueuedJainaMessage = {
        id: createQueuedMessageId(),
        content,
        createdAt: new Date().toISOString(),
        canvas: input.canvas,
        ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
        ...(input.inlineTextContext ? { inlineTextContext: input.inlineTextContext } : {}),
        ...(input.references && input.references.length > 0
          ? { references: input.references }
          : {}),
        ...(input.forceReportArtifact ? { forceReportArtifact: input.forceReportArtifact } : {}),
        ...(input.clarificationId ? { clarificationId: input.clarificationId } : {}),
      };
      setQueuedMessages((previous) => enqueueMessage(previous, queuedMessage));
    },
    [],
  );

  const handleSubmit = React.useCallback(
    async (query: string, attachments?: Attachment[], references: AgentMentionReference[] = []) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) return;

      const submittedAttachments = attachments ?? [];
      const attachmentContext = buildAgentAttachmentContext(submittedAttachments, 'jaina');
      const resolvedReferences = mergeAttachmentReferences(
        references,
        submittedAttachments,
        'jaina',
      );
      const images = attachmentContext.attachments;
      const inlineTextContext = buildInlineTextContextBlock(attachmentContext.inlineTexts);
      // Documents stay OUT of `images`: that field is the pixels path, where Jaina's
      // media resolver emits an unsupported_media_kind warning for anything non-image.
      const documents = attachmentContext.documents;

      const pendingPlanId = findPendingPlanId(messages);

      const input = {
        query: normalizedQuery,
        canvas: false,
        clarificationId: pendingClarificationId,
        ...(resolvedReferences.length > 0 ? { references: resolvedReferences } : {}),
        forceReportArtifact: isJainaProMode,
        ...(images.length > 0 ? { images } : {}),
        ...(inlineTextContext ? { inlineTextContext } : {}),
        ...(documents.length > 0 ? { documents } : {}),
        // Scopes which ephemeral documents this turn may resolve — server-derived.
        ...(documents.length > 0 ? { documentScopeKey: attachmentScopeKey } : {}),
        ...(pendingPlanId
          ? {
              planAction: {
                type: 'refine' as const,
                plan_id: pendingPlanId,
                edits: normalizedQuery,
              },
            }
          : {}),
      };

      const shouldQueue = shouldQueueSubmission({
        isStreaming,
        activeResponseId,
      });
      if (shouldQueue) {
        queueMessageForLater(input);
        if (isJainaProMode) {
          setIsJainaProMode(false);
        }
        return;
      }

      const started = await dispatchMessage(input);
      if (started && isJainaProMode) {
        setIsJainaProMode(false);
      }
    },
    [
      activeResponseId,
      dispatchMessage,
      queueMessageForLater,
      isJainaProMode,
      isStreaming,
      messages,
      pendingClarificationId,
    ],
  );

  const handleQueueEditStart = React.useCallback((message: QueuedJainaMessage) => {
    setEditingQueueMessageId(message.id);
    setQueueEditDraft(message.content);
  }, []);

  const handleQueueEditCancel = React.useCallback(() => {
    setEditingQueueMessageId(null);
    setQueueEditDraft('');
  }, []);

  const handleQueueEditSave = React.useCallback(() => {
    if (!editingQueueMessageId) return;
    const trimmedDraft = queueEditDraft.trim();
    if (!trimmedDraft) return;

    setQueuedMessages((previous) =>
      updateQueuedMessageContent(previous, editingQueueMessageId, trimmedDraft),
    );
    setEditingQueueMessageId(null);
    setQueueEditDraft('');
  }, [editingQueueMessageId, queueEditDraft]);

  const handleQueueRemove = React.useCallback(
    (queueMessageId: string) => {
      setQueuedMessages((previous) => removeQueuedMessage(previous, queueMessageId));
      if (editingQueueMessageId === queueMessageId) {
        setEditingQueueMessageId(null);
        setQueueEditDraft('');
      }
    },
    [editingQueueMessageId],
  );

  React.useEffect(() => {
    if (isHistoryLoading || isConversationSwitching) return;
    // isViewedStreaming (not just local isStreaming) so a detached run still executing on this
    // session doesn't get a second turn dispatched under it — the Backend fences one per session.
    if (isViewedStreaming || activeResponseId) return;
    if (queuedMessages.length === 0) return;
    if (queueDispatchInFlightRef.current) return;

    const nextQueuedMessage = queuedMessages[0];
    if (!nextQueuedMessage) return;

    queueDispatchInFlightRef.current = true;

    void (async () => {
      const started = await dispatchMessage({
        query: nextQueuedMessage.content,
        canvas: nextQueuedMessage.canvas,
        clarificationId: nextQueuedMessage.clarificationId,
        images: nextQueuedMessage.images,
        inlineTextContext: nextQueuedMessage.inlineTextContext,
        references: nextQueuedMessage.references,
        forceReportArtifact: nextQueuedMessage.forceReportArtifact,
      });

      if (started) {
        setQueuedMessages((previous) => removeQueuedMessage(previous, nextQueuedMessage.id));
        if (editingQueueMessageId === nextQueuedMessage.id) {
          setEditingQueueMessageId(null);
          setQueueEditDraft('');
        }
      }

      queueDispatchInFlightRef.current = false;
    })();
  }, [
    activeResponseId,
    dispatchMessage,
    editingQueueMessageId,
    isConversationSwitching,
    isHistoryLoading,
    isViewedStreaming,
    queuedMessages,
  ]);

  const handleClearConversation = React.useCallback(() => {
    if (isStreaming) {
      void cancelJainaRun(liveChatMessage?.runId);
      stopChat();
    }
    setUiMessages([]);
    setQueuedMessages([]);
    setEditingQueueMessageId(null);
    setQueueEditDraft('');
    setIsJainaProMode(false);
    setPendingReportArtifactResponseId(null);
    setReportArtifactJob(null);
    queueDispatchInFlightRef.current = false;
    setSessionId(createJainaSessionId());
    setShaderState('visible');
    processedToolResultIdsRef.current.clear();
    processedCanvasEnvelopeKeysRef.current.clear();
    processedReportArtifactJobIdsRef.current.clear();
    persistedAssistantResponseIdsRef.current.clear();
  }, [isStreaming, liveChatMessage?.runId, setUiMessages, stopChat]);

  const handleSelectConversation = React.useCallback(
    async (targetSessionId: string) => {
      if (targetSessionId === sessionId) return;
      // Release the local reader before switching — the run keeps executing (Backend + store)
      // and the run row hydrates the completed result when the user returns.
      stopChat();
      await loadConversationSession(targetSessionId);
    },
    [loadConversationSession, sessionId, stopChat],
  );

  // Stop the run on screen even when this reader doesn't own it — the detached run you returned
  // to. Resolve its id from the store when the local reader isn't the owner.
  const handleStop = React.useCallback(() => {
    const ownedRunId = liveChatMessage?.runId;
    const detachedRunId = selectRunForSession(sessionId)(useAgentRunStore.getState())?.run.runId;
    // Detach this reader AND end the run. `stop()` alone would leave the turn executing, which
    // is right on navigation and wrong when a reader presses Stop.
    stopChat();
    void cancelJainaRun(ownedRunId ?? detachedRunId);
  }, [liveChatMessage?.runId, sessionId, stopChat]);

  const handleDeleteConversation = React.useCallback(
    async (targetSessionId: string) => {
      if (!adAccountId) return;
      if (isStreaming && targetSessionId === sessionId) {
        show({
          title: 'Stop current response first',
          description: 'Finish or stop the current stream before deleting this chat.',
          variant: 'warning',
        });
        return;
      }

      setDeletingSessionId(targetSessionId);
      try {
        const response = await fetch(
          `/api/agents/jaina/chat/conversations/${encodeURIComponent(targetSessionId)}`,
          {
            method: 'DELETE',
            cache: 'no-store',
          },
        );

        if (!response.ok) {
          const detail = await readErrorMessage(response, 'Failed to delete conversation.');
          throw new Error(detail);
        }

        const remainingSessions = sortConversationSessions(
          conversationSessions.filter(
            (conversationSession) => conversationSession.sessionId !== targetSessionId,
          ),
        );
        setConversationSessionsWithCache(remainingSessions);
        setSessionTitleById((previous) => {
          const next = { ...previous };
          delete next[targetSessionId];
          return next;
        });

        if (targetSessionId === sessionId) {
          const nextSessionId = remainingSessions[0]?.sessionId;
          if (nextSessionId) {
            await loadConversationSession(nextSessionId);
          } else {
            setUiMessages([]);
            setQueuedMessages([]);
            setEditingQueueMessageId(null);
            setQueueEditDraft('');
            setIsJainaProMode(false);
            setPendingReportArtifactResponseId(null);
            setReportArtifactJob(null);
            queueDispatchInFlightRef.current = false;
            setSessionId(createJainaSessionId());
            setShaderState('visible');
            processedToolResultIdsRef.current.clear();
            processedCanvasEnvelopeKeysRef.current.clear();
            processedReportArtifactJobIdsRef.current.clear();
            persistedAssistantResponseIdsRef.current.clear();
          }
        }

        show({
          title: 'Conversation deleted',
          description: 'This chat and its associated run history were removed.',
          variant: 'success',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete conversation.';
        show({
          title: 'Delete failed',
          description: message,
          variant: 'error',
        });
      } finally {
        setDeletingSessionId((current) => (current === targetSessionId ? null : current));
      }
    },
    [
      adAccountId,
      conversationSessions,
      isStreaming,
      loadConversationSession,
      sessionId,
      setUiMessages,
      setConversationSessionsWithCache,
      show,
    ],
  );

  React.useEffect(() => {
    if (prefersReducedMotion || shaderState === 'hidden') {
      setShaderReady(false);
      return;
    }

    const idleHandle =
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(() => setShaderReady(true), { timeout: 1200 })
        : setTimeout(() => setShaderReady(true), 800);

    return () => {
      if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleHandle as number);
      } else {
        clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
      }
    };
  }, [prefersReducedMotion, shaderState]);

  const handlePlanFeedback = React.useCallback(
    async (payload: PlanFeedbackPayload) => {
      const nextStatus =
        payload.type === 'approve'
          ? 'approved'
          : payload.type === 'abandon'
            ? 'rejected'
            : 'awaiting_approval';

      // Optimistic, and held OUTSIDE the transcript. The transcript is the SDK's now, and the
      // very turn that carries this decision restarts the run — a status written into a message
      // would be replaced by the next projection. Same shape as `optimisticApprovalDecisions`,
      // for the same reason: a decision that silently fails to land must still be visible.
      setOptimisticPlanStatusById((previous) => ({ ...previous, [payload.planId]: nextStatus }));

      const queryByType: Record<PlanFeedbackPayload['type'], string> = {
        approve: 'approved',
        abandon: 'abandoned',
        refine: 'refine plan',
      };

      await dispatchMessage({
        query: queryByType[payload.type],
        canvas: false,
        planAction: {
          type: payload.type,
          plan_id: payload.planId,
          ...(payload.type === 'refine' ? { edits: payload.edits } : {}),
        },
        silentUserMessage: payload.type !== 'refine',
      });
    },
    [dispatchMessage],
  );

  /**
   * A human's answer to ANY approval gate — the three paid-scaffold gates, which
   * carry their own ordered table, and every other gated tool, which does not.
   *
   * The two differ only in which typed field the answer travels on: a scaffold names
   * its version and gate row, everything else is keyed by `approval_id` alone. The
   * channel, the optimistic layer and the rollback are shared, because they are what
   * makes a dropped decision visible rather than silent.
   *
   * The optimistic layer lives HERE and not on the message: the transcript is the SDK's,
   * and the very turn that carries this decision re-projects every message from its parts,
   * so a decision written into a message would be replaced the instant it was set.
   * `onDispatchError` rolls it back — without that a dropped request leaves a card reading
   * "Approved" while nothing happened, which is exactly the silence the gate exists to
   * prevent.
   */
  const handleApprovalDecision = React.useCallback(
    (approval: JainaToolApprovalRequiredPayload, decision: ToolApprovalDecision) => {
      const gate = SCAFFOLD_GATE_BY_TOOL_NAME[approval.toolName];
      const input = approval.input as { scaffold_version_id?: unknown } | null;
      const scaffoldVersionId =
        input && typeof input.scaffold_version_id === 'string' ? input.scaffold_version_id : null;

      let action: { scaffoldAction: JainaScaffoldAction } | { toolAction: JainaToolAction };
      if (gate) {
        // A scaffold gate with no version id cannot name the row it would spend.
        if (!scaffoldVersionId) return;
        action = {
          scaffoldAction: {
            decision,
            approval_id: approval.approvalId,
            scaffold_version_id: scaffoldVersionId,
            gate,
            tool_call_id: approval.toolCallId,
          },
        };
      } else {
        action = {
          toolAction: {
            decision,
            approval_id: approval.approvalId,
            tool_call_id: approval.toolCallId,
          },
        };
      }

      setOptimisticApprovalDecisions((prev) => ({ ...prev, [approval.approvalId]: decision }));

      void dispatchMessage({
        // The backend reads the typed field; this string exists only because the
        // request schema requires a non-empty query, and silentUserMessage hides it.
        query: decision === 'approve' ? 'Approved.' : 'Declined.',
        canvas: false,
        silentUserMessage: true,
        ...action,
        onDispatchError: () => {
          setOptimisticApprovalDecisions((prev) => {
            const next = { ...prev };
            delete next[approval.approvalId];
            return next;
          });
          show({
            title: decision === 'approve' ? 'Approval not delivered' : 'Decision not delivered',
            description: 'Jaina did not receive it. Nothing ran — please answer again.',
            variant: 'error',
          });
        },
      });
    },
    [dispatchMessage, show],
  );

  const handleClearMemory = React.useCallback(async () => {
    if (!adAccountId) return;
    try {
      await clearJainaMemory(adAccountId);
      show({
        title: 'Memory cleared',
        description: 'Jaina will start fresh for this ad account.',
        variant: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to clear memory.';
      show({ title: 'Clear failed', description: message, variant: 'error' });
    }
  }, [adAccountId, show]);

  const handleFocusInput = React.useCallback(() => {
    const textarea = promptInputWrapperRef.current?.querySelector('textarea');
    textarea?.focus();
    textarea?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  React.useEffect(() => {
    if (pendingClarificationId) {
      const textarea = promptInputWrapperRef.current?.querySelector('textarea');
      textarea?.focus();
    }
  }, [pendingClarificationId]);

  // "Regenerate" replays the user turn that preceded an assistant message. Resolved in one pass
  // rather than a reverse scan per assistant message, which was quadratic in transcript length on
  // every streaming frame. The values are strings, so a rebuilt map still leaves the items' props
  // equal and their memo intact.
  const regeneratePromptByMessageId = React.useMemo(() => {
    const prompts = new Map<string, string>();
    let lastUserContent: string | undefined;
    for (const message of messages) {
      if (message.role === 'user') {
        lastUserContent = message.content;
        continue;
      }
      if (message.role === 'assistant' && lastUserContent) {
        prompts.set(message.id, lastUserContent);
      }
    }
    return prompts;
  }, [messages]);

  const isInputDisabled = isHistoryLoading || isConversationSwitching;
  const isQueueStreaming = isViewedStreaming || Boolean(activeResponseId);
  const canStartQueuedNow = !isQueueStreaming && !isHistoryLoading && !isConversationSwitching;
  const hasPendingReportArtifactRequest =
    Boolean(pendingReportArtifactResponseId) &&
    Boolean(activeResponseId) &&
    pendingReportArtifactResponseId === activeResponseId &&
    isStreaming &&
    !reportArtifactJob;
  const reportArtifactStatusLabel =
    reportArtifactJob?.status === 'done'
      ? 'Ready'
      : reportArtifactJob?.status === 'failed'
        ? 'Failed'
        : reportArtifactJob?.status === 'running'
          ? 'Generating'
          : reportArtifactJob?.status === 'pending'
            ? 'Queued'
            : hasPendingReportArtifactRequest
              ? 'Starting'
              : isJainaProMode
                ? 'Pro on'
                : 'Pro';
  const reportArtifactTooltip =
    reportArtifactJob?.status === 'done'
      ? 'Open generated Jaina Pro report'
      : reportArtifactJob?.status === 'failed'
        ? (reportArtifactJob.error ?? 'Jaina Pro report failed')
        : reportArtifactJob
          ? `Jaina Pro report ${reportArtifactJob.status}`
          : 'Create a Jaina Pro report from this analysis';
  const reportArtifactButtonDisabled =
    isInputDisabled ||
    hasPendingReportArtifactRequest ||
    reportArtifactJob?.status === 'pending' ||
    reportArtifactJob?.status === 'running' ||
    isReportArtifactDownloading;
  const ReportArtifactButtonIcon =
    hasPendingReportArtifactRequest ||
    reportArtifactJob?.status === 'pending' ||
    reportArtifactJob?.status === 'running' ||
    isReportArtifactDownloading
      ? Loader2Icon
      : reportArtifactJob?.status === 'done'
        ? DownloadIcon
        : FileTextIcon;

  if (!adAccountId) {
    return <JainaEmptyState adAccountId={null} brandId={brandProfileId} />;
  }

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/60 bg-background/70 backdrop-blur-xl',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-background/80" />
      <AnimatePresence initial={false}>
        {shaderState !== 'hidden' ? (
          <motion.div
            key={shaderState}
            className="pointer-events-none absolute inset-0 z-0 origin-left"
            initial={{ opacity: 0.68, scaleX: 1, x: 0 }}
            animate={
              shaderState === 'sweeping'
                ? { opacity: 0, scaleX: 0.02, x: 96 }
                : { opacity: 0.68, scaleX: 1, x: 0 }
            }
            transition={
              shaderState === 'sweeping'
                ? {
                    duration: prefersReducedMotion ? 0.12 : 0.82,
                    ease: [0.16, 1, 0.3, 1],
                  }
                : { duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }
            }
          >
            {shaderReady ? <AnimatedShaderBackground intensity={1} /> : null}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,80,236,0.08),transparent_55%),radial-gradient(circle_at_20%_80%,rgba(14,116,144,0.12),transparent_50%)]" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <JainaHeader
        brandName={brandName}
        adAccountId={adAccountId}
        campaignId={campaignId}
        onClearMemory={handleClearMemory}
        onClearConversation={handleClearConversation}
        onStop={handleStop}
        isStreaming={isViewedStreaming}
      />

      {activeConversationSession ? (
        <ChatProvenanceBanner
          initiator={activeConversationSession.initiator}
          initiatorAgent={activeConversationSession.initiatorAgent}
          callerSessionId={activeConversationSession.callerSessionId}
          callerRunId={activeConversationSession.callerRunId}
        />
      ) : null}

      <div className="relative z-0 flex min-h-0 flex-1 flex-col md:flex-row">
        <JainaConversationSidebar
          sessions={conversationSessions}
          activeSessionId={sessionId}
          sessionTitleById={sessionTitleById}
          generatingSessionIds={generatingSessionIdsForSidebar}
          isLoading={isHistoryLoading}
          isInteractionDisabled={isConversationSwitching || Boolean(deletingSessionId)}
          deletingSessionId={deletingSessionId}
          brandId={brandProfileId}
          goalsAccessEnabled={goalsAccessEnabled}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
          onCreateConversation={handleClearConversation}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onSearchConversations={searchConversations}
          onUpdateConversationTags={updateConversationTags}
        />
        <AutomationSheets agent="jaina" brandId={brandProfileId} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatTranscript
              anchors={anchors}
              hasEarlier={hasEarlier}
              isLoadingEarlier={isLoadingEarlier}
              onLoadEarlier={loadEarlier}
            >
              {isConversationSwitching ? <ConversationSkeleton /> : null}

              {!isConversationSwitching && messages.length === 0 && (
                <JainaEmptyState
                  adAccountId={adAccountId}
                  onExampleClick={(q) => handleSubmit(q)}
                />
              )}

              {messages.map((message) => (
                <React.Fragment key={message.id}>
                  <JainaMessageItem
                    message={message}
                    onSuggestionClick={handleSubmit}
                    onPlanFeedback={handlePlanFeedback}
                    onFocusInput={handleFocusInput}
                    onApprovalDecision={handleApprovalDecision}
                    optimisticApprovalDecisions={optimisticApprovalDecisions}
                    onRegenerate={handleSubmit}
                    regeneratePrompt={regeneratePromptByMessageId.get(message.id)}
                  />
                  {milestonesForJainaMessage(message).map((milestone) => (
                    <ChatMarker
                      key={milestone.id}
                      id={milestone.id}
                      kind="milestone"
                      label={milestone.label}
                    />
                  ))}
                </React.Fragment>
              ))}
            </ChatTranscript>
          </div>

          <div ref={promptInputWrapperRef} className="shrink-0">
            <div className="px-2 py-2 sm:px-3">
              {queuedMessages.length > 0 ? (
                <div className="mx-auto mb-2 w-full max-w-[1600px] px-1 sm:px-2">
                  <Queue className="border-border/70 bg-card/80 shadow-none">
                    <QueueSection defaultOpen>
                      <QueueSectionTrigger>
                        <QueueSectionLabel count={queuedMessages.length} label="queued messages" />
                        <span className="text-xs text-muted-foreground">
                          {isQueueStreaming ? 'waiting for current response' : 'next will send now'}
                        </span>
                      </QueueSectionTrigger>
                      <QueueSectionContent className="pt-2">
                        <QueueList className="h-[120px]">
                          {queuedMessages.map((queuedMessage, index) => {
                            const isEditing = editingQueueMessageId === queuedMessage.id;
                            return (
                              <QueueItem key={queuedMessage.id}>
                                <div className="flex items-start gap-2">
                                  <QueueItemIndicator completed={false} />
                                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    {isEditing ? (
                                      <Textarea
                                        value={queueEditDraft}
                                        onChange={(event) => setQueueEditDraft(event.target.value)}
                                        className="min-h-[74px] resize-none"
                                        aria-label="Edit queued message"
                                      />
                                    ) : (
                                      <QueueItemContent>{queuedMessage.content}</QueueItemContent>
                                    )}
                                    <div className="text-xs text-muted-foreground/90">
                                      #{index + 1} in queue
                                      {queuedMessage.canvas ? ' • plan mode' : ''}
                                      {queuedMessage.forceReportArtifact ? ' • Jaina Pro' : ''}
                                      {queuedMessage.clarificationId ? ' • clarification' : ''}
                                    </div>
                                  </div>
                                  <QueueItemActions>
                                    {isEditing ? (
                                      <>
                                        <QueueItemAction
                                          aria-label="Save queued message"
                                          onClick={handleQueueEditSave}
                                        >
                                          <SaveIcon className="size-3.5" />
                                        </QueueItemAction>
                                        <QueueItemAction
                                          aria-label="Cancel queued message edit"
                                          onClick={handleQueueEditCancel}
                                        >
                                          <XIcon className="size-3.5" />
                                        </QueueItemAction>
                                      </>
                                    ) : (
                                      <>
                                        {index === 0 && canStartQueuedNow ? (
                                          <QueueItemAction
                                            aria-label="Send queued message now"
                                            onClick={() => {
                                              if (queueDispatchInFlightRef.current) return;
                                              queueDispatchInFlightRef.current = true;
                                              void (async () => {
                                                const started = await dispatchMessage({
                                                  query: queuedMessage.content,
                                                  canvas: queuedMessage.canvas,
                                                  clarificationId: queuedMessage.clarificationId,
                                                  references: queuedMessage.references,
                                                  forceReportArtifact:
                                                    queuedMessage.forceReportArtifact,
                                                });
                                                if (started) {
                                                  setQueuedMessages((previous) =>
                                                    removeQueuedMessage(previous, queuedMessage.id),
                                                  );
                                                }
                                                queueDispatchInFlightRef.current = false;
                                              })();
                                            }}
                                          >
                                            <PlayIcon className="size-3.5" />
                                          </QueueItemAction>
                                        ) : null}
                                        <QueueItemAction
                                          aria-label="Edit queued message"
                                          onClick={() => handleQueueEditStart(queuedMessage)}
                                        >
                                          <Edit2Icon className="size-3.5" />
                                        </QueueItemAction>
                                        <QueueItemAction
                                          aria-label="Remove queued message"
                                          onClick={() => handleQueueRemove(queuedMessage.id)}
                                        >
                                          <Trash2Icon className="size-3.5" />
                                        </QueueItemAction>
                                      </>
                                    )}
                                  </QueueItemActions>
                                </div>
                              </QueueItem>
                            );
                          })}
                        </QueueList>
                      </QueueSectionContent>
                    </QueueSection>
                  </Queue>
                </div>
              ) : null}

              <div data-tour-id="paid-jaina-chat" className="w-full">
                <div className="mb-1 px-1">
                  <AgentDataScopePicker
                    label="Meta accounts"
                    options={accountScopeOptions}
                    selectedIds={selectedAdAccountIds}
                    requiredIds={[adAccountId]}
                    maxSelected={JAINA_MAX_AD_ACCOUNTS}
                    disabled={isInputDisabled || isViewedStreaming}
                    onChange={setSelectedAdAccountIds}
                  />
                </div>
                <PromptInput
                  onSubmit={(value, submitted, references) =>
                    handleSubmit(value, submitted, references)
                  }
                  attachments={attachments}
                  inlinePastedText
                  attachmentOnlyPrompt="Analyze the attached media in the context of my paid media."
                  disabled={isInputDisabled}
                  ariaLabel="Message Jaina"
                  mentionProvider={jainaMentionProvider}
                  mentionSource="jaina"
                  queuedText={initialPrompt}
                  onQueuedTextConsumed={onInitialPromptConsumed}
                  placeholder={
                    pendingClarificationId ? "Reply to Jaina's question…" : 'Ask Jaina anything…'
                  }
                  actions={
                    <TooltipProvider delay={180}>
                      <div className="flex items-center gap-1.5">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                type="button"
                                size="sm"
                                variant={
                                  reportArtifactJob?.status === 'failed'
                                    ? 'destructive'
                                    : isJainaProMode || reportArtifactJob
                                      ? 'default'
                                      : 'secondary'
                                }
                                disabled={reportArtifactButtonDisabled}
                                aria-pressed={isJainaProMode}
                                aria-label={reportArtifactTooltip}
                                onClick={handleReportArtifactAction}
                                className="gap-1.5"
                              >
                                <ReportArtifactButtonIcon
                                  className={cn(
                                    'size-3.5',
                                    (hasPendingReportArtifactRequest ||
                                      reportArtifactJob?.status === 'pending' ||
                                      reportArtifactJob?.status === 'running' ||
                                      isReportArtifactDownloading) &&
                                      'animate-spin',
                                  )}
                                />
                                {reportArtifactStatusLabel}
                              </Button>
                            }
                          />
                          <TooltipContent side="top" className="text-xs">
                            {reportArtifactTooltip}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
