'use client';

import type { IntegrationErrorCode } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
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

function getConfig(
  errorCode: IntegrationErrorCode | undefined,
  platform: string,
  tUi: ReturnType<typeof useTranslations<'common'>>,
): ErrorConfig {
  const key = platform.toLowerCase();
  const platformLabel = platformLabelFor(key);
  const args = { platform: platformLabel };
  const strong = (children: React.ReactNode) => <strong>{children}</strong>;
  const scope = (children: React.ReactNode) => <code>{children}</code>;
  const reconnect = {
    ctaLabel: tUi('integrationReconnect'),
    ctaHref: '/settings?section=integrations',
  };
  switch (errorCode) {
    case 'TOKEN_EXPIRED':
      return {
        title: tUi('integrationExpiredTitle', args),
        ...reconnect,
        body:
          key === 'linkedin'
            ? tUi('integrationExpiredLinkedIn')
            : GOOGLE_FAMILY.has(key)
              ? tUi('integrationExpiredGoogle')
              : META_FAMILY.has(key)
                ? tUi.rich('integrationExpiredMeta', {
                    link: (children) => (
                      <a
                        href="https://facebook.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {children}
                      </a>
                    ),
                  })
                : tUi('integrationExpiredBody', args),
      };
    case 'PERMISSIONS_MISSING':
      return {
        title: tUi('integrationPermissionsTitle', args),
        ...reconnect,
        body:
          key === 'linkedin'
            ? tUi('integrationPermissionsLinkedIn')
            : GOOGLE_FAMILY.has(key)
              ? tUi.rich('integrationPermissionsGoogle', { scope })
              : META_FAMILY.has(key)
                ? tUi.rich('integrationPermissionsMeta', { strong, scope })
                : tUi('integrationPermissionsBody', args),
      };
    case 'INTEGRATION_NOT_LINKED':
      return {
        title: tUi('integrationNotLinkedTitle', args),
        body: tUi('integrationNotLinkedBody', args),
        ctaLabel: tUi('integrationConnect', args),
        ctaHref: '/settings?section=integrations',
      };
    case 'RATE_LIMITED':
      return { title: tUi('integrationRateTitle', args), body: tUi('integrationRateBody', args) };
    case 'ACCOUNT_NOT_VERIFIED':
      return {
        title: tUi('integrationVerificationTitle'),
        body: tUi.rich('integrationVerificationBody', { strong }),
        ctaLabel: tUi('integrationOpenBusiness'),
        ctaHref: 'https://business.facebook.com/settings/security',
        ctaExternal: true,
      };
    case 'UPSTREAM_UNAVAILABLE':
      return {
        title: tUi('integrationUpstreamTitle', args),
        body: tUi('integrationUpstreamBody', args),
      };
    default:
      return { title: tUi('integrationUnknownTitle'), body: tUi('integrationUnknownBody') };
  }
}

export function IntegrationErrorBanner({ errorCode, platform = 'meta', retryAfter }: Props) {
  const tUi = useTranslations('common');

  const config = getConfig(errorCode, platform, tUi);
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
          <span className="ml-1 tabular-nums">
            {tUi('integrationRetry', { seconds: secondsLeft })}
          </span>
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
