import { RemoveConnectionButton } from '@/components/integrations/RemoveConnectionButton';
import { ShareConnectionButton } from '@/components/integrations/ShareConnectionButton';
import { Pill } from '@/components/kibo-ui/pill';
import {
  SettingsInfoHint,
  SettingsRow,
  SettingsRowList,
} from '@/components/settings/shell/SettingsRowList';
import { SettingsSection } from '@/components/settings/shell/SettingsSection';
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

// Connection · status · brands it reaches · when it was connected · share/remove.
const CONNECTION_COLUMNS = ['Connection', 'Status', 'Shared with', 'Connected', ''] as const;
const CONNECTION_GRID =
  'grid-cols-2 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_13rem]';

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

function formatProvider(provider: string): string {
  return (
    PROVIDER_LABEL[provider] ??
    PROVIDER_LABEL[mapIntegrationTypeToPlatformKey(provider) ?? ''] ??
    provider.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatDate(value: string | null): string {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? DATE_FORMAT.format(parsed) : '—';
}

function ConnectionStatus({ status }: { status: string | null }) {
  if (status === 'active') return <Pill variant="success">Active</Pill>;
  if (status === 'needs_reauth') return <Pill variant="warning">Needs reconnect</Pill>;
  return status ? (
    <Pill variant="muted" className="capitalize">
      {status.replace(/_/g, ' ')}
    </Pill>
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  );
}

type Grant = { brandProfileId: string; brandName: string; grantedAt: string };

function SharedWithSummary({ grants }: { grants: Grant[] }) {
  if (grants.length === 0) return <p className="text-xs text-muted-foreground">Not shared</p>;
  const shown = grants.slice(0, 2).map((grant) => grant.brandName);
  const rest = grants.length - shown.length;
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium tabular-nums">
        {grants.length} {grants.length === 1 ? 'brand' : 'brands'}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {shown.join(', ')}
        {rest > 0 ? ` +${rest}` : ''}
      </p>
    </div>
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

  const grantsByIntegration = new Map<string, Grant[]>();
  for (const grant of grants) {
    const list = grantsByIntegration.get(grant.integrationId) ?? [];
    list.push(grant);
    grantsByIntegration.set(grant.integrationId, list);
  }

  return (
    <SettingsSection
      title="Sharing and removal"
      description="Which brands each connection reaches, and how to take one back. Open a connection for every brand it is shared with."
      action={
        <SettingsInfoHint label="How sharing works">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Share a connection with any brand you own or administer.</li>
            <li>
              Remove takes a connection off your account entirely, which pulls it from every brand
              at once. You see what each brand loses before you confirm.
            </li>
            <li>
              Needs reconnect means the provider sign-in has lapsed. Reconnect it under Personal
              connections above.
            </li>
          </ul>
        </SettingsInfoHint>
      }
    >
      {connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No connections on your account yet. Connect one under Personal connections above.
        </p>
      ) : (
        <SettingsRowList
          data-testid="connection-sharing-list"
          grid={CONNECTION_GRID}
          columns={CONNECTION_COLUMNS}
        >
          {connections.map((connection) => {
            const providerLabel = formatProvider(connection.provider);
            const label = connection.identity
              ? `${providerLabel} — ${connection.identity}`
              : providerLabel;
            const grantedTo = grantsByIntegration.get(connection.id) ?? [];
            return (
              <SettingsRow
                key={connection.id}
                data-connection-id={connection.id}
                title={providerLabel}
                subtitle={connection.identity}
                cells={[
                  <ConnectionStatus key="status" status={connection.status} />,
                  <SharedWithSummary key="shared" grants={grantedTo} />,
                  <p key="connected" className="text-sm tabular-nums">
                    {formatDate(connection.createdAt)}
                  </p>,
                ]}
                actions={
                  <>
                    <ShareConnectionButton
                      integrationId={connection.id}
                      integrationLabel={label}
                      alreadyGrantedBrandIds={grantedTo.map((g) => g.brandProfileId)}
                    />
                    <RemoveConnectionButton
                      integrationId={connection.id}
                      integrationLabel={label}
                    />
                  </>
                }
                detail={
                  grantedTo.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Not shared with any brand yet. Use Share to give a brand access.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Shared with</p>
                      <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                        {grantedTo.map((grant) => (
                          <li
                            key={grant.brandProfileId}
                            className="flex items-baseline justify-between gap-3 text-sm"
                          >
                            <span className="truncate">{grant.brandName}</span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              since {formatDate(grant.grantedAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                }
              />
            );
          })}
        </SettingsRowList>
      )}
    </SettingsSection>
  );
}
