import { Suspense } from "react";
import { Heading, Text } from "@radix-ui/themes";
import { BrandDocumentsSection } from "@/components/settings/BrandDocumentsSection";
import { BrandMembersSection } from "@/components/settings/BrandMembersSection";
import { RunStrategicAnalysisButton } from "@/components/strategic-analyses/RunStrategicAnalysisButton";
import { BrandIdentityHeader } from "@/components/settings/brand/BrandIdentityHeader";
import { BrandIdentitySection } from "@/components/settings/brand/BrandIdentitySection";
import { BrandInvitesSection } from "@/components/settings/brand/BrandInvitesSection";
import { BrandDangerZone } from "@/components/settings/brand/BrandDangerZone";
import { BrandIntegrationsSwitcher } from "@/components/settings/brand/BrandIntegrationsSwitcher";
import { BrandBillingPanel } from "@/components/settings/brand/BrandBillingPanel";
import { UserProfileSection } from "@/components/settings/account/UserProfileSection";
import { UserConnectionsSwitcher } from "@/components/settings/account/UserConnectionsSwitcher";
import { UserBrandsPanel } from "@/components/settings/account/UserBrandsPanel";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { fetchBrandProfileDetails } from "@/lib/brands/profile";
import { fetchBrandDocuments } from "@/lib/brands/documents";
import {
  createEmptyUserIntegrationSummary,
  fetchUserIntegrationSummary,
} from "@/lib/integrations/userIntegrations";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { createBrandProfileRepository } from "@/lib/repositories/brandProfile";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { SettingsSection } from "@/components/settings/shell/SettingsSection";
import { BrandNavPill } from "@/components/settings/shell/BrandNavPill";
import { AccountNavPill } from "@/components/settings/shell/AccountNavPill";
import {
  resolveSection,
  type SectionKey,
} from "@/components/settings/shell/sections";

type SettingsPageProps = {
  searchParams?: Promise<{ section?: string | string[] }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const {
    activeBrandId,
    brandSummaries,
    permissions,
    activeBrandTier,
    user,
  } = await getActiveBrandContext();
  const params = await searchParams;
  const initialSection = resolveSection(params?.section);

  if (!activeBrandId) {
    return (
      <div className="w-full px-3 py-10 sm:px-4 lg:px-6">
        <Heading size="6">Settings</Heading>
        <Text color="gray">Set up a brand profile to unlock settings.</Text>
      </div>
    );
  }

  const repo = createBrandProfileRepository();
  const [
    integrationSummary,
    brandProfile,
    documents,
    members,
    invites,
    userIntegrationSummary,
  ] = await Promise.all([
    fetchBrandIntegrationSummary(activeBrandId),
    fetchBrandProfileDetails(activeBrandId),
    fetchBrandDocuments(activeBrandId),
    repo.fetchMembers(activeBrandId),
    repo.fetchInvites(activeBrandId),
    user
      ? fetchUserIntegrationSummary(user.id)
      : Promise.resolve(createEmptyUserIntegrationSummary()),
  ]);

  const currentUserRole =
    members.find((m) => m.id === user?.id || m.email === user?.email)?.role ?? null;
  const canEdit = currentUserRole === "owner" || currentUserRole === "admin";
  const canDelete = canEdit;

  const activeBrand = brandSummaries.find((b) => b.id === activeBrandId);
  const brandName = brandProfile?.name ?? activeBrand?.name ?? "Untitled Brand";
  const brandLogoUrl = activeBrand?.logoUrl ?? null;
  const userEmail = user?.email ?? "Unknown";

  const brandHeader = (
    <BrandIdentityHeader
      brandId={activeBrandId}
      name={brandName}
      logoUrl={brandLogoUrl}
    />
  );

  const sections: Record<SectionKey, React.ReactNode> = {
    general: (
      <>
        {brandHeader}
        <SettingsSection
          title="Brand identity"
          description="Logo, name, and workspace metadata."
        >
          <BrandIdentitySection
            key={activeBrandId}
            brandName={brandName}
            logoPath={brandProfile?.logoPath ?? null}
            profile={brandProfile ?? undefined}
            canEdit={canEdit}
          />
        </SettingsSection>
        <SettingsSection
          title="Members"
          description="Manage who can access this brand profile. Owners cannot be removed."
        >
          <BrandMembersSection
            brandId={activeBrandId}
            members={members}
            canEdit={canEdit}
          />
        </SettingsSection>
        <SettingsSection
          title="Invitations"
          description="Generate magic links and review pending invites."
        >
          <BrandInvitesSection invites={invites} canEdit={canEdit} />
        </SettingsSection>
        {canDelete ? (
          <SettingsSection
            title="Danger zone"
            description="Irreversible actions for this brand profile."
          >
            <BrandDangerZone
              brandName={brandName}
              hasProfile={Boolean(brandProfile)}
              canDelete={canDelete}
            />
          </SettingsSection>
        ) : null}
      </>
    ),
    integrations: (
      <>
        {brandHeader}
        <SettingsSection
          title="Brand integrations"
          description="Provider accounts assigned to this brand. Tap a provider to inspect its accounts."
        >
          <BrandIntegrationsSwitcher initialSummary={integrationSummary} />
        </SettingsSection>
      </>
    ),
    knowledge: (
      <>
        {brandHeader}
        <SettingsSection
          title="Knowledge"
          description="Documents Jaina uses for app-wide brand intelligence."
          action={<RunStrategicAnalysisButton brandProfileId={activeBrandId} compact />}
        >
          <BrandDocumentsSection brandId={activeBrandId} documents={documents} />
        </SettingsSection>
      </>
    ),
    billing: (
      <>
        {brandHeader}
        <SettingsSection
          title="Billing & credits"
          description="AI Studio tier, credits, and plan management."
        >
          <BrandBillingPanel tier={activeBrandTier} />
        </SettingsSection>
      </>
    ),
    profile: (
      <SettingsSection
        title="Your profile"
        description="Identity tied to your login across every brand you join."
      >
        <UserProfileSection
          email={userEmail}
          name={user?.user_metadata?.full_name ?? null}
          lastSignIn={user?.last_sign_in_at ?? null}
        />
      </SettingsSection>
    ),
    connections: (
      <SettingsSection
        title="Personal connections"
        description="OAuth providers tied to your account. Assign these to brands from the brand integrations panel."
      >
        <UserConnectionsSwitcher integrations={userIntegrationSummary} />
      </SettingsSection>
    ),
    brands: (
      <SettingsSection
        title="Your brands"
        description="Brands you have joined. Switching here updates the entire app."
      >
        <UserBrandsPanel permissions={permissions} />
      </SettingsSection>
    ),
  };

  return (
    <div className="w-full max-w-none px-3 py-10 sm:px-4 lg:px-6">
      <header className="mb-8 space-y-1">
        <Heading size="7" className="text-white">
          Settings
        </Heading>
        <Text color="gray">
          Manage this brand and your personal account.
        </Text>
      </header>

      <Suspense fallback={null}>
        <SettingsShell
          initialSection={initialSection}
          brandPill={<BrandNavPill name={brandName} logoUrl={brandLogoUrl} />}
          accountPill={<AccountNavPill email={userEmail} />}
          sections={sections}
        />
      </Suspense>
    </div>
  );
}
