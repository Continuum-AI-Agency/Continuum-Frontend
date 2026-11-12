import type {
  GoalActor,
  GoalArtifact,
  GoalEvent,
  GoalStatus,
  GoalSummary,
} from '@continuum/contracts';
import { parseGoalArtifactMarkdown } from '@continuum/contracts';
import type { UiLocale } from '@/i18n/config';
import { type GoalSnapshotWithChatDeliveries, projectGoalDelivery } from './chatDelivery';
import { goalControlLabel } from './controlLabels';
import { type GoalDisplayTranslator, goalEventKeys, localizeGoalCopy } from './displayCopy';
import {
  type GoalActivityView,
  type GoalArtifactStatusView,
  type GoalParticipantView,
  type GoalStatusView,
  type GoalSummaryView,
  type GoalWorkspaceView,
  initialsForParticipant,
} from './models';

function statusView(status: GoalStatus): GoalStatusView {
  if (status === 'completed') return 'complete';
  if (status === 'archived') return 'archived';
  if (status === 'blocked') return 'blocked';
  if (status === 'draft' || status === 'planning') return 'draft';
  return 'active';
}

function artifactStatusView(status: GoalArtifact['status']): GoalArtifactStatusView {
  if (status === 'accepted') return 'accepted';
  if (status === 'waived') return 'waived';
  if (status === 'ready_for_review') return 'in_review';
  if (status === 'rejected') return 'needs_changes';
  if (status === 'superseded') return 'blocked';
  return 'draft';
}

function labelFromId(value: string, t?: GoalDisplayTranslator): string {
  const normalized = value.replace(/[-_]+/g, ' ').trim();
  const label =
    normalized.length > 0 ? normalized.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Artifact';
  return t ? localizeGoalCopy(goalControlLabel(value, t), t) : label;
}

function actorName(actor: GoalActor): string {
  return actor.kind === 'agent' ? actor.agent : actor.userId;
}

function participantFromActor(
  actor: GoalActor,
  detail: string,
  t?: GoalDisplayTranslator,
): GoalParticipantView {
  const name = actorName(actor);
  return {
    id: actor.kind === 'agent' ? `agent:${actor.agent}` : `human:${actor.userId}`,
    actor,
    name,
    detail,
    initials: initialsForParticipant(name),
    isAgent: actor.kind === 'agent',
    statusLabel: actor.kind === 'agent' ? (t ? t('m_5ce2e6f402') : 'Agent') : null,
  };
}

function uniqueParticipants(
  snapshot: GoalSnapshotWithChatDeliveries,
  t?: GoalDisplayTranslator,
): GoalParticipantView[] {
  const participants = new Map<string, GoalParticipantView>();
  const add = (participant: GoalParticipantView) => {
    if (!participants.has(participant.id)) participants.set(participant.id, participant);
  };

  for (const participant of snapshot.participants) {
    const projected = participantFromActor(
      participant.actor,
      participant.detail ?? (t ? t('m_4ac9c8e277') : 'Goal member'),
      t,
    );
    add({
      ...projected,
      name: participant.displayName,
      initials: initialsForParticipant(participant.displayName),
    });
  }
  add(participantFromActor(snapshot.goal.createdBy, t ? t('m_8936d51753') : 'Goal creator', t));
  if (snapshot.goal.facilitator) {
    add(
      participantFromActor(
        snapshot.goal.facilitator,
        t ? t('m_1c9b51d9a0') : 'Accountable facilitator',
        t,
      ),
    );
  }
  for (const assignment of snapshot.assignments) {
    if (assignment.assignee) {
      add(
        participantFromActor(
          assignment.assignee,
          `${labelFromId(assignment.responsibility, t)} · ${assignment.title}`,
          t,
        ),
      );
    }
  }
  return [...participants.values()];
}

