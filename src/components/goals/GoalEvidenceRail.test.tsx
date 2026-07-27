import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { GoalWorkspaceView } from '@/lib/goals/models';
import {
  buildStructuredGoalFormResponse,
  buildStructuredGoalResponse,
  GoalEvidenceRail,
} from './GoalEvidenceRail';

afterEach(cleanup);

const goal: GoalWorkspaceView = {
  id: 'goal_1',
  brandId: 'brand_1',
  title: 'Campaign launch',
  outcome: 'Ship the approved campaign.',
  doneWhen: [],
  status: 'active',
  updatedAt: '2026-07-26T12:00:00.000Z',
  accountableHumanName: 'Alex',
  artifacts: [],
  participants: [
    {
      id: 'human:user_1',
      actor: { kind: 'human', userId: 'user_1' },
      name: 'Alex',
      detail: 'Goal lead',
      initials: 'A',
      isAgent: false,
      statusLabel: null,
    },
  ],
  reviews: [],
  inputRequests: [
    {
      id: 'request_1',
      kind: 'clarification',
      title: 'Confirm the launch date',
      requesterName: 'Jaina',
      targetLabel: 'Alex',
      targetUserIds: ['user_1'],
      responseUserIds: [],
      responseCount: 0,
      artifactId: null,
      dueAt: null,
      deliveries: [
        {
          id: 'delivery_1',
          recipientUserId: 'user_1',
          platform: null,
          status: 'waiting_for_connection',
          label: 'In-app fallback',
          detail: 'No routable Slack or Teams identity. The request remains available here.',
          tone: 'warning',
          usesInAppFallback: true,
        },
      ],
      expectedResponse: { kind: 'text' },
    },
  ],
  activity: [],
  workNodes: [],
  capabilityRoutes: [],
  supervisor: null,
  lastEventSequence: 0,
};

describe('GoalEvidenceRail', () => {
  it('records money in integer minor units and approvals as explicit booleans', () => {
    expect(buildStructuredGoalResponse({ kind: 'money', currency: 'USD' }, '1250.75')).toEqual({
      response: 'USD 1250.75',
      structuredValue: { kind: 'money', amountMinor: 125075, currency: 'USD' },
    });
    expect(buildStructuredGoalResponse({ kind: 'approval' }, 'declined')).toEqual({
      response: 'Not approved',
      structuredValue: { kind: 'approval', approved: false },
    });
  });

  it('records a multi-field campaign response with typed field identities', () => {
    expect(
      buildStructuredGoalFormResponse(
        {
          kind: 'form',
          fields: [
            {
              id: 'budget',
              path: '/data/budget',
              label: 'Budget',
              required: true,
              input: { kind: 'money', currency: 'USD' },
            },
            {
              id: 'launch',
              path: '/data/launch',
              label: 'Launch approval',
              required: true,
              input: { kind: 'approval' },
            },
          ],
        },
        { budget: '1250.75', launch: 'approved' },
      ),
    ).toEqual({
      response: 'Completed 2 structured campaign input fields.',
      structuredValue: {
        kind: 'form',
        values: [
          {
            fieldId: 'budget',
            value: { kind: 'money', amountMinor: 125075, currency: 'USD' },
          },
          { fieldId: 'launch', value: { kind: 'approval', approved: true } },
        ],
      },
    });
  });

  it('opens and focuses a deep-linked request with its delivery fallback visible', async () => {
    const { getByText } = render(
      <GoalEvidenceRail
        goal={goal}
        currentUserId="user_1"
        focusedRequestId="request_1"
        onAskTeammate={mock(async () => true)}
        onRespondToRequest={mock(async () => true)}
        onRegisterEvidence={mock(async () => 'attachment_1')}
      />,
    );

    const requestTitle = await waitFor(() => getByText('Confirm the launch date'));
    expect(requestTitle.closest('li')?.className).toContain('ring-primary/40');
    expect(getByText('In-app fallback')).toBeTruthy();
    expect(getByText(/No routable Slack or Teams identity/)).toBeTruthy();
  });
});
