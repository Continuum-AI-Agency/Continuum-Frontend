import { afterAll, afterEach, describe, expect, it, mock } from 'bun:test';
import type { PublishAccountCandidate } from '@continuum/contracts';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

// happy-dom never loads an image, and Base UI's AvatarImage renders only once one has loaded.
const RealImage = window.Image;
class LoadingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  naturalWidth = 0;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}
Object.assign(window, { Image: LoadingImage });

const ACCOUNT_ID = '88888888-8888-4888-8888-888888888888';
const DRAFT_ID = '33333333-3333-4333-8333-333333333333';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const accounts: PublishAccountCandidate[] = [
  {
    id: ACCOUNT_ID,
    platform: 'instagram',
    handle: 'brand',
    displayName: 'Brand Co',
    avatarUrl: 'https://cdn.test/brand.png',
    needsReauth: true,
    isDefault: true,
  },
];
const accountsHook = mock((_brandId?: string | null) => ({ accounts, isLoading: false }));
mock.module('@/lib/organic/publishTargets', () => ({ usePublishAccountsState: accountsHook }));

const { ToolApprovalCard } = await import('./ToolApprovalCard');

afterAll(() => {
  mock.restore();
  Object.assign(window, { Image: RealImage });
});

describe('ToolApprovalCard destination account', () => {
  afterEach(() => cleanup());

  it('shows where a publish posts, flags a dead connection, and never prints an id', async () => {
    const { container, getByText, getByRole } = render(
      <ToolApprovalCard
        brandId="brand-1"
        approval={{
          approvalId: 'a1',
          toolCallId: 'c1',
          toolName: 'publishDraft',
          input: {
            platform: 'instagram',
            account: '@brand',
            accountId: ACCOUNT_ID,
            draftId: DRAFT_ID,
            finalCaption: 'Hi',
          },
        }}
        onApproveAction={() => {}}
        onDenyAction={() => {}}
      />,
    );

    expect(accountsHook).toHaveBeenCalledWith('brand-1');
    const row = container.querySelector('[data-slot="approval-account"]') as HTMLElement;
    expect(row.dataset.accountReauth).toBe('true');
    await waitFor(() =>
      expect(row.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/brand.png'),
    );
    expect(getByText('@brand')).toBeTruthy();
    expect(getByText('instagram')).toBeTruthy();
    expect(row.textContent).toContain('Needs reconnecting');
    expect(getByRole('link', { name: 'Reconnect' }).getAttribute('href')).toBe(
      '/settings?section=integrations',
    );
    expect(getByText('Hi')).toBeTruthy();

    // The hover summary is the raw tool input: its ids are redacted too.
    const trigger = row.closest('[data-slot="hover-card-trigger"]') as HTMLElement;
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseMove(trigger);
    await waitFor(() => expect(document.body.querySelector('pre')).toBeTruthy(), {
      timeout: 2_000,
    });
    expect(document.body.querySelector('pre')?.textContent).toContain('"draftId": "…"');
    expect(document.body.textContent).not.toMatch(UUID);
  });
});
