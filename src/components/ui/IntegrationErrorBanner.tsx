'use client';

import type { IntegrationErrorCode } from '@continuum/contracts';
import * as React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Props = {
  errorCode?: IntegrationErrorCode;
  message?: string;
  platform?: string;
  retryAfter?: number;
};

type ErrorConfig = {
  title: string;
  body: React.ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
  ctaExternal?: boolean;
};

function getConfig(errorCode: IntegrationErrorCode | undefined, platform: string): ErrorConfig {
  const platformLabel =
    platform === 'instagram' ? 'Instagram' : platform === 'linkedin' ? 'LinkedIn' : 'Meta';
  const isLinkedIn = platform === 'linkedin';

  switch (errorCode) {
    case 'TOKEN_EXPIRED':
      return {
        title: `${platformLabel} session expired`,
        body: isLinkedIn ? (
          'Your LinkedIn session has expired or was revoked. Reconnect the LinkedIn account in Settings.'
        ) : (
          <>
            Your Facebook session has expired or was revoked. Go to{' '}
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              facebook.com
            </a>
            , log in, and resolve any security prompts or login alerts. Once done, reconnect your
            account in Settings.
          </>
        ),
        ctaLabel: 'Reconnect in Settings',
        ctaHref: '/settings?section=integrations',
      };

    case 'PERMISSIONS_MISSING':
      return {
        title: `${platformLabel} ads permissions missing`,
        body: isLinkedIn ? (
          'The connected LinkedIn app has not granted the required Marketing API permissions. Reconnect after approving the ads, organization, and audience scopes.'
        ) : (
          <>
            Your Meta account hasn&apos;t granted the required ads permissions. In{' '}
            <strong>Meta Business Settings → Apps</strong>, find Continuum and approve{' '}
            <code>ads_read</code> and <code>ads_management</code>. Then reconnect your account.
          </>
        ),
        ctaLabel: 'Reconnect in Settings',
        ctaHref: '/settings?section=integrations',
      };

    case 'INTEGRATION_NOT_LINKED':
      return {
        title: `No ${platformLabel} account linked`,
        body: `No ${platformLabel} account is linked to this brand. Connect your account in Settings → Integrations to load this data.`,
        ctaLabel: `Connect ${platformLabel} Account`,
        ctaHref: '/settings?section=integrations',
      };

    case 'RATE_LIMITED':
      return {
        title: `${platformLabel} rate limit active`,
        body: `${platformLabel} is temporarily rate-limiting requests for this account. No action needed — data will load again automatically in a few minutes.`,
      };

    case 'ACCOUNT_NOT_VERIFIED':
      return {
        title: 'Facebook Business Verification required',
        body: (
          <>
            Your Facebook Business account needs to complete Business Verification. Go to{' '}
            <strong>business.facebook.com → Security Center</strong> to complete verification. Once
            verified, reconnect your account.
          </>
        ),
        ctaLabel: 'Open Business Settings',
        ctaHref: 'https://business.facebook.com/settings/security',
        ctaExternal: true,
      };

    case 'UPSTREAM_UNAVAILABLE':
      return {
        title: `${platformLabel} API temporarily unavailable`,
        body: `${platformLabel}'s API is temporarily unavailable. This usually resolves on its own — no action needed. Try refreshing in a few minutes.`,
      };

    default:
      return {
        title: 'Unable to load data',
        body: 'We hit an unexpected error loading this data. Try refreshing the page. If this keeps happening, contact support.',
      };
  }
}

export function IntegrationErrorBanner({ errorCode, platform = 'meta', retryAfter }: Props) {
  const config = getConfig(errorCode, platform);
  const [secondsLeft, setSecondsLeft] = React.useState(retryAfter ?? 0);

  React.useEffect(() => {
    if (!retryAfter || errorCode !== 'RATE_LIMITED') return;
    setSecondsLeft(retryAfter);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [retryAfter, errorCode]);

  return (
    <Alert className="my-2 border-warning/30 bg-warning/10">
      <AlertDescription className="text-warning">
        <span className="font-semibold">{config.title}. </span>
        <span>{config.body}</span>
        {errorCode === 'RATE_LIMITED' && secondsLeft > 0 && (
          <span className="ml-1 tabular-nums">Retry in {secondsLeft}s.</span>
        )}
        {config.ctaLabel && config.ctaHref && (
          <a
            href={config.ctaHref}
            {...(config.ctaExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="ml-2 font-medium underline whitespace-nowrap"
          >
            {config.ctaLabel} →
          </a>
        )}
      </AlertDescription>
    </Alert>
  );
}
