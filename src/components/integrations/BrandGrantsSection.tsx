import { fetchBrandIntegrationGrants } from "@/lib/integrations/grants";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { RevokeGrantButton } from "@/components/integrations/RevokeGrantButton";
import { GlassPanel } from "@/components/ui/GlassPanel";

const PROVIDER_LABEL: Record<string, string> = {
  meta: "Meta (Facebook & Instagram)",
  google: "Google",
  google_ads: "Google Ads",
  googleAds: "Google Ads",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  threads: "Threads",
  amazon: "Amazon Ads",
  amazonAds: "Amazon Ads",
  dv360: "Display & Video 360",
};

function formatProvider(provider: string): string {
  return (
    PROVIDER_LABEL[provider] ??
    provider.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

type BrandGrantsSectionProps = {
  brandProfileId: string;
};

export async function BrandGrantsSection({ brandProfileId }: BrandGrantsSectionProps) {
  const [{ user, permissions }, grants] = await Promise.all([
    getActiveBrandContext(),
    fetchBrandIntegrationGrants(brandProfileId),
  ]);

  if (grants.length === 0) {
    return (
      <GlassPanel className="p-6">
        <div className="mb-2">
          <h3 className="text-base font-semibold text-foreground">Granted integrations</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          No integrations have been granted to this brand yet. Share a personal connection below to get started.
        </p>
      </GlassPanel>
    );
  }

  const callerId = user?.id ?? null;
  const isOwner = (permissions ?? []).some(
    (p) => p.brand_profile_id === brandProfileId && p.role === "owner",
  );

  return (
    <GlassPanel className="p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Granted integrations</h3>
        <p className="text-sm text-muted-foreground">
          Connections shared with this brand. Revoking removes access for everyone on the brand.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {grants.map((grant) => {
          const label = formatProvider(grant.provider);
          const isCallerGranter = callerId !== null && callerId === grant.grantedBy;
          const canRevoke = isCallerGranter || isOwner;
          const inheritedLabel = isCallerGranter ? "Granted by you" : "Inherited from a teammate";

          return (
            <li
              key={grant.grantId}
              className="flex items-center justify-between rounded-md border border-border/60 bg-background/30 px-4 py-2.5"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {inheritedLabel} · {formatRelative(grant.grantedAt)}
                </span>
              </div>
              {canRevoke ? (
                <RevokeGrantButton
                  grantId={grant.grantId}
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
