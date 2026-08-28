import { RemoveConnectionButton } from '@/components/integrations/RemoveConnectionButton';
import { ShareConnectionButton } from '@/components/integrations/ShareConnectionButton';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { fetchMyConnectionGrants } from '@/lib/integrations/grants';
import { fetchOwnedConnections } from '@/lib/integrations/ownedConnections';
import { mapIntegrationTypeToPlatformKey } from '@/lib/integrations/platform';

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
    PROVIDER_LABEL[provider] ??
    PROVIDER_LABEL[mapIntegrationTypeToPlatformKey(provider) ?? ''] ??
    provider.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

type MyConnectionsSharingSectionProps = {
  userId: string;
};

export async function MyConnectionsSharingSection({ userId }: MyConnectionsSharingSectionProps) {
  const [connections, grants] = await Promise.all([
    fetchOwnedConnections(userId),
    fetchMyConnectionGrants(),
  ]);

  if (connections.length === 0) {
    return null;
  }

  const grantsByIntegration = new Map<string, { brandProfileId: string; brandName: string }[]>();
  for (const grant of grants) {
    const list = grantsByIntegration.get(grant.integrationId) ?? [];
    list.push({ brandProfileId: grant.brandProfileId, brandName: grant.brandName });
    grantsByIntegration.set(grant.integrationId, list);
  }

  return (
    <GlassPanel className="p-[var(--card-pad)]">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Your connections</h3>
        <p className="text-sm text-muted-foreground">
          Share a connection with any brand you own or administer, or remove it from your account
          entirely — which pulls it from every brand at once.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {connections.map((connection) => {
          const providerLabel = formatProvider(connection.provider);
          const label = connection.identity
            ? `${providerLabel} — ${connection.identity}`
            : providerLabel;
          const grantedTo = grantsByIntegration.get(connection.id) ?? [];
          return (
            <li
              key={connection.id}
              className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  {connection.status ? (
                    <span className="text-xs text-muted-foreground capitalize">
                      · {connection.status.replace(/_/g, ' ')}
                    </span>
                  ) : null}
                </div>
                {grantedTo.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Granted to:</span>
                    {grantedTo.map((g) => (
                      <span
                        key={g.brandProfileId}
                        className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-foreground"
                      >
                        {g.brandName}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Not yet shared with any brand.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <ShareConnectionButton
                  integrationId={connection.id}
                  integrationLabel={label}
                  alreadyGrantedBrandIds={grantedTo.map((g) => g.brandProfileId)}
                />
                <RemoveConnectionButton integrationId={connection.id} integrationLabel={label} />
              </div>
            </li>
          );
        })}
      </ul>
    </GlassPanel>
  );
}
