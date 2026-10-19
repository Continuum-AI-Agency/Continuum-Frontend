import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  CHAT_MEDIA_SIGN_ROUTE,
  type ChatMediaSignRequest,
  chatMediaRefKey,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { AgentMentionSuggestion } from '@/lib/agent-references';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

let round = 0;
const requestMock = mock(async (args: { path: string; body?: unknown }) => {
  round += 1;
  const { refs } = args.body as ChatMediaSignRequest;
  return {
    items: refs.map((ref) => ({
      key: chatMediaRefKey(ref),
      thumbUrl:
        ref.type === 'draft' && ref.draftId === 'no-media'
          ? null
          : `https://storage.test/${chatMediaRefKey(ref)}?v=${round}`,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })),
  };
});
mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));

const { DraftTrayPreview } = await import('./DraftTrayPreview');
const { SessionContentTray } = await import('@/components/chat/SessionContentTray');
const { resetChatMediaSignCache } = await import('@/lib/media/chatMediaRefs');

const draft = (draftId: string): AgentMentionSuggestion => ({
  key: `draft:${draftId}`,
  label: `Draft ${draftId}`,
  type: 'draft',
  source: 'organic',
  reference: { id: draftId, type: 'draft', label: `Draft ${draftId}`, source: 'organic' },
  // What a restored session carried: a URL that lapsed long ago. The tray must not use it.
  preview: { url: `https://storage.test/stale-${draftId}.png`, kind: 'image' },
});

afterAll(() => mock.restore());
beforeEach(() => {
  resetChatMediaSignCache();
  requestMock.mockClear();
  round = 0;
});
afterEach(() => cleanup());

describe('session tray draft stills', () => {
  it('signs every draft the tray opens with in one POST, and shows ≤480 px stills, not saved URLs', async () => {
    const items = [draft('d1'), draft('d2'), draft('no-media')];
    const { getByRole } = render(
      <SessionContentTray
        items={items}
        onInsert={() => {}}
        renderPreview={(item) => <DraftTrayPreview brandId="brand-1" item={item} />}
      />,
    );
    getByRole('button', { name: 'Content generated in this session' }).click();
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(2));
    const signs = requestMock.mock.calls.filter(([args]) => args.path === CHAT_MEDIA_SIGN_ROUTE);
    expect(signs).toHaveLength(1);
    expect((signs[0]?.[0].body as ChatMediaSignRequest).refs).toEqual([
      { type: 'draft', draftId: 'd1' },
      { type: 'draft', draftId: 'd2' },
      { type: 'draft', draftId: 'no-media' },
    ]);
    const srcs = [...document.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');
    expect(srcs.some((src) => src.includes('stale-'))).toBe(false);
  });

  it('re-signs a tray still that fails to load instead of leaving it broken', async () => {
    const { getByRole } = render(
      <SessionContentTray
        items={[draft('d1')]}
        onInsert={() => {}}
        renderPreview={(item) => <DraftTrayPreview brandId="brand-1" item={item} />}
      />,
    );
    getByRole('button', { name: 'Content generated in this session' }).click();
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    await waitFor(() =>
      expect(document.querySelector('img')?.getAttribute('src')).toBe(
        'https://storage.test/draft:d1?v=2',
      ),
    );
    const signs = requestMock.mock.calls.filter(([args]) => args.path === CHAT_MEDIA_SIGN_ROUTE);
    expect(signs).toHaveLength(2);
  });
});
