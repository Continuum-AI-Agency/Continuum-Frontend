import { beforeEach, describe, expect, it, mock } from 'bun:test';

const requestMock = mock(() => Promise.resolve({}));

mock.module('@/lib/api/http', () => ({
  http: {
    request: requestMock,
  },
}));

import {
  listChatConnections,
  revokeChatConnection,
  setPreferredChatConnection,
} from './chatConnections.client';

describe('chatConnections.client', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('uses the authenticated chat connection routes', async () => {
    await listChatConnections();
    await setPreferredChatConnection('brand/a', 'connection_1');
    await revokeChatConnection('connection/a');

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: '/api/chat/connections' }),
    );
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        path: '/api/chat/preferences/brand%2Fa',
        method: 'PUT',
        body: { connectionId: 'connection_1' },
      }),
    );
    expect(requestMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        path: '/api/chat/connections/connection%2Fa',
        method: 'DELETE',
      }),
    );
  });
});
