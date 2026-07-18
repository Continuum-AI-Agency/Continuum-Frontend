import { describe, expect, test } from 'bun:test';
import { render } from '@testing-library/react';

import { OrganicAccountProfileHeader } from './OrganicAccountProfileHeader';

const FULL_PROFILE = {
  displayName: 'Continuum AI',
  username: 'continuumai',
  avatarUrl: 'https://p16.tiktokcdn.com/avatar.jpeg',
  bio: 'Marketing intelligence for modern brands.',
  profileUrl: 'https://www.tiktok.com/@continuumai',
  isVerified: true,
};

describe('OrganicAccountProfileHeader', () => {
  test('renders every identity field the platform reported', () => {
    const view = render(
      <OrganicAccountProfileHeader profile={FULL_PROFILE} platformLabel="TikTok" />,
    );

    expect(view.getByText('Continuum AI')).toBeTruthy();
    expect(view.getByText('@continuumai')).toBeTruthy();
    expect(view.getByText('Marketing intelligence for modern brands.')).toBeTruthy();
    expect(view.getByLabelText('Verified account')).toBeTruthy();

    const link = view.getByRole('link', { name: /view on tiktok/i });
    expect(link.getAttribute('href')).toBe('https://www.tiktok.com/@continuumai');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  test('omits the verified badge when the account is not verified', () => {
    const view = render(
      <OrganicAccountProfileHeader
        profile={{ ...FULL_PROFILE, isVerified: false }}
        platformLabel="TikTok"
      />,
    );

    expect(view.queryByLabelText('Verified account')).toBeNull();
    expect(view.getByText('Continuum AI')).toBeTruthy();
  });

  // Platforms differ in what they expose, so a partial profile must still render
  // rather than blanking the header or throwing.
  test('renders a partial profile and drops the link when there is no profile URL', () => {
    const view = render(
      <OrganicAccountProfileHeader
        profile={{ displayName: 'Continuum AI', username: null, profileUrl: null }}
        platformLabel="TikTok"
      />,
    );

    expect(view.getByText('Continuum AI')).toBeTruthy();
    expect(view.queryByRole('link')).toBeNull();
  });

  test('falls back to initials when no avatar URL is available', () => {
    const view = render(
      <OrganicAccountProfileHeader
        profile={{ ...FULL_PROFILE, avatarUrl: null }}
        platformLabel="TikTok"
      />,
    );

    expect(view.getByText('CA')).toBeTruthy();
  });

  test('renders nothing when the platform reported no identity at all', () => {
    const view = render(
      <OrganicAccountProfileHeader
        profile={{ displayName: null, username: null, avatarUrl: null }}
        platformLabel="TikTok"
      />,
    );

    expect(view.container.firstChild).toBeNull();
  });
});
