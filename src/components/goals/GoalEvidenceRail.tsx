'use client';

import type {
  GoalExpectedResponse,
  GoalStructuredResponseLeafValue,
  GoalStructuredResponseValue,
} from '@continuum/contracts';
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  Reply,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCEPTED_ATTACHMENT_TYPES,
  useChatAttachments,
} from '@/components/chat/useChatAttachments';
import { Pill } from '@/components/kibo-ui/pill';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { GoalWorkspaceView } from '@/lib/goals/models';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';

type GoalEvidenceRailProps = {
  goal: GoalWorkspaceView;
  currentUserId: string;
  focusedRequestId: string | null;
  onAskTeammate: (input: { targetUserId: string; prompt: string }) => Promise<boolean>;
  onRespondToRequest: (input: {
    requestId: string;
    response: string;
    structuredValue: GoalStructuredResponseValue;
    evidenceAttachmentIds: string[];
  }) => Promise<boolean>;
  onRegisterEvidence: (input: {
    requestId: string;
    sourceStoragePath: string;
    filename: string;
  }) => Promise<string | null>;
};

export function buildStructuredGoalResponse(
  expected: GoalExpectedResponse,
  value: string,
): { response: string; structuredValue: GoalStructuredResponseValue } | null {
  const trimmed = value.trim();
  if (expected.kind === 'choice') {
    const option = expected.options.find((candidate) => candidate.id === trimmed);
    return option
      ? { response: option.label, structuredValue: { kind: 'choice', optionId: option.id } }
      : null;
  }
  if (expected.kind === 'approval') {
    if (trimmed !== 'approved' && trimmed !== 'declined') return null;
    return {
      response: trimmed === 'approved' ? 'Approved' : 'Not approved',
      structuredValue: { kind: 'approval', approved: trimmed === 'approved' },
    };
  }
  if (expected.kind === 'money') {
    if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
    const [whole = '0', fractional = ''] = trimmed.split('.');
    const amountMinor = Number(whole) * 100 + Number(fractional.padEnd(2, '0'));
    if (!Number.isSafeInteger(amountMinor)) return null;
    return {
      response: `${expected.currency} ${trimmed}`,
      structuredValue: { kind: 'money', amountMinor, currency: expected.currency },
    };
  }
  if (expected.kind === 'evidence') {
    if (!trimmed && expected.allowText) return null;
    return {
      response: trimmed || 'Evidence attached',
      structuredValue: { kind: 'evidence', note: trimmed || undefined },
    };
  }
  return trimmed ? { response: trimmed, structuredValue: { kind: 'text', text: trimmed } } : null;
}

function buildFormLeafValue(
  input: Extract<GoalExpectedResponse, { kind: 'form' }>['fields'][number]['input'],
  rawValue: string,
): GoalStructuredResponseLeafValue | null {
  const value = rawValue.trim();
  if (!value) return null;
  if (input.kind === 'money') {
    if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole = '0', fractional = ''] = value.split('.');
    return {
      kind: 'money',
      amountMinor: Number(whole) * 100 + Number(fractional.padEnd(2, '0')),
      currency: input.currency,
    };
  }
  if (input.kind === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? { kind: 'number', value: parsed, ...(input.unit ? { unit: input.unit } : {}) }
      : null;
  }
  if (input.kind === 'choice') {
    const ids = value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return input.multiple
      ? { kind: 'multi_choice', optionIds: ids }
      : ids[0]
        ? { kind: 'choice', optionId: ids[0] }
        : null;
  }
  if (input.kind === 'date') {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : { kind: 'date', value: date.toISOString() };
  }
  if (input.kind === 'date_range') {
    const [startsOn, endsOn] = value.split('/');
    if (!startsOn || !endsOn) return null;
    const startsAt = new Date(`${startsOn}T00:00:00.000Z`);
    const endsAt = new Date(`${endsOn}T00:00:00.000Z`);
    return Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())
      ? null
      : { kind: 'date_range', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
  }
  if (input.kind === 'boolean') {
    return value === 'true' || value === 'false'
      ? { kind: 'boolean', value: value === 'true' }
      : null;
  }
  if (input.kind === 'approval') {
    return value === 'approved' || value === 'declined'
      ? { kind: 'approval', approved: value === 'approved' }
      : null;
  }
  if (input.kind === 'url') {
    try {
      return { kind: 'url', url: new URL(value).toString() };
    } catch {
      return null;
    }
  }
  if (input.kind === 'asset_version_ref') {
    const [assetId, versionId] = value.split(':');
    return assetId && versionId ? { kind: 'asset_version_ref', assetId, versionId } : null;
  }
  if (input.kind === 'evidence') return { kind: 'evidence', note: value };
  return { kind: 'text', text: value };
}

