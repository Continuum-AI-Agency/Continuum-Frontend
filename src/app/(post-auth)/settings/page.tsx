import { Suspense } from "react";
import { Heading, Text } from "@radix-ui/themes";
import { BrandDocumentsSection } from "@/components/settings/BrandDocumentsSection";
import { BrandGuidelineSection } from "@/components/settings/BrandGuidelineSection";
import { BrandMembersSection } from "@/components/settings/BrandMembersSection";
import { RunStrategicAnalysisButton } from "@/components/strategic-analyses/RunStrategicAnalysisButton";
import { BrandIdentityHeader } from "@/components/settings/brand/BrandIdentityHeader";
import { BrandIdentitySection } from "@/components/settings/brand/BrandIdentitySection";
import { BrandInvitesSection } from "@/components/settings/brand/BrandInvitesSection";
import { BrandDangerZone } from "@/components/settings/brand/BrandDangerZone";
import { BrandIntegrationsSwitcher } from "@/components/settings/brand/BrandIntegrationsSwitcher";
import { BrandGrantsSection } from "@/components/integrations/BrandGrantsSection";
import { MyConnectionsSharingSection } from "@/components/integrations/MyConnectionsSharingSection";
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
import { ensureOnboardingState } from "@/lib/onboarding/storage";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { SettingsSection } from "@/components/settings/shell/SettingsSection";
import { BrandNavPill } from "@/components/settings/shell/BrandNavPill";
import { AccountNavPill } from "@/components/settings/shell/AccountNavPill";
import { resolveSection } from "@/components/settings/shell/sections";

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

  const activeBrand = brandSummaries.find((b) => b.id === activeBrandId);
  const defaultBrandName = activeBrand?.name ?? "Untitled Brand";
  const brandLogoUrl = activeBrand?.logoUrl ?? null;
  const userEmail = user?.email ?? "Unknown";

  const createBrandHeader = (name: string) => (
    <BrandIdentityHeader
      brandId={activeBrandId}
      name={name}
      logoUrl={brandLogoUrl}
    />
  );

  let activeSectionSlot: React.ReactNode;

  if (initialSection === "general") {
    const repo = createBrandProfileRepository();
    const [brandProfile, members, invites] = await Promise.all([
      fetchBrandProfileDetails(activeBrandId),
      repo.fetchMembers(activeBrandId),
      repo.fetchInvites(activeBrandId),
    ]);
    const brandName = brandProfile?.name ?? defaultBrandName;
    const currentUserRole =
      members.find((m) => m.id === user?.id || m.email === user?.email)?.role ?? null;
    const canEdit = currentUserRole === "owner" || currentUserRole === "admin";
    const canDelete = canEdit;

    activeSectionSlot = (
      <>
        {createBrandHeader(brandName)}
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
      </>);
  } else if (initialSection === "integrations") {
    const repo = createBrandProfileRepository();
    const [integrationSummary, members] = await Promise.all([
      fetchBrandIntegrationSummary(activeBrandId),
      repo.fetchMembers(activeBrandId),
    ]);
    await ensureOnboardingState(activeBrandId);

    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection
          title="Brand integrations"
          description="Provider accounts assigned to this brand. Tap a provider to inspect its accounts."
        >
          <BrandIntegrationsSwitcher
            initialSummary={integrationSummary}
            members={members}
            currentUserId={user?.id ?? ""}
          />
        </SettingsSection>
        <SettingsSection
          title="Shared with this brand"
          description="Connections other members have granted to this brand."
        >
          <BrandGrantsSection brandProfileId={activeBrandId} />
        </SettingsSection>
        {user?.id ? (
          <SettingsSection
            title="Your shared connections"
            description="Personal connections you have shared, and the brands they reach."
          >
            <MyConnectionsSharingSection userId={user.id} />
          </SettingsSection>
        ) : null}
      </>
    );
  } else if (initialSection === "knowledge") {
    const documents = await fetchBrandDocuments(activeBrandId);

    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection
          title="Knowledge"
          description="Documents Jaina uses for app-wide brand intelligence."
          action={<RunStrategicAnalysisButton brandProfileId={activeBrandId} compact />}
        >
          <BrandDocumentsSection brandId={activeBrandId} documents={documents} />
        </SettingsSection>
        <SettingsSection
          title="Brand guideline"
          description="Synthesized from your brand report and uploaded documents."
        >
          <BrandGuidelineSection brandId={activeBrandId} />
        </SettingsSection>
      </>
    );
  } else if (initialSection === "billing") {
    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection
          title="Billing & credits"
          description="AI Studio tier, credits, and plan management."
        >
          <BrandBillingPanel tier={activeBrandTier} />
        </SettingsSection>
      </>
    );
  } else if (initialSection === "profile") {
    activeSectionSlot = (
      <SettingsSection
        title="Your profile"
        description="Identity tied to your login across every brand you join."
      >
        <UserProfileSection
          email={userEmail}
          name={user?.user_metadata?.full_name ?? null}
          lastSignIn={null}
        />
      </SettingsSection>
    );
  } else if (initialSection === "connections") {
    const userIntegrationSummary = user
      ? await fetchUserIntegrationSummary(user.id)
      : createEmptyUserIntegrationSummary();

    activeSectionSlot = (
      <SettingsSection
        title="Personal connections"
        description="OAuth providers tied to your account. Assign these to brands from the brand integrations panel."
      >
          <UserConnectionsSwitcher integrations={userIntegrationSummary} />
      </SettingsSection>
    );
  } else {
    activeSectionSlot = (
      <SettingsSection
        title="Your brands"
        description="Brands you have joined. Switching here updates the entire app."
      >
          <UserBrandsPanel permissions={permissions} />
      </SettingsSection>
    );
  }

  return (
    <div className="w-full max-w-none px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <header className="mb-4 space-y-1">
        <Heading size="5" className="text-white">
          Settings
        </Heading>
        <Text color="gray">
          Manage this brand and your personal account.
        </Text>
      </header>

      <Suspense fallback={null}>
        <SettingsShell
          activeSection={initialSection}
          brandPill={<BrandNavPill name={defaultBrandName} logoUrl={brandLogoUrl} />}
          accountPill={<AccountNavPill email={userEmail} />}
          activeSectionSlot={activeSectionSlot}
        />
      </Suspense>
    </div>
  );
}
