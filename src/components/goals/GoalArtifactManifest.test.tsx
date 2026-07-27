import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { GoalWorkspaceView } from '@/lib/goals/models';
import { GoalArtifactManifest } from './GoalArtifactManifest';

afterEach(cleanup);

const goal: GoalWorkspaceView = {
  id: 'goal-1',
  brandId: 'brand-1',
  title: 'Launch evidence case',
  outcome: 'Approve an evidence-backed launch plan.',
  doneWhen: ['Strategy accepted', 'Measurement plan accepted'],
  status: 'active',
  updatedAt: '2026-07-26T00:00:00.000Z',
  accountableHumanName: 'Alex Morgan',
  artifacts: [
    {
      id: 'measurement',
      title: 'Measurement plan',
      kindLabel: 'Plan',
      status: 'in_review',
      dependsOnArtifactIds: ['strategy'],
      versionLabel: 'v2',
      headVersionId: 'version-2',
      promotedToBrandDocumentId: null,
      updatedAt: '2026-07-26T00:00:00.000Z',
      markdown: '# Measurement',
      draftRevision: 2,
      canEdit: true,
      alignmentLabel: 'Aligned to 2 criteria',
    },
    {
      id: 'strategy',
      title: 'Strategy brief',
      kindLabel: 'Brief',
      status: 'accepted',
      dependsOnArtifactIds: [],
      versionLabel: 'v3',
      headVersionId: 'version-3',
      promotedToBrandDocumentId: null,
      updatedAt: '2026-07-25T00:00:00.000Z',
      markdown: '# Strategy',
      draftRevision: null,
      canEdit: false,
      alignmentLabel: 'Accepted evidence',
    },
  ],
  participants: [],
  reviews: [],
  inputRequests: [],
  activity: [],
  workNodes: [],
  capabilityRoutes: [],
  supervisor: null,
  lastEventSequence: 0,
};

describe('GoalArtifactManifest', () => {
  it('renders the dependency before the artifact that consumes it', () => {
    const { getAllByRole } = render(
      <GoalArtifactManifest
        goal={goal}
        selectedArtifactId="strategy"
        onSelectArtifact={() => {}}
      />,
    );

    const artifactButtons = getAllByRole('button');
    expect(artifactButtons[0]?.textContent).toContain('Strategy brief');
    expect(artifactButtons[1]?.textContent).toContain('Measurement plan');
    expect(artifactButtons[1]?.textContent).toContain('Depends on Strategy brief');
  });

  it('selects the exact artifact row', () => {
    const onSelectArtifact = mock(() => {});
    const { getByRole } = render(
      <GoalArtifactManifest
        goal={goal}
        selectedArtifactId="strategy"
        onSelectArtifact={onSelectArtifact}
      />,
    );

    fireEvent.click(getByRole('button', { name: /Measurement plan/ }));
    expect(onSelectArtifact).toHaveBeenCalledWith('measurement');
  });
});
