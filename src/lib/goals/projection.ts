import type {
  GoalActor,
  GoalArtifact,
  GoalEvent,
  GoalStatus,
  GoalSummary,
} from '@continuum/contracts';
import { parseGoalArtifactMarkdown } from '@continuum/contracts';
import { type GoalSnapshotWithChatDeliveries, projectGoalDelivery } from './chatDelivery';
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

function labelFromId(value: string): string {
  const normalized = value.replace(/[-_]+/g, ' ').trim();
  return normalized.length > 0
    ? normalized.replace(/\b\w/g, (character) => character.toUpperCase())
    : 'Artifact';
}

function actorName(actor: GoalActor): string {
  return actor.kind === 'agent' ? actor.agent : actor.userId;
}

function participantFromActor(actor: GoalActor, detail: string): GoalParticipantView {
  const name = actorName(actor);
  return {
    id: actor.kind === 'agent' ? `agent:${actor.agent}` : `human:${actor.userId}`,
    actor,
    name,
    detail,
    initials: initialsForParticipant(name),
    isAgent: actor.kind === 'agent',
    statusLabel: actor.kind === 'agent' ? 'Agent' : null,
  };
}

function uniqueParticipants(snapshot: GoalSnapshotWithChatDeliveries): GoalParticipantView[] {
  const participants = new Map<string, GoalParticipantView>();
  const add = (participant: GoalParticipantView) => {
    if (!participants.has(participant.id)) participants.set(participant.id, participant);
  };

  for (const participant of snapshot.participants) {
    const projected = participantFromActor(participant.actor, participant.detail ?? 'Goal member');
    add({
      ...projected,
      name: participant.displayName,
      initials: initialsForParticipant(participant.displayName),
    });
  }
  add(participantFromActor(snapshot.goal.createdBy, 'Goal creator'));
  if (snapshot.goal.facilitator) {
    add(participantFromActor(snapshot.goal.facilitator, 'Accountable facilitator'));
  }
  for (const assignment of snapshot.assignments) {
    if (assignment.assignee) {
      add(
        participantFromActor(
          assignment.assignee,
          `${labelFromId(assignment.responsibility)} · ${assignment.title}`,
        ),
      );
    }
  }
  return [...participants.values()];
}

function eventSubject(event: GoalEvent): string {
  switch (event.type) {
    case 'goal.created':
      return event.data.goal.title;
    case 'goal.updated':
      return 'the Goal charter';
    case 'goal.activated':
      return 'the Goal';
    case 'goal.completed':
      return 'the Goal';
    case 'plan.proposed':
      return event.data.plan.summary;
    case 'plan.activated':
      return `plan v${event.data.planVersion}`;
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

function eventVerb(type: GoalEvent['type']): string {
  return type.replaceAll('.', ' ');
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

export function projectGoalActivity(events: GoalEvent[]): GoalActivityView[] {
  return [...events]
    .sort((left, right) => right.seq - left.seq)
    .map((event) => ({
      id: event.eventId,
      actorName: actorName(event.actor),
      verb: eventVerb(event.type),
      subject: eventSubject(event),
      occurredAt: event.ts,
      sequence: event.seq,
    }));
}

export function projectGoalWorkspace(
  snapshot: GoalSnapshotWithChatDeliveries,
  events: GoalEvent[],
): GoalWorkspaceView {
  const alignmentsByArtifact = new Map(
    snapshot.alignments
      .filter((alignment) => alignment.subject.kind === 'artifact')
      .map((alignment) => [alignment.subject.id, alignment]),
  );
  const participants = uniqueParticipants(snapshot);
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
        kindLabel: labelFromId(artifact.artifactType),
        status: artifactStatusView(artifact.status),
        dependsOnArtifactIds: artifact.dependencyIds,
        versionLabel: artifact.acceptedVersionId
          ? `Accepted · ${artifact.acceptedVersionId}`
          : document?.versionId || artifact.headVersionId
            ? `Current · ${document?.versionId ?? artifact.headVersionId}`
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
          ? `${labelFromId(alignment.status)} · ${alignment.criterionIds.length} criteria`
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
              ? request.targets[0].capability
              : (request.targets[0]?.assignmentId ?? 'Unassigned'),
        statusLabel: 'Waiting',
        note: request.dueAt ? `Due ${request.dueAt}` : null,
      })),
    inputRequests: snapshot.requests
      .filter((request) => request.status === 'open')
      .map((request) => {
        const targetUserIds = request.targets.flatMap((target) =>
          target.kind === 'actor' && target.actor.kind === 'human' ? [target.actor.userId] : [],
        );
        const deliveries = snapshot.chatDeliveries
          .filter((delivery) => delivery.requestId === request.id)
          .map(projectGoalDelivery);
        const targetLabel = request.targets
          .map((target) =>
            target.kind === 'actor'
              ? displayNameForActor(target.actor)
              : target.kind === 'capability'
                ? labelFromId(target.capability)
                : `Assignment ${target.assignmentId}`,
          )
          .join(', ');
        return {
          id: request.id,
          kind: request.kind,
          title: request.prompt,
          requesterName: displayNameForActor(request.requestedBy),
          targetLabel,
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
    activity: projectGoalActivity(events),
    workNodes: snapshot.workNodes,
    capabilityRoutes: snapshot.capabilityRoutes,
    supervisor: snapshot.supervisor ?? null,
    lastEventSequence: Math.max(snapshot.lastSeq, ...events.map((event) => event.seq), 0),
  };
}
