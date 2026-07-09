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

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  google: 'Google',
  tiktok: 'TikTok',
  x: 'X',
};

// Instagram and Facebook are reached through the Meta integration, so their
// remediation steps point at Facebook rather than the platform's own site.
const META_FAMILY: ReadonlySet<string> = new Set(['meta', 'instagram', 'facebook']);

// YouTube analytics rides on the Google OAuth grant, so reconnecting Google is
// what actually fixes a YouTube failure.
const GOOGLE_FAMILY: ReadonlySet<string> = new Set(['google', 'youtube']);

function platformLabelFor(platform: string): string {
  const known = PLATFORM_LABELS[platform.toLowerCase()];
  if (known) return known;
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function getConfig(errorCode: IntegrationErrorCode | undefined, platform: string): ErrorConfig {
  const key = platform.toLowerCase();
  const platformLabel = platformLabelFor(key);
  const isLinkedIn = key === 'linkedin';
  const isGoogle = GOOGLE_FAMILY.has(key);
  const isMeta = META_FAMILY.has(key);

  switch (errorCode) {
    case 'TOKEN_EXPIRED':
      return {
        title: `${platformLabel} session expired`,
        body: isLinkedIn ? (
          'Your LinkedIn session has expired or was revoked. Reconnect the LinkedIn account in Settings.'
        ) : isGoogle ? (
          'Your Google session has expired or was revoked. Reconnect Google in Settings and approve YouTube access.'
        ) : isMeta ? (
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
        ) : (
          `Your ${platformLabel} session has expired or was revoked. Reconnect the account in Settings.`
        ),
        ctaLabel: 'Reconnect in Settings',
        ctaHref: '/settings?section=integrations',
      };

    case 'PERMISSIONS_MISSING':
      return {
        title: `${platformLabel} permissions missing`,
        body: isLinkedIn ? (
          'The connected LinkedIn app has not granted the required Marketing API permissions. Reconnect after approving the ads, organization, and audience scopes.'
        ) : isGoogle ? (
          <>
            Your Google account hasn&apos;t granted the required YouTube permissions. Reconnect
            Google and approve <code>youtube.readonly</code> and <code>yt-analytics.readonly</code>.
          </>
        ) : isMeta ? (
          <>
            Your Meta account hasn&apos;t granted the required ads permissions. In{' '}
            <strong>Meta Business Settings → Apps</strong>, find Continuum and approve{' '}
            <code>ads_read</code> and <code>ads_management</code>. Then reconnect your account.
          </>
        ) : (
          `Your ${platformLabel} account hasn't granted the permissions Continuum needs. Reconnect the account in Settings.`
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

// For these codes the curated copy is a generic restatement, while the server
// message names the specific integration and remediation. The other codes carry
// step-by-step instructions the raw upstream message cannot replace.
const PREFER_SERVER_MESSAGE: ReadonlySet<IntegrationErrorCode | 'unknown'> = new Set([
  'INTEGRATION_NOT_LINKED',
  'unknown',
]);

export function IntegrationErrorBanner({
  errorCode,
  message,
  platform = 'meta',
  retryAfter,
}: Props) {
  const config = getConfig(errorCode, platform);
  const body = message && PREFER_SERVER_MESSAGE.has(errorCode ?? 'unknown') ? message : config.body;
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
        <span>{body}</span>
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