function eventSubject(event: GoalEvent, t?: GoalDisplayTranslator): string {
  switch (event.type) {
    case 'goal.created':
      return event.data.goal.title;
    case 'goal.updated':
      return t ? t('m_3791f71ce3') : 'the Goal charter';
    case 'goal.activated':
      return t ? t('m_728a5a7814') : 'the Goal';
    case 'goal.completed':
      return t ? t('m_728a5a7814') : 'the Goal';
    case 'plan.proposed':
      return event.data.plan.summary;
    case 'plan.activated':
      return t
        ? t('m_a1f6d89532', { version: event.data.planVersion })
        : `plan v${event.data.planVersion}`;
    case 'workstream.upserted':
      return event.data.workstream.title;
    case 'assignment.upserted':
      return event.data.assignment.title;
    case 'artifact.attached':
      return event.data.artifact.title;
    case 'artifact.accepted':
    case 'artifact.waived':
    case 'artifact.reconciled':
    case 'artifact.reviewed':
    case 'artifact.promoted':
      return event.data.artifactId;
    case 'request.created':
      return event.data.request.prompt;
    case 'request.responded':
      return event.data.requestId;
    case 'evidence.added':
      return event.data.evidence.claim;
    case 'decision.recorded':
      return event.data.decision.question;
    case 'resource.attached':
      return event.data.resource.title;
    case 'alignment.recorded':
      return event.data.alignment.rationale;
  }
}

function eventVerb(type: GoalEvent['type'], t?: GoalDisplayTranslator): string {
  return t ? t(goalEventKeys[type]) : type.replaceAll('.', ' ');
}

export function projectGoalSummary(goal: GoalSummary): GoalSummaryView {
  return {
    id: goal.id,
    title: goal.title,
    outcome: goal.objective,
    status: statusView(goal.status),
    updatedAt: goal.updatedAt,
    artifactCount: goal.artifactCount,
    acceptedArtifactCount: goal.resolvedArtifactCount,
    pendingInputCount: goal.openRequestCount,
    accountableHumanName: goal.facilitator ? actorName(goal.facilitator) : null,
  };
}

export function projectGoalActivity(
  events: GoalEvent[],
  t?: GoalDisplayTranslator,
): GoalActivityView[] {
  return [...events]
    .sort((left, right) => right.seq - left.seq)
    .map((event) => ({
      id: event.eventId,
      actorName: actorName(event.actor),
      verb: eventVerb(event.type, t),
      subject: eventSubject(event, t),
      occurredAt: event.ts,
      sequence: event.seq,
    }));
}

