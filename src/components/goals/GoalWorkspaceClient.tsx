'use client';

import { useState } from 'react';
import { ErrorRetryState } from '@/components/shared/state/ErrorRetryState';
import { useToast } from '@/components/ui/ToastProvider';
import { useGoalWorkspace } from '@/hooks/useGoalWorkspace';
import {
  registerGoalEvidenceAttachment,
  sendGoalCommand,
  upsertGoalCapabilityRoute,
} from '@/lib/api/goals.client';
import type { GoalFocus } from '@/lib/goals/focus';
import { saveGoalArtifactMarkdown } from '@/lib/goals/saveGoalArtifactMarkdown';
import { GoalWorkspace } from './GoalWorkspace';
import { GoalWorkspaceSkeleton } from './GoalWorkspaceSkeleton';

type GoalWorkspaceClientProps = {
  goalId: string;
  brandId: string;
  userId: string;
  focus: GoalFocus | null;
};

export function GoalWorkspaceClient({ goalId, brandId, userId, focus }: GoalWorkspaceClientProps) {
  const query = useGoalWorkspace(goalId);
  const { show } = useToast();
  const [isSavingArtifact, setIsSavingArtifact] = useState(false);
  const [saveArtifactError, setSaveArtifactError] = useState<string | null>(null);

  if (query.isLoading) return <GoalWorkspaceSkeleton />;

  if (query.isError || !query.data) {
    return (
      <div className="flex h-[var(--app-content-h)] items-center justify-center">
        <ErrorRetryState
          title="This Goal case file is unavailable"
          message={
            query.error instanceof Error
              ? query.error.message
              : 'The Goal may have moved, or you may no longer have access.'
          }
          retryLabel="Reload case file"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  return (
    <GoalWorkspace
      goal={query.data.view}
      currentUserId={userId}
      focus={focus}
      isSavingArtifact={isSavingArtifact}
      saveArtifactError={saveArtifactError}
      onRefresh={() => void query.refetch()}
      onAskTeammate={async ({ targetUserId, prompt }) => {
        try {
          const now = new Date().toISOString();
          await sendGoalCommand(goalId, {
            commandId: crypto.randomUUID(),
            expectedRevision: query.data.snapshot.revision,
            type: 'request.create',
            payload: {
              request: {
                id: crypto.randomUUID(),
                goalId,
                kind: 'clarification',
                prompt,
                requestedBy: { kind: 'human', userId },
                targets: [{ kind: 'actor', actor: { kind: 'human', userId: targetUserId } }],
                resolutionPolicy: { kind: 'first_response' },
                expectedResponse: { kind: 'text' },
                status: 'open',
                blockedNodeRefs: [],
                checklistItemIds: [],
                responses: [],
                createdAt: now,
              },
            },
          });
          await query.refetch();
          show({
            title: 'Input requested',
            description: 'The request is now part of the shared Goal record.',
            variant: 'success',
          });
          return true;
        } catch (error) {
          show({
            title: 'Could not request input',
            description: error instanceof Error ? error.message : 'Please refresh and try again.',
            variant: 'error',
          });
          return false;
        }
      }}
      onRegisterEvidence={async (input) => {
        try {
          const result = await registerGoalEvidenceAttachment(goalId, input);
          return result.attachment.id;
        } catch (error) {
          show({
            title: 'Could not secure evidence',
            description: error instanceof Error ? error.message : 'Please refresh and try again.',
            variant: 'error',
          });
          return null;
        }
      }}
      onRespondToRequest={async ({
        requestId,
        response,
        structuredValue,
        evidenceAttachmentIds,
      }) => {
        try {
          await sendGoalCommand(goalId, {
            commandId: crypto.randomUUID(),
            expectedRevision: query.data.snapshot.revision,
            type: 'request.respond',
            payload: {
              requestId,
              response: {
                id: crypto.randomUUID(),
                requestId,
                responder: { kind: 'human', userId },
                response,
                evidenceIds: [],
                evidenceAttachmentIds,
                structuredValue,
                createdAt: new Date().toISOString(),
              },
            },
          });
          await query.refetch();
          show({
            title: 'Response shared',
            description: 'Your input is recorded in the Goal evidence trail.',
            variant: 'success',
          });
          return true;
        } catch (error) {
          show({
            title: 'Could not share response',
            description: error instanceof Error ? error.message : 'Please refresh and try again.',
            variant: 'error',
          });
          return false;
        }
      }}
      onArtifactAction={async ({ artifactId, versionId, action }) => {
        try {
          const command =
            action === 'accept'
              ? {
                  commandId: crypto.randomUUID(),
                  expectedRevision: query.data.snapshot.revision,
                  type: 'artifact.accept' as const,
                  payload: { artifactId, acceptedVersionId: versionId },
                }
              : action === 'promote'
                ? {
                    commandId: crypto.randomUUID(),
                    expectedRevision: query.data.snapshot.revision,
                    type: 'artifact.promote' as const,
                    payload: { artifactId, category: 'campaign_deliverable' as const },
                  }
                : {
                    commandId: crypto.randomUUID(),
                    expectedRevision: query.data.snapshot.revision,
                    type: 'artifact.review' as const,
                    payload: {
                      artifactId,
                      versionId,
                      decision:
                        action === 'approve'
                          ? ('approved' as const)
                          : ('changes_requested' as const),
                    },
                  };
          await sendGoalCommand(goalId, command);
          await query.refetch();
          show({
            title:
              action === 'promote'
                ? 'Promoted to Brand Knowledge'
                : action === 'accept'
                  ? 'Artifact accepted'
                  : action === 'approve'
                    ? 'Version approved'
                    : 'Changes requested',
            variant: 'success',
          });
        } catch (error) {
          show({
            title: 'Goal action failed',
            description: error instanceof Error ? error.message : 'Please refresh and try again.',
            variant: 'error',
          });
        }
      }}
      onSaveCapabilityRoute={async (input) => {
        try {
          await upsertGoalCapabilityRoute(goalId, input);
          await query.refetch();
          show({
            title: 'Stakeholder route saved',
            description:
              input.scope === 'brand'
                ? 'This capability is now the brand default.'
                : 'This Goal now uses the selected stakeholder route.',
            variant: 'success',
          });
          return true;
        } catch (error) {
          show({
            title: 'Could not save stakeholder route',
            description: error instanceof Error ? error.message : 'Please refresh and try again.',
            variant: 'error',
          });
          return false;
        }
      }}
      onSaveArtifact={async ({ artifactId, markdown, expectedRevision }) => {
        const artifact = query.data.snapshot.artifacts.find((item) => item.id === artifactId);
        const document = query.data.snapshot.artifactDocuments.find(
          (item) => item.artifactId === artifactId,
        );
        if (!artifact || !document) {
          setSaveArtifactError(
            'The selected artifact no longer has an editable Library document. Refresh the case file and try again.',
          );
          return false;
        }

        setIsSavingArtifact(true);
        setSaveArtifactError(null);
        try {
          const result = await saveGoalArtifactMarkdown({
            brandId,
            goalId,
            userId,
            expectedRevision,
            artifact,
            document,
            markdown,
          });
          await query.refetch();
          show({
            title: 'Draft saved',
            description: `Library version ${result.versionId} is now the Goal artifact head.`,
            variant: 'success',
          });
          return true;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'The artifact draft could not be saved.';
          setSaveArtifactError(message);
          return false;
        } finally {
          setIsSavingArtifact(false);
        }
      }}
    />
  );
}
