import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { ToastProvider } from '@/components/ui/ToastProvider';
import type { GoalArtifactView, GoalWorkspaceView } from '@/lib/goals/models';
import { GoalWorkspace } from './GoalWorkspace';

afterEach(cleanup);

function artifact(id: string, title: string): GoalArtifactView {
  return {
    id,
    title,
    kindLabel: 'Brief',
    status: 'draft',
    dependsOnArtifactIds: [],
    versionLabel: 'Current · v1',
    headVersionId: 'v1',
    promotedToBrandDocumentId: null,
    updatedAt: '2026-07-26T12:00:00.000Z',
    markdown: `# ${title}`,
    draftRevision: 1,
    canEdit: true,
    alignmentLabel: null,
  };
}

const goal: GoalWorkspaceView = {
  id: 'goal_1',
  brandId: 'brand_1',
  title: 'Campaign launch',
  outcome: 'Ship the approved campaign.',
  doneWhen: [],
  status: 'active',
  updatedAt: '2026-07-26T12:00:00.000Z',
  accountableHumanName: 'Alex',
  artifacts: [artifact('artifact_1', 'First brief'), artifact('artifact_2', 'Focused brief')],
  participants: [],
  reviews: [],
  inputRequests: [],
  activity: [],
  workNodes: [],
  capabilityRoutes: [],
  supervisor: null,
  lastEventSequence: 0,
};

describe('GoalWorkspace focus', () => {
  it('selects the exact artifact from a deep link', () => {
    const { getAllByRole, queryByRole } = render(
      <ToastProvider>
        <GoalWorkspace
          goal={goal}
          currentUserId="user_1"
          focus={{ kind: 'artifact', id: 'artifact_2' }}
          isSavingArtifact={false}
          saveArtifactError={null}
          onRefresh={() => {}}
          onAskTeammate={mock(async () => true)}
          onRespondToRequest={mock(async () => true)}
          onRegisterEvidence={mock(async () => 'attachment_1')}
          onSaveArtifact={mock(async () => true)}
          onArtifactAction={mock(async () => {})}
          onSaveCapabilityRoute={mock(async () => true)}
        />
      </ToastProvider>,
    );

    expect(getAllByRole('heading', { name: 'Focused brief' })).toHaveLength(2);
    expect(queryByRole('heading', { name: 'First brief' })).toBeNull();
  });
});
