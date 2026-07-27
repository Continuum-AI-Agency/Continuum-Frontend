import { describe, expect, it } from 'bun:test';
import type { ChatConnection } from './connections';
import { orderChatConnections } from './connections';

function connection(
  id: string,
  options: { preferred?: boolean; routable?: boolean; name?: string } = {},
): ChatConnection {
  return {
    id: `00000000-0000-4000-8000-00000000000${id === 'broken' ? '1' : id === 'ready' ? '2' : '3'}`,
    userId: '00000000-0000-4000-8000-000000000010',
    platform: 'slack',
    workspaceId: `workspace_${id}`,
    platformUserId: `platform_${id}`,
    displayName: options.name ?? id,
    status: 'active',
    destination: options.routable === false ? undefined : { threadId: `thread_${id}` },
    preferredBrandIds: options.preferred ? ['00000000-0000-4000-8000-000000000020'] : [],
    lastVerifiedAt: '2026-07-26T12:00:00.000Z',
    createdAt: '2026-07-26T12:00:00.000Z',
    updatedAt: '2026-07-26T12:00:00.000Z',
  };
}

describe('orderChatConnections', () => {
  it('puts the brand preference first, then routable identities', () => {
    const result = orderChatConnections(
      [
        connection('broken', { routable: false }),
        connection('ready'),
        connection('preferred', { preferred: true }),
      ],
      '00000000-0000-4000-8000-000000000020',
    );

    expect(result.map((item) => item.displayName)).toEqual(['preferred', 'ready', 'broken']);
  });
});
