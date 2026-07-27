import type {
  CampaignArtifactDocument,
  CampaignArtifactDraftDocument,
  GoalActor,
  GoalArtifactValidation,
  GoalCapabilityRoute,
  GoalChecklistItem,
  GoalExpectedResponse,
  GoalRequestKind,
  GoalSupervisorProjection,
  GoalWorkNode,
  GoalWorkNodeResultRecord,
} from '@continuum/contracts';
import type { GoalDeliveryView } from './chatDelivery';

export type GoalStatusView = 'draft' | 'active' | 'blocked' | 'complete' | 'archived';

export type GoalSummaryView = {
  id: string;
  title: string;
  outcome: string;
  status: GoalStatusView;
  updatedAt: string;
  artifactCount: number;
  acceptedArtifactCount: number;
  pendingInputCount: number;
  accountableHumanName: string | null;
};

export type GoalArtifactStatusView =
  | 'draft'
  | 'in_review'
  | 'needs_changes'
  | 'accepted'
  | 'waived'
  | 'blocked';

export type GoalArtifactView = {
  id: string;
  title: string;
  kindLabel: string;
  status: GoalArtifactStatusView;
  dependsOnArtifactIds: string[];
  versionLabel: string;
  headVersionId: string | null;
  promotedToBrandDocumentId: string | null;
  updatedAt: string;
  markdown: string | null;
  document?: CampaignArtifactDocument | CampaignArtifactDraftDocument | null;
  checklistItems?: GoalChecklistItem[];
  validations?: GoalArtifactValidation[];
  workProducts?: GoalWorkNodeResultRecord[];
  draftRevision: number | null;
  canEdit: boolean;
  alignmentLabel: string | null;
};

export type GoalParticipantView = {
  id: string;
  actor: GoalActor;
  name: string;
  detail: string;
  initials: string;
  isAgent: boolean;
  statusLabel: string | null;
};

export type GoalReviewView = {
  id: string;
  artifactId: string | null;
  title: string;
  reviewerName: string;
  statusLabel: string;
  note: string | null;
};

export type GoalInputRequestView = {
  id: string;
  kind: GoalRequestKind;
  title: string;
  requesterName: string;
  targetLabel: string;
  targetUserIds: string[];
  responseUserIds: string[];
  responseCount: number;
  artifactId: string | null;
  dueAt: string | null;
  deliveries: GoalDeliveryView[];
  expectedResponse: GoalExpectedResponse;
  checklistItemIds?: string[];
};

export type GoalActivityView = {
  id: string;
  actorName: string;
  verb: string;
  subject: string;
  occurredAt: string;
  sequence: number;
};

export type GoalWorkspaceView = {
  id: string;
  brandId: string;
  kind: string;
  title: string;
  outcome: string;
  doneWhen: string[];
  status: GoalStatusView;
  updatedAt: string;
  accountableHumanName: string | null;
  artifacts: GoalArtifactView[];
  participants: GoalParticipantView[];
  reviews: GoalReviewView[];
  inputRequests: GoalInputRequestView[];
  activity: GoalActivityView[];
  workNodes: GoalWorkNode[];
  capabilityRoutes: GoalCapabilityRoute[];
  supervisor: GoalSupervisorProjection | null;
  lastEventSequence: number;
};

export function orderArtifactsForManifest(artifacts: GoalArtifactView[]): GoalArtifactView[] {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const ordered: GoalArtifactView[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (artifact: GoalArtifactView) => {
    if (visited.has(artifact.id)) return;
    if (visiting.has(artifact.id)) {
      visited.add(artifact.id);
      ordered.push(artifact);
      return;
    }

    visiting.add(artifact.id);
    for (const dependencyId of artifact.dependsOnArtifactIds) {
      const dependency = byId.get(dependencyId);
      if (dependency) visit(dependency);
    }
    visiting.delete(artifact.id);

    if (!visited.has(artifact.id)) {
      visited.add(artifact.id);
      ordered.push(artifact);
    }
  };

  for (const artifact of artifacts) visit(artifact);
  return ordered;
}

export function goalArtifactProgress(artifacts: GoalArtifactView[]): {
  accepted: number;
  total: number;
} {
  return {
    accepted: artifacts.filter(
      (artifact) => artifact.status === 'accepted' || artifact.status === 'waived',
    ).length,
    total: artifacts.length,
  };
}

export function initialsForParticipant(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return `${words[0]?.[0] ?? ''}${words.length > 1 ? (words.at(-1)?.[0] ?? '') : ''}`.toUpperCase();
}