export function projectGoalWorkspace(
  snapshot: GoalSnapshotWithChatDeliveries,
  events: GoalEvent[],
  t?: GoalDisplayTranslator,
  locale: UiLocale = 'en',
): GoalWorkspaceView {
  const alignmentsByArtifact = new Map(
    snapshot.alignments
      .filter((alignment) => alignment.subject.kind === 'artifact')
      .map((alignment) => [alignment.subject.id, alignment]),
  );
  const participants = uniqueParticipants(snapshot, t);
  const displayNameForActor = (actor: GoalActor) =>
    participants.find(
      (participant) =>
        participant.id ===
        (actor.kind === 'agent' ? `agent:${actor.agent}` : `human:${actor.userId}`),
    )?.name ?? actorName(actor);
  const documentsByArtifactId = new Map(
    snapshot.artifactDocuments.map((document) => [document.artifactId, document]),
  );

  return {
    id: snapshot.goal.id,
    brandId: snapshot.goal.brandId,
    kind: snapshot.goal.kind,
    title: snapshot.goal.title,
    outcome: snapshot.goal.objective,
    doneWhen: snapshot.goal.successCriteria.map((criterion) => criterion.statement),
    status: statusView(snapshot.goal.status),
    updatedAt: snapshot.goal.updatedAt,
    accountableHumanName: snapshot.goal.facilitator
      ? displayNameForActor(snapshot.goal.facilitator)
      : null,
    artifacts: snapshot.artifacts.map((artifact) => {
      const alignment = alignmentsByArtifact.get(artifact.id);
      const document = documentsByArtifactId.get(artifact.id);
      const markdown =
        artifact.format === 'markdown' && document?.content
          ? parseGoalArtifactMarkdown(document.content).body
          : null;
      const structuredDocument =
        artifact.format === 'json' && document?.document ? document.document : null;
      return {
        id: artifact.id,
        title: artifact.title,
        kindLabel: labelFromId(artifact.artifactType, t),
        status: artifactStatusView(artifact.status),
        dependsOnArtifactIds: artifact.dependencyIds,
        versionLabel: artifact.acceptedVersionId
          ? t
            ? t('m_b43b096611', { version: artifact.acceptedVersionId })
            : `Accepted · ${artifact.acceptedVersionId}`
          : document?.versionId || artifact.headVersionId
            ? t
              ? t('m_ff5dadeb7c', {
                  version: document?.versionId ?? artifact.headVersionId ?? '',
                })
              : `Current · ${document?.versionId ?? artifact.headVersionId}`
            : t
              ? t('m_ef7b077e39')
              : 'Awaiting Library version',
        headVersionId: document?.versionId ?? artifact.headVersionId ?? null,
        promotedToBrandDocumentId: artifact.promotedToBrandDocumentId ?? null,
        updatedAt: artifact.updatedAt,
        markdown,
        document: structuredDocument,
        checklistItems: snapshot.checklistItems.filter((item) => item.artifactId === artifact.id),
        validations: snapshot.artifactValidations.filter(
          (validation) => validation.artifactId === artifact.id,
        ),
        workProducts: snapshot.workNodeResults.filter(
          (result) => result.artifactId === artifact.id,
        ),
        draftRevision: document?.editable ? snapshot.revision : null,
        canEdit: Boolean(document?.editable && markdown !== null && artifact.format === 'markdown'),
        alignmentLabel: alignment
          ? t
            ? t('m_066ae905e4', {
                status: labelFromId(alignment.status, t),
                count: alignment.criterionIds.length,
              })
            : `${labelFromId(alignment.status)} · ${alignment.criterionIds.length} criteria`
          : null,
      };
    }),
    participants,
    reviews: snapshot.requests
      .filter((request) => request.kind === 'review' && request.status === 'open')
      .map((request) => ({
        id: request.id,
        artifactId: request.blockedNodeRefs.find((ref) => ref.kind === 'artifact')?.id ?? null,
        title: request.prompt,
        reviewerName:
          request.targets[0]?.kind === 'actor'
            ? displayNameForActor(request.targets[0].actor)
            : request.targets[0]?.kind === 'capability'
              ? t
                ? goalControlLabel(request.targets[0].capability, t)
                : request.targets[0].capability
              : (request.targets[0]?.assignmentId ?? (t ? t('m_e57016edce') : 'Unassigned')),
        statusLabel: t ? localizeGoalCopy('Waiting', t) : 'Waiting',
        note: request.dueAt
          ? t
            ? t('m_13cb39aa93', {
                date: new Date(request.dueAt).toLocaleString(locale),
              })
            : `Due ${request.dueAt}`
          : null,
      })),
    inputRequests: snapshot.requests
      .filter((request) => request.status === 'open')
      .map((request) => {
        const targetUserIds = request.targets.flatMap((target) =>
          target.kind === 'actor' && target.actor.kind === 'human' ? [target.actor.userId] : [],
        );
        const deliveries = snapshot.chatDeliveries
          .filter((delivery) => delivery.requestId === request.id)
          .map((delivery) => projectGoalDelivery(delivery, t));
        const targetLabel = request.targets.map((target) =>
          target.kind === 'actor'
            ? displayNameForActor(target.actor)
            : target.kind === 'capability'
              ? labelFromId(target.capability, t)
              : t
                ? t('m_208fe88879', { id: target.assignmentId })
                : `Assignment ${target.assignmentId}`,
        );
        const joinedTargetLabel = new Intl.ListFormat(locale, {
          style: 'long',
          type: 'conjunction',
        }).format(targetLabel);
        return {
          id: request.id,
          kind: request.kind,
          title: request.prompt,
          requesterName: displayNameForActor(request.requestedBy),
          targetLabel: joinedTargetLabel,
          targetUserIds: [
            ...new Set([
              ...targetUserIds,
              ...deliveries.map((delivery) => delivery.recipientUserId),
            ]),
          ],
          responseUserIds: request.responses.flatMap((response) =>
            response.responder.kind === 'human' ? [response.responder.userId] : [],
          ),
          responseCount: request.responses.length,
          artifactId: request.blockedNodeRefs.find((ref) => ref.kind === 'artifact')?.id ?? null,
          dueAt: request.dueAt ?? null,
          deliveries,
          expectedResponse: request.expectedResponse,
          checklistItemIds: request.checklistItemIds,
        };
      }),
    activity: projectGoalActivity(events, t),
    workNodes: snapshot.workNodes,
    capabilityRoutes: snapshot.capabilityRoutes,
    supervisor: snapshot.supervisor ?? null,
    lastEventSequence: Math.max(snapshot.lastSeq, ...events.map((event) => event.seq), 0),
  };
}
