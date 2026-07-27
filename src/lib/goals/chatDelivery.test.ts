import { describe, expect, it } from 'bun:test';
import { projectGoalDelivery } from './chatDelivery';

describe('projectGoalDelivery', () => {
  it('makes a missing chat route an explicit in-app fallback', () => {
    expect(
      projectGoalDelivery({
        id: '00000000-0000-4000-8000-000000000001',
        requestId: 'request_1',
        recipientUserId: '00000000-0000-4000-8000-000000000002',
        status: 'waiting_for_connection',
        createdAt: '2026-07-26T12:00:00.000Z',
        updatedAt: '2026-07-26T12:00:00.000Z',
      }),
    ).toMatchObject({
      label: 'In-app fallback',
      tone: 'warning',
      usesInAppFallback: true,
    });
  });

  it('retains a safe failure summary after retries are exhausted', () => {
    expect(
      projectGoalDelivery({
        id: '00000000-0000-4000-8000-000000000003',
        requestId: 'request_1',
        recipientUserId: '00000000-0000-4000-8000-000000000002',
        platform: 'teams',
        status: 'failed',
        createdAt: '2026-07-26T12:00:00.000Z',
        updatedAt: '2026-07-26T12:00:00.000Z',
        failedAt: '2026-07-26T12:05:00.000Z',
        failureSummary: 'Tenant route rejected the recipient.',
      }),
    ).toMatchObject({
      label: 'In-app fallback',
      detail: 'Tenant route rejected the recipient.',
      tone: 'danger',
      usesInAppFallback: true,
    });
  });
});
