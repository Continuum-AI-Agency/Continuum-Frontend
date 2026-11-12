'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorRetryState } from '@/components/shared/state/ErrorRetryState';
import { useToast } from '@/components/ui/ToastProvider';
import { useGoalWorkspace } from '@/hooks/useGoalWorkspace';
import { useUiErrorMessage } from '@/i18n/errors';
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
  const getUiErrorMessage = useUiErrorMessage();

  const uiText = useTranslations('dashboard');
  const query = useGoalWorkspace(goalId, uiText, useLocale());
  const { show } = useToast();
  const [isSavingArtifact, setIsSavingArtifact] = useState(false);
  const [saveArtifactError, setSaveArtifactError] = useState<string | null>(null);

  if (query.isLoading) return <GoalWorkspaceSkeleton />;

  if (query.isError || !query.data) {
    return (
      <div className="flex h-[var(--app-content-h)] items-center justify-center">
        <ErrorRetryState
          title={uiText('this_goal_case_file_is_unavailable_879294d')}
          message={getUiErrorMessage(query.error)}
          retryLabel={uiText('m_b9890d2441')}
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
            title: uiText('input_requested_7a0ad98'),
            description: uiText('the_request_is_now_part_of_the_shared_goal_re_2fed887'),
            variant: 'success',
          });
          return true;
        } catch (error) {
          show({
            title: uiText('could_not_request_input_9e01c2d'),
            description: getUiErrorMessage(error),
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
            title: uiText('could_not_secure_evidence_c0ada24'),
            description: getUiErrorMessage(error),
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
            title: uiText('response_shared_da9a6e0'),
            description: uiText('your_input_is_recorded_in_the_goal_evidence_t_3522696'),
            variant: 'success',
          });
          return true;
        } catch (error) {
          show({
            title: uiText('could_not_share_response_c01a924'),
            description: getUiErrorMessage(error),
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
                ? uiText('m_4028a7c930')
                : action === 'accept'
                  ? uiText('m_89c939053e')
                  : action === 'approve'
                    ? uiText('m_2009e81c92')
                    : uiText('m_9be16685dc'),
            variant: 'success',
          });
        } catch (error) {
          show({
            title: uiText('goal_action_failed_3bfe5bb'),
            description: getUiErrorMessage(error),
            variant: 'error',
          });
        }
      }}
      onSaveCapabilityRoute={async (input) => {
        try {
          await upsertGoalCapabilityRoute(goalId, input);
          await query.refetch();
          show({
            title: uiText('stakeholder_route_saved_c450a69'),
            description: input.scope === 'brand' ? uiText('m_53aad8a27d') : uiText('m_2ea7fd0b21'),
            variant: 'success',
          });
          return true;
        } catch (error) {
          show({
            title: uiText('could_not_save_stakeholder_route_9279540'),
            description: getUiErrorMessage(error),
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
            title: uiText('draft_saved_5ccb8ca'),
            description: uiText('m_4b4c5bbf01', { v0: String(result.versionId) }),
            variant: 'success',
          });
          return true;
        } catch (error) {
          const message = getUiErrorMessage(error);
          setSaveArtifactError(message);
          return false;
        } finally {
          setIsSavingArtifact(false);
        }
      }}
    />
  );
}
