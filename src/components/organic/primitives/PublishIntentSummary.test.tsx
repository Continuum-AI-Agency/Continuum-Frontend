import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import {
  intentAccountName,
  PublishIntentSummary,
  type PublishIntentSummaryData,
  PublishTargetsSummary,
} from './PublishIntentSummary';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

afterEach(cleanup);

const intent = (overrides: Partial<PublishIntentSummaryData> = {}): PublishIntentSummaryData => ({
  platform: 'instagram',
  blockers: [],
  format: 'POST',
  account: { id: 'acct-1', handle: 'acme_a', displayName: 'Acme A', avatarUrl: null },
  caption: { length: 5, preview: 'Hello' },
  media: { count: 1, required: 1 },
  ...overrides,
});

describe('intentAccountName — the account is never a UUID', () => {
  it('names the account by its handle', () => {
    expect(intentAccountName({ id: 'acct-1', handle: 'acme_a', displayName: 'Acme A' })).toBe(
      '@acme_a',
    );
  });

  it('names a Page by its name', () => {
    expect(intentAccountName({ id: 'page-1', handle: null, displayName: 'Acme Page' })).toBe(
      'Acme Page',
    );
  });

  it('says "Unknown account" for a stamp the server could not describe', () => {
    expect(intentAccountName({ id: '6f1c0b9e-0000-4000-8000-000000000000' })).toBe(
      'Unknown account',
    );
  });

  it('says no account is selected when the server addresses none', () => {
    expect(intentAccountName({ id: null })).toBe('No account selected');
  });
});

describe('PublishIntentSummary — one target row', () => {
  it('shows the platform, the account handle and the caption start in the contract slots', () => {
    const { container } = render(<PublishIntentSummary intent={intent()} />);
    const row = container.querySelector('[data-publish-target="instagram"]');
    expect(row).not.toBeNull();
    // The name alone: the avatar's initial is decoration, hidden from assistive tech.
    expect(row?.querySelector('[data-publish-account-name]')?.textContent).toBe('@acme_a');
    expect(
      row?.querySelector('[data-publish-account] [aria-hidden="true"]')?.textContent ?? '',
    ).not.toContain('@acme_a');
    expect(row?.querySelector('[data-publish-caption]')?.textContent).toBe('Hello');
    expect(screen.getByText('Instagram')).toBeTruthy();
  });

  it('never prints the account id', () => {
    const id = '6f1c0b9e-0000-4000-8000-000000000000';
    const { container } = render(
      <PublishIntentSummary
        intent={intent({ account: { id, handle: null, displayName: null } })}
      />,
    );
    expect(container.textContent).not.toContain(id);
    expect(container.textContent).toContain('Unknown account');
  });

  it('lists blockers and warnings', () => {
    render(
      <PublishIntentSummary
        intent={intent({
          blockers: [{ reason: 'media_missing', message: 'No postable media artifact' }],
          warnings: [{ reason: 'claim_unverified', message: 'A claim is unverified' }],
        })}
      />,
    );
    expect(screen.getByText('No postable media artifact')).toBeTruthy();
    expect(screen.getByText('A claim is unverified')).toBeTruthy();
  });
});

describe('PublishTargetsSummary — the group confirm', () => {
  it('renders one row per member, each with its own account and caption', () => {
    const { container } = render(
      <PublishTargetsSummary
        intents={[
          intent(),
          intent({
            platform: 'tiktok',
            account: { id: 'tt-1', handle: 'acme_tt', displayName: 'Acme TT' },
            caption: { length: 7, preview: 'Hi TT!!' },
          }),
        ]}
      />,
    );
    const rows = container.querySelectorAll('[data-publish-target]');
    expect(rows).toHaveLength(2);
    const tiktok = container.querySelector('[data-publish-target="tiktok"]');
    expect(tiktok?.querySelector('[data-publish-account]')?.textContent).toContain('@acme_tt');
    expect(tiktok?.querySelector('[data-publish-caption]')?.textContent).toBe('Hi TT!!');
  });
});
