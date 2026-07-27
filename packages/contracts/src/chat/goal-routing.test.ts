import { describe, expect, it } from 'bun:test';
import {
  chatConnectionSchema,
  goalChatDeliverySchema,
  listChatConnectionsResponseSchema,
} from './goal-routing';

const now = '2026-07-26T10:00:00.000Z';

describe('Goal chat routing contracts', () => {
  it('parses exact connection management payloads', () => {
    const connection = chatConnectionSchema.parse({
      id: '11111111-1111-4111-a111-111111111111',
      userId: '22222222-2222-4222-a222-222222222222',
      platform: 'teams',
      workspaceId: 'tenant-1',
      platformUserId: '29:user-1',
      status: 'active',
      destination: { threadId: 'teams:conversation-1' },
      preferredBrandIds: ['33333333-3333-4333-a333-333333333333'],
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect(
      listChatConnectionsResponseSchema.parse({ connections: [connection] }).connections,
    ).toHaveLength(1);
  });

  it('keeps provider correlation IDs out of the public Goal projection', () => {
    expect(() =>
      goalChatDeliverySchema.parse({
        id: '11111111-1111-4111-a111-111111111111',
        requestId: 'request-1',
        recipientUserId: '22222222-2222-4222-a222-222222222222',
        platform: 'slack',
        status: 'delivered',
        createdAt: now,
        updatedAt: now,
        providerMessageId: 'private-provider-id',
      }),
    ).toThrow();
  });
});
