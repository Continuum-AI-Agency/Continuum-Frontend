import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

import { IntegrationErrorBanner } from '@/components/ui/IntegrationErrorBanner';

afterEach(cleanup);

describe('IntegrationErrorBanner platform labelling', () => {
  test('names YouTube, not Meta, when a YouTube panel fails', () => {
    render(<IntegrationErrorBanner errorCode="INTEGRATION_NOT_LINKED" platform="youtube" />);

    expect(screen.getByText(/No YouTube account linked/)).toBeTruthy();
    expect(screen.queryByText(/Meta/)).toBeNull();
  });

  test('names Google when the edge blames the google integration', () => {
    render(<IntegrationErrorBanner errorCode="INTEGRATION_NOT_LINKED" platform="google" />);

    expect(screen.getByText(/No Google account linked/)).toBeTruthy();
    expect(screen.getByText(/Connect Google Account/)).toBeTruthy();
  });

  test.each([
    ['instagram', 'Instagram'],
    ['facebook', 'Facebook'],
    ['linkedin', 'LinkedIn'],
    ['tiktok', 'TikTok'],
    ['meta', 'Meta'],
  ])('labels %s as %s', (platform, label) => {
    render(<IntegrationErrorBanner errorCode="INTEGRATION_NOT_LINKED" platform={platform} />);

    expect(screen.getByText(new RegExp(`No ${label} account linked`))).toBeTruthy();
  });

  test('renders the server message for INTEGRATION_NOT_LINKED instead of generic copy', () => {
    render(
      <IntegrationErrorBanner
        errorCode="INTEGRATION_NOT_LINKED"
        platform="google"
        message="YouTube analytics access is not configured for this brand. Reconnect Google to grant YouTube access."
      />,
    );

    expect(screen.getByText(/Reconnect Google to grant YouTube access/)).toBeTruthy();
  });

  test('keeps curated remediation steps for TOKEN_EXPIRED rather than the raw upstream message', () => {
    render(
      <IntegrationErrorBanner
        errorCode="TOKEN_EXPIRED"
        platform="instagram"
        message="Error validating access token: session invalidated"
      />,
    );

    expect(screen.getByText(/Instagram session expired/)).toBeTruthy();
    expect(screen.queryByText(/session invalidated/)).toBeNull();
  });

  test('points a google TOKEN_EXPIRED at Google, not facebook.com', () => {
    render(<IntegrationErrorBanner errorCode="TOKEN_EXPIRED" platform="youtube" />);

    expect(screen.getByText(/YouTube session expired/)).toBeTruthy();
    expect(screen.getByText(/Reconnect Google in Settings/)).toBeTruthy();
    expect(screen.queryByText(/facebook\.com/)).toBeNull();
  });
});
