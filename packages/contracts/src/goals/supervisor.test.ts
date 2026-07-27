import { describe, expect, it } from 'bun:test';
import {
  goalCapabilityRouteSchema,
  goalChildRunIdentitySchema,
  goalEvidenceAttachmentSchema,
  goalExecutionRefSchema,
  goalStructuredResponseValueSchema,
  goalWorkNodeSchema,
  projectGoalSupervisor,
} from '../index';

const NOW = '2026-07-26T12:00:00.000Z';

const node = (
  id: string,
  status: Parameters<typeof goalWorkNodeSchema.parse>[0] extends infer _ ? string : never,
  dependencyIds: string[] = [],
) =>
  goalWorkNodeSchema.parse({
    id,
    goalId: 'goal_1',
    planId: 'plan_1',
    workstreamId: `workstream_${id}`,
    title: id,
    objective: `Complete ${id}`,
    purpose: 'goal_work',
    executor: { kind: 'jaina' },
    status,
    dependencyIds,
    producedArtifactIds: [],
    priority: 50,
    attempt: 0,
    maxAttempts: 5,
    createdAt: NOW,
    updatedAt: NOW,
  });

describe('Goal supervisor contracts', () => {
  it('projects only dependency-satisfied branches as executable', () => {
    const projection = projectGoalSupervisor({
      goalId: 'goal_1',
      nodes: [
        node('research', 'completed'),
        node('creative', 'waiting_for_input', ['research']),
        node('budget', 'waiting_for_input'),
        node('launch', 'pending', ['creative', 'budget']),
        node('measurement', 'pending', ['research']),
      ],
      openRequestNodeIds: new Set(['creative', 'budget']),
      now: NOW,
    });

    expect(projection.readyNodeIds).toEqual(['measurement']);
    expect(projection.waitingNodeIds).toEqual(['creative', 'budget']);
    expect(projection.blockedNodeIds).toEqual(['launch']);
    expect(projection.portfolioStatus).toBe('waiting_on_teammate');
  });

  it('keeps session identity optional and bounded retry metadata public', () => {
    const parsed = node('audience', 'ready');
    expect(parsed.sessionId).toBeUndefined();
    expect(parsed.maxAttempts).toBe(5);
    expect(parsed.executor).toEqual({ kind: 'jaina' });
  });

  it('makes Goal, work-node, and harness IDs authoritative over the child session', () => {
    const execution = goalExecutionRefSchema.parse({
      goalId: 'goal_1',
      workNodeId: 'node_1',
      harnessRunId: 'harness_1',
    });
    const child = goalChildRunIdentitySchema.parse({
      ...execution,
      runId: 'run_1',
      sessionId: 'goal_turn_1',
      parentRunId: 'run_parent',
      requestId: 'request_1',
      wakeupId: '11111111-1111-4111-8111-111111111111',
    });

    expect(child).toEqual(
      expect.objectContaining({
        goalId: 'goal_1',
        workNodeId: 'node_1',
        harnessRunId: 'harness_1',
        sessionId: 'goal_turn_1',
      }),
    );
  });

  it('parses exact primary, backup, escalation, and risk-tiered SLAs', () => {
    const route = goalCapabilityRouteSchema.parse({
      id: 'route_1',
      brandId: 'brand_1',
      capability: 'budget_authority',
      primaryUserId: '11111111-1111-4111-8111-111111111111',
      backupUserId: '22222222-2222-4222-8222-222222222222',
      escalationUserId: '33333333-3333-4333-8333-333333333333',
      slaHours: {
        approval: 4,
        decision: 12,
        review: 12,
        clarification: 24,
        evidence: 24,
        handoff: 24,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(route.slaHours.approval).toBe(4);
    expect(route.backupUserId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('represents money without floating-point ambiguity', () => {
    expect(
      goalStructuredResponseValueSchema.parse({
        kind: 'money',
        amountMinor: 250_000,
        currency: 'USD',
      }),
    ).toEqual({ kind: 'money', amountMinor: 250_000, currency: 'USD' });
  });

  it('exposes evidence metadata without storage paths or signed URLs', () => {
    const attachment = goalEvidenceAttachmentSchema.parse({
      id: 'attachment_1',
      goalId: 'goal_1',
      requestId: 'request_1',
      filename: 'budget.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4_096,
      sha256: 'a'.repeat(64),
      capturedBy: { kind: 'human', userId: 'user_1' },
      capturedAt: NOW,
    });

    expect(attachment).not.toHaveProperty('storagePath');
    expect(attachment).not.toHaveProperty('signedUrl');
  });
});
