import { getTranslations } from 'next-intl/server';
import { RevokeGrantButton } from '@/components/integrations/RevokeGrantButton';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { fetchBrandIntegrationGrants } from '@/lib/integrations/grants';
import { formatRelativeTime } from '@/lib/time/relativeTime';

const PROVIDER_LABEL: Record<string, string> = {
  meta: 'Meta (Facebook & Instagram)',
  google: 'Google',
  google_ads: 'Google Ads',
  googleAds: 'Google Ads',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  amazon: 'Amazon Ads',
  amazonAds: 'Amazon Ads',
  dv360: 'Display & Video 360',
  googleAnalytics: 'Google Analytics',
};

function formatProvider(provider: string): string {
  return (
    PROVIDER_LABEL[provider] ?? provider.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

type BrandGrantsSectionProps = {
  brandProfileId: string;
};

export async function BrandGrantsSection({ brandProfileId }: BrandGrantsSectionProps) {
  const tUi = await getTranslations('common');

  const [{ user, permissions }, grants] = await Promise.all([
    getActiveBrandContext(),
    fetchBrandIntegrationGrants(brandProfileId),
  ]);

  if (grants.length === 0) {
    return (
      <GlassPanel className="p-[var(--card-pad)]">
        <div className="mb-2">
          <h3 className="text-base font-semibold text-foreground">{tUi('m_6c08cd20d5')}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{tUi('m_985ab5985b')}</p>
      </GlassPanel>
    );
  }

  const callerId = user?.id ?? null;
  const isOwner = (permissions ?? []).some(
    (p) => p.brand_profile_id === brandProfileId && p.role === 'owner',
  );

  return (
    <GlassPanel className="p-[var(--card-pad)]">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">{tUi('m_6c08cd20d5')}</h3>
        <p className="text-sm text-muted-foreground">{tUi('m_f3b464a3d3')}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {grants.map((grant) => {
          const label = formatProvider(grant.provider);
          const isCallerGranter = callerId !== null && callerId === grant.grantedBy;
          const canRevoke = isCallerGranter || isOwner;
          const inheritedLabel = isCallerGranter
            ? tUi('integrationGrantedByYou')
            : tUi('integrationInherited');

          return (
            <li
              key={grant.grantId}
              className="flex items-center justify-between rounded-md border border-border/60 bg-background/30 px-4 py-2.5"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {inheritedLabel} · {formatRelativeTime(grant.grantedAt)}
                </span>
              </div>
              {canRevoke ? (
                <RevokeGrantButton
                  grantId={grant.grantId}
                  brandProfileId={brandProfileId}
                  integrationLabel={label}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