export function buildStructuredGoalFormResponse(
  expected: Extract<GoalExpectedResponse, { kind: 'form' }>,
  values: Record<string, string>,
): { response: string; structuredValue: GoalStructuredResponseValue } | null {
  const structuredValues = expected.fields.flatMap((field) => {
    const value = buildFormLeafValue(field.input, values[field.id] ?? '');
    return value ? [{ fieldId: field.id, value }] : [];
  });
  const resolvedIds = new Set(structuredValues.map((entry) => entry.fieldId));
  if (expected.fields.some((field) => field.required && !resolvedIds.has(field.id))) return null;
  return structuredValues.length > 0
    ? {
        response: `Completed ${structuredValues.length} structured campaign input field${structuredValues.length === 1 ? '' : 's'}.`,
        structuredValue: { kind: 'form', values: structuredValues },
      }
    : null;
}

export function GoalEvidenceRail({
  goal,
  currentUserId,
  focusedRequestId,
  onAskTeammate,
  onRespondToRequest,
  onRegisterEvidence,
}: GoalEvidenceRailProps) {
  const attachments = useChatAttachments({ brandId: goal.brandId, sessionId: goal.id });
  const humanTeammates = useMemo(
    () =>
      goal.participants.filter(
        (participant) =>
          participant.actor.kind === 'human' && participant.actor.userId !== currentUserId,
      ),
    [currentUserId, goal.participants],
  );
  const [askOpen, setAskOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [response, setResponse] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredEvidenceIds, setRegisteredEvidenceIds] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState(focusedRequestId ? 'people' : 'activity');
  const requestElements = useRef(new Map<string, HTMLLIElement>());
  const respondingRequest = goal.inputRequests.find(
    (request) => request.id === respondingRequestId,
  );

  useEffect(() => {
    if (!focusedRequestId) return;
    setActiveTab('people');
    const frame = requestAnimationFrame(() => {
      const element = requestElements.current.get(focusedRequestId);
      element?.focus({ preventScroll: true });
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedRequestId, goal.inputRequests]);

  async function submitRequest() {
    if (!targetUserId || !prompt.trim()) return;
    setIsSubmitting(true);
    const succeeded = await onAskTeammate({ targetUserId, prompt: prompt.trim() });
    setIsSubmitting(false);
    if (!succeeded) return;
    setAskOpen(false);
    setTargetUserId('');
    setPrompt('');
  }

  async function submitResponse() {
    if (!respondingRequestId || !respondingRequest) return;
    const readyAttachments = attachments.files.filter(
      (attachment) => attachment.status === 'ready' && attachment.storagePath,
    );
    const structured =
      (respondingRequest.expectedResponse.kind === 'form'
        ? buildStructuredGoalFormResponse(respondingRequest.expectedResponse, formValues)
        : buildStructuredGoalResponse(respondingRequest.expectedResponse, response)) ??
      (respondingRequest.expectedResponse.kind === 'evidence' && readyAttachments.length > 0
        ? {
            response: 'Evidence attached',
            structuredValue: { kind: 'evidence' as const },
          }
        : null);
    if (!structured) return;
    setIsSubmitting(true);
    const nextRegistered = { ...registeredEvidenceIds };
    for (const attachment of readyAttachments) {
      if (nextRegistered[attachment.id] || !attachment.storagePath) continue;
      const registeredId = await onRegisterEvidence({
        requestId: respondingRequestId,
        sourceStoragePath: attachment.storagePath,
        filename: attachment.name,
      });
      if (!registeredId) {
        setIsSubmitting(false);
        setRegisteredEvidenceIds(nextRegistered);
        return;
      }
      nextRegistered[attachment.id] = registeredId;
    }
    setRegisteredEvidenceIds(nextRegistered);
    const succeeded = await onRespondToRequest({
      requestId: respondingRequestId,
      ...structured,
      evidenceAttachmentIds: Object.values(nextRegistered),
    });
    setIsSubmitting(false);
    if (!succeeded) return;
    setRespondingRequestId(null);
    setResponse('');
    setFormValues({});
    setRegisteredEvidenceIds({});
    attachments.clear();
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col border-l border-border/70 bg-background/35">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border/70 px-3 py-2">
          <TabsList className="w-full">
            <TabsTrigger value="activity" className="flex-1">
              Activity
            </TabsTrigger>
            <TabsTrigger value="people" className="flex-1">
              People & review
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto p-0">
          {goal.activity.length === 0 ? (
            <div className="p-4">
              <p className="text-sm font-medium">No recorded activity</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Commands, agent checkpoints, and review decisions will form the evidence ledger.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-border/60">
              {goal.activity.map((event) => (
                <li key={event.id} className="px-3 py-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-3xs text-muted-foreground">
                      {event.sequence}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs leading-5">
                        <span className="font-medium text-foreground">{event.actorName}</span>{' '}
                        <span className="text-muted-foreground">{event.verb}</span>{' '}
                        <span className="text-foreground">{event.subject}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
                        <Clock3 className="size-3" />
                        {formatRelativeTime(event.occurredAt)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="people" className="min-h-0 flex-1 overflow-y-auto p-0">
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
            <p className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wide text-muted-foreground">
              <Users className="size-3.5" />
              Accountable team
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-2xs"
              disabled={humanTeammates.length === 0}
              onClick={() => setAskOpen(true)}
            >
              <MessageSquarePlus className="size-3" />
              Ask
            </Button>
          </div>
          <ul className="divide-y divide-border/60">
            {goal.participants.map((participant) => (
              <li key={participant.id} className="flex items-center gap-2 px-3 py-2.5">
                <Avatar className="size-7">
                  <AvatarFallback className="text-2xs">{participant.initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-medium">{participant.name}</p>
                    {participant.isAgent ? <Bot className="size-3 text-primary" /> : null}
                  </div>
                  <p className="truncate text-2xs text-muted-foreground">{participant.detail}</p>
                </div>
                {participant.statusLabel ? (
                  <Pill variant={participant.isAgent ? 'violet' : 'secondary'}>
                    {participant.statusLabel}
                  </Pill>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="border-y border-border/70 px-3 py-2">
            <p className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wide text-muted-foreground">
              <CheckCircle2 className="size-3.5" />
              Review docket
            </p>
          </div>
          {goal.reviews.length === 0 ? (
            <p className="p-4 text-xs leading-5 text-muted-foreground">
              No reviews are waiting. Accepted decisions will remain in the activity ledger.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {goal.reviews.map((review) => (
                <li key={review.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{review.title}</p>
                      <p className="mt-0.5 text-2xs text-muted-foreground">
                        Reviewer · {review.reviewerName}
                      </p>
                    </div>
                    <Pill variant="warning">{review.statusLabel}</Pill>
                  </div>
                  {review.note ? (
                    <p className="mt-2 border-l border-border pl-2 text-xs leading-5 text-muted-foreground">
                      {review.note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="border-y border-border/70 px-3 py-2">
            <p className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wide text-muted-foreground">
              <MessageSquarePlus className="size-3.5" />
              Input requests
            </p>
          </div>
          {goal.inputRequests.length === 0 ? (
            <p className="p-4 text-xs leading-5 text-muted-foreground">
              No teammate input is blocking this Goal.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {goal.inputRequests.map((request) => {
                const canRespond =
                  request.targetUserIds.includes(currentUserId) &&
                  !request.responseUserIds.includes(currentUserId);
                const activeDeliveries = request.deliveries.filter(
                  (delivery) => delivery.status !== 'cancelled',
                );
                const visibleDeliveries =
                  activeDeliveries.length > 0 ? activeDeliveries : request.deliveries.slice(-1);
                return (
                  <li
                    key={request.id}
                    ref={(element) => {
                      if (element) requestElements.current.set(request.id, element);
                      else requestElements.current.delete(request.id);
                    }}
                    tabIndex={-1}
                    className={cn(
                      'px-3 py-3 outline-none transition-colors',
                      focusedRequestId === request.id &&
                        'bg-primary/5 ring-1 ring-inset ring-primary/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{request.title}</p>
                        <p className="mt-1 text-2xs leading-4 text-muted-foreground">
                          {request.requesterName} asked {request.targetLabel}
                          {request.responseCount > 0
                            ? ` · ${request.responseCount} response${request.responseCount === 1 ? '' : 's'}`
                            : ''}
                          {(request.checklistItemIds?.length ?? 0) > 0
                            ? ` · ${request.checklistItemIds?.length} checklist item${request.checklistItemIds?.length === 1 ? '' : 's'}`
                            : ''}
                        </p>
                      </div>
                      <Pill variant={canRespond ? 'warning' : 'secondary'}>
                        {canRespond ? 'Needs you' : 'Waiting'}
                      </Pill>
                    </div>
                    {visibleDeliveries.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {visibleDeliveries.map((delivery) => (
                          <div
                            key={delivery.id}
                            className={cn(
                              'flex items-start gap-2 rounded-md border px-2.5 py-2',
                              delivery.usesInAppFallback
                                ? delivery.tone === 'danger'
                                  ? 'border-destructive/30 bg-destructive/5'
                                  : 'border-warning/30 bg-warning/5'
                                : 'border-border/60 bg-muted/20',
                            )}
                          >
                            {delivery.usesInAppFallback ? (
                              <CircleAlert
                                className={cn(
                                  'mt-0.5 size-3.5 shrink-0',
                                  delivery.tone === 'danger' ? 'text-destructive' : 'text-warning',
                                )}
                              />
                            ) : (
                              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="text-2xs font-medium">{delivery.label}</p>
                                <Pill
                                  variant={
                                    delivery.tone === 'danger' ? 'destructive' : delivery.tone
                                  }
                                >
                                  {delivery.status}
                                </Pill>
                              </div>
                              <p className="mt-0.5 text-2xs leading-4 text-muted-foreground">
                                {delivery.detail}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {canRespond ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 px-2 text-2xs"
                        onClick={() => {
                          setRespondingRequestId(request.id);
                          setResponse('');
                          setFormValues({});
                        }}
                      >
                        <Reply className="size-3" />
                        Respond
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={askOpen} onOpenChange={setAskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask a teammate</DialogTitle>
            <DialogDescription>
              Route a focused question to an exact person. Their response becomes part of this
              Goal’s durable evidence trail.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="goal-request-target" className="text-sm font-medium">
                Teammate
              </label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger id="goal-request-target" className="w-full">
                  <SelectValue placeholder="Choose an accountable teammate" />
                </SelectTrigger>
                <SelectContent>
                  {humanTeammates.map((participant) =>
                    participant.actor.kind === 'human' ? (
                      <SelectItem key={participant.id} value={participant.actor.userId}>
                        {participant.name}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="goal-request-prompt" className="text-sm font-medium">
                What do you need?
              </label>
              <Textarea
                id="goal-request-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="State the decision, context, or evidence needed to unblock the work."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAskOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isSubmitting || !targetUserId || !prompt.trim()}
              onClick={() => void submitRequest()}
            >
              {isSubmitting ? 'Sending…' : 'Request input'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(respondingRequestId)}
        onOpenChange={(open) => {
          if (!open) setRespondingRequestId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Respond to this Goal</DialogTitle>
            <DialogDescription>{respondingRequest?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="goal-request-response" className="text-sm font-medium">
              Your input
            </label>
            {respondingRequest?.expectedResponse.kind === 'form' ? (
              <div className="grid gap-4">
                {respondingRequest.expectedResponse.fields.map((field) => (
                  <div key={field.id} className="grid gap-1.5">
                    <label htmlFor={`goal-form-${field.id}`} className="text-sm font-medium">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                    {field.help ? (
                      <p className="text-xs text-muted-foreground">{field.help}</p>
                    ) : null}
                    {field.input.kind === 'choice' && !field.input.multiple ? (
                      <Select
                        value={formValues[field.id] ?? ''}
                        onValueChange={(value) =>
                          setFormValues((current) => ({ ...current, [field.id]: value }))
                        }
                      >
                        <SelectTrigger id={`goal-form-${field.id}`} className="w-full">
                          <SelectValue placeholder="Choose one option" />
                        </SelectTrigger>
                        <SelectContent>
                          {field.input.options.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.input.kind === 'approval' || field.input.kind === 'boolean' ? (
                      <Select
                        value={formValues[field.id] ?? ''}
                        onValueChange={(value) =>
                          setFormValues((current) => ({ ...current, [field.id]: value }))
                        }
                      >
                        <SelectTrigger id={`goal-form-${field.id}`} className="w-full">
                          <SelectValue placeholder="Choose a response" />
                        </SelectTrigger>
                        <SelectContent>
                          {field.input.kind === 'approval' ? (
                            <>
                              <SelectItem value="approved">Approve</SelectItem>
                              <SelectItem value="declined">Do not approve</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="true">Yes</SelectItem>
                              <SelectItem value="false">No</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`goal-form-${field.id}`}
                        type={field.input.kind === 'date' ? 'date' : 'text'}
                        inputMode={
                          field.input.kind === 'money' || field.input.kind === 'number'
                            ? 'decimal'
                            : undefined
                        }
                        value={formValues[field.id] ?? ''}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            [field.id]: event.target.value,
                          }))
                        }
                        placeholder={
                          field.input.kind === 'date_range'
                            ? 'YYYY-MM-DD/YYYY-MM-DD'
                            : field.input.kind === 'asset_version_ref'
                              ? 'asset-id:version-id'
                              : field.input.kind === 'choice' && field.input.multiple
                                ? 'Comma-separated option IDs'
                                : undefined
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : respondingRequest?.expectedResponse.kind === 'choice' ? (
              <Select value={response} onValueChange={setResponse}>
                <SelectTrigger id="goal-request-response" className="w-full">
                  <SelectValue placeholder="Choose one recorded option" />
                </SelectTrigger>
                <SelectContent>
                  {respondingRequest.expectedResponse.options.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : respondingRequest?.expectedResponse.kind === 'approval' ? (
              <Select value={response} onValueChange={setResponse}>
                <SelectTrigger id="goal-request-response" className="w-full">
                  <SelectValue placeholder="Approve or decline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="declined">Do not approve</SelectItem>
                </SelectContent>
              </Select>
            ) : respondingRequest?.expectedResponse.kind === 'money' ? (
              <div className="flex items-center gap-2">
                <span className="rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                  {respondingRequest.expectedResponse.currency}
                </span>
                <Input
                  id="goal-request-response"
                  inputMode="decimal"
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  placeholder="0.00"
                />
              </div>
            ) : (
              <Textarea
                id="goal-request-response"
                value={response}
                onChange={(event) => setResponse(event.target.value)}
                placeholder={
                  respondingRequest?.expectedResponse.kind === 'evidence'
                    ? 'Describe the source and attach evidence from the Goal evidence action.'
                    : 'Share the decision, context, or evidence the team needs.'
                }
                rows={6}
              />
            )}
            {respondingRequest?.expectedResponse.kind === 'evidence' ? (
              <div className="rounded-md border border-dashed p-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium">
                  <Paperclip className="size-3.5" />
                  Add private evidence
                  <input
                    type="file"
                    className="sr-only"
                    accept={ACCEPTED_ATTACHMENT_TYPES}
                    multiple
                    onChange={(event) => {
                      if (event.target.files) attachments.add(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
                {attachments.files.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {attachments.files.map((attachment) => (
                      <li
                        key={attachment.id}
                        className="flex items-center justify-between gap-2 text-2xs text-muted-foreground"
                      >
                        <span className="truncate">
                          {attachment.name} · {attachment.status}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5"
                          onClick={() => attachments.remove(attachment.id)}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-2xs text-muted-foreground">
                    Files stay private to this Goal and are retained with its audit record.
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRespondingRequestId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                isSubmitting ||
                !respondingRequest ||
                attachments.isUploading ||
                (!(respondingRequest.expectedResponse.kind === 'form'
                  ? buildStructuredGoalFormResponse(respondingRequest.expectedResponse, formValues)
                  : buildStructuredGoalResponse(respondingRequest.expectedResponse, response)) &&
                  !(
                    respondingRequest.expectedResponse.kind === 'evidence' &&
                    attachments.files.some((attachment) => attachment.status === 'ready')
                  ))
              }
              onClick={() => void submitResponse()}
            >
              {isSubmitting ? 'Sharing…' : 'Share response'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
