import {
  type ChatConnection,
  type ChatPlatform,
  chatConnectionSchema,
  chatPlatformSchema,
  type ListChatConnectionsResponse,
  listChatConnectionsResponseSchema,
} from '@continuum/contracts';

export {
  type ChatConnection,
  type ChatPlatform,
  chatConnectionSchema,
  chatPlatformSchema,
  type ListChatConnectionsResponse,
  listChatConnectionsResponseSchema,
};

export function orderChatConnections(
  connections: ChatConnection[],
  brandId: string,
): ChatConnection[] {
  return [...connections].sort((left, right) => {
    const leftPreferred = left.preferredBrandIds.includes(brandId);
    const rightPreferred = right.preferredBrandIds.includes(brandId);
    if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
    const leftRoutable = left.status === 'active' && Boolean(left.destination);
    const rightRoutable = right.status === 'active' && Boolean(right.destination);
    if (leftRoutable !== rightRoutable) return leftRoutable ? -1 : 1;
    return (left.displayName ?? left.handle ?? left.platformUserId).localeCompare(
      right.displayName ?? right.handle ?? right.platformUserId,
    );
  });
}
