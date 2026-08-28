import { Suspense } from 'react';
import { BrandGrantsSection } from '@/components/integrations/BrandGrantsSection';
import { MyConnectionsSharingSection } from '@/components/integrations/MyConnectionsSharingSection';
import { ChatConnectionsSection } from '@/components/settings/account/ChatConnectionsSection';
import { McpActivityTable } from '@/components/settings/account/McpActivityTable';
import { McpConnectionsSection } from '@/components/settings/account/McpConnectionsSection';
import { UserBrandsPanel } from '@/components/settings/account/UserBrandsPanel';
import { UserConnectionsSwitcher } from '@/components/settings/account/UserConnectionsSwitcher';
import { UserProfileSection } from '@/components/settings/account/UserProfileSection';
import { BrandDocumentsSection } from '@/components/settings/BrandDocumentsSection';
import { BrandGuidelineSection } from '@/components/settings/BrandGuidelineSection';
import { BrandMembersSection } from '@/components/settings/BrandMembersSection';
import { BrandActivationSection } from '@/components/settings/brand/BrandActivationSection';
import { BrandAdNamingSection } from '@/components/settings/brand/BrandAdNamingSection';
import { BrandBillingPanel } from '@/components/settings/brand/BrandBillingPanel';
import { BrandBookSection } from '@/components/settings/brand/BrandBookSection';
import { BrandDangerZone } from '@/components/settings/brand/BrandDangerZone';
import { BrandIdentityHeader } from '@/components/settings/brand/BrandIdentityHeader';
import { BrandIdentitySection } from '@/components/settings/brand/BrandIdentitySection';
import { BrandIntegrationsSwitcher } from '@/components/settings/brand/BrandIntegrationsSwitcher';
import { BrandIntelligenceWorkspace } from '@/components/settings/brand/BrandIntelligenceWorkspace';
import { BrandInvitesSection } from '@/components/settings/brand/BrandInvitesSection';
import { BrandPulseSection } from '@/components/settings/brand/BrandPulseSection';
import { DesignSystemSection } from '@/components/settings/brand/DesignSystemSection';
import { PromptsSettingsSection } from '@/components/settings/brand/PromptsSettingsSection';
import { SkillsSettingsSection } from '@/components/settings/brand/SkillsSettingsSection';
import { RoleCapabilityLegend } from '@/components/settings/RoleCapabilityLegend';
import { AccountNavPill } from '@/components/settings/shell/AccountNavPill';
import { BrandNavPill } from '@/components/settings/shell/BrandNavPill';
import { SettingsSection } from '@/components/settings/shell/SettingsSection';
import { SettingsShell } from '@/components/settings/shell/SettingsShell';
import { resolveSection } from '@/components/settings/shell/sections';
import { GlossaryTooltip } from '@/components/shared/glossary';
import { RunStrategicAnalysisButton } from '@/components/strategic-analyses/RunStrategicAnalysisButton';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { fetchBrandAdNamingSchema } from '@/lib/brands/adNaming';
import { fetchBrandBook } from '@/lib/brands/brandBook';
import { fetchBrandIntelligenceOverview } from '@/lib/brands/brandIntelligence.server';
import { fetchBrandDocuments } from '@/lib/brands/documents';
import { fetchBrandInviteLedger } from '@/lib/brands/members';
import { fetchBrandProfileDetails } from '@/lib/brands/profile';
import { fetchPulseRecipients } from '@/lib/brands/pulseRecipients';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import {
  createEmptyUserIntegrationSummary,
  fetchProviderReconnectPrompts,
  fetchUserIntegrationSummary,
} from '@/lib/integrations/userIntegrations';
import type { AgentRequestPayload } from '@/lib/onboarding/agentClient';
import { mapOnboardingStateToAgentPayload } from '@/lib/onboarding/mapping';
import { ensureOnboardingState, fetchOnboardingState } from '@/lib/onboarding/storage';
import { createBrandProfileRepository } from '@/lib/repositories/brandProfile';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type SettingsPageProps = {
  searchParams?: Promise<{ section?: string | string[] }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { activeBrandId, brandSummaries, permissions, activeBrandTier, user } =
    await getActiveBrandContext();
  const params = await searchParams;
  const initialSection = resolveSection(params?.section);

  if (!activeBrandId) {
    return (
      <div className="w-full px-3 py-10 sm:px-4 lg:px-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Set up a brand profile to unlock settings.</p>
      </div>
    );
  }

  const activeBrand = brandSummaries.find((b) => b.id === activeBrandId);
  const defaultBrandName = activeBrand?.name ?? 'Untitled Brand';
  const brandLogoUrl = activeBrand?.logoUrl ?? null;
  const userEmail = user?.email ?? 'Unknown';

  const createBrandHeader = (name: string) => (
    <BrandIdentityHeader brandId={activeBrandId} name={name} logoUrl={brandLogoUrl} />
  );

  let activeSectionSlot: React.ReactNode;

  if (initialSection === 'activation') {
    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection
          title="Activation"
          description="The setup that makes Continuum work for your brand, in one place. Finish these to unlock plans, insights, and competitor intelligence."
        >
          <BrandActivationSection />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'general') {
    const repo = createBrandProfileRepository();
    const [brandProfile, members, invites, pulseRecipients] = await Promise.all([
      // The only fetch here that rejects rather than returning empty — deliberately, and
      // its test says so. In a Promise.all that took the whole Settings route down through
      // the error boundary, so an unreadable brand row cost the user the members list, the
      // brand list, and every other section too. brandName already falls back below.
      fetchBrandProfileDetails(activeBrandId).catch((error) => {
        console.error(`[settings] Failed to load brand profile ${activeBrandId}`, error);
        return null;
      }),
      repo.fetchMembers(activeBrandId),
      fetchBrandInviteLedger(activeBrandId),
      fetchPulseRecipients(activeBrandId),
    ]);
    const brandName = brandProfile?.name ?? defaultBrandName;
    const currentUserRole =
      members.find((m) => m.id === user?.id || m.email === user?.email)?.role ?? null;
    const canEdit = currentUserRole === 'owner' || currentUserRole === 'admin';
    const canDelete = canEdit;

    activeSectionSlot = (
      <>
        {createBrandHeader(brandName)}
        <SettingsSection title="Brand identity" description="Logo, name, and workspace metadata.">
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
          <BrandMembersSection brandId={activeBrandId} members={members} canEdit={canEdit} />
          <RoleCapabilityLegend />
        </SettingsSection>
        <SettingsSection
          title="Continuum Pulse"
          description="The performance + trends email. Turn it on or off, and choose which members receive it."
        >
          <BrandPulseSection
            brandId={activeBrandId}
            optIn={brandProfile?.emailReportOptIn ?? true}
            recipients={pulseRecipients}
            ownerUserId={brandProfile?.createdBy ?? null}
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
    );
  } else if (initialSection === 'skills') {
    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection
          title="Creative skills"
          description="Reusable creative-direction skills folded into AI Studio generations and agent content. Create your own, browse the first-party library, and edit or archive existing ones."
        >
          <SkillsSettingsSection brandId={activeBrandId} />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'prompts') {
    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection
          title="Prompt library"
          description="Prompts you keep retyping, saved once and shared with the brand. Pick one in the agent composer and it types itself into the box, ready to edit before you send."
        >
          <PromptsSettingsSection brandId={activeBrandId} />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'brand-intelligence') {
    const [brandBook, brandIntelligence] = await Promise.all([
      fetchBrandBook(activeBrandId),
      fetchBrandIntelligenceOverview(activeBrandId),
    ]);

    // Not ready yet (absent, assembling, or errored) → let the empty state kick
    // off a first-time report run. Build the same payload onboarding sends from
    // stored onboarding state, but prefer the canonical brand record name over
    // the mapper's derived fallback.
    let generationPayload: AgentRequestPayload | null = null;
    if ((!brandBook || !brandBook.present) && user?.id) {
      const onboardingState = await fetchOnboardingState(activeBrandId);
      const mapped = mapOnboardingStateToAgentPayload(activeBrandId, user.id, onboardingState);
      const brandName =
        defaultBrandName !== 'Untitled Brand' ? defaultBrandName : mapped.runContext.brand_name;
      generationPayload = {
        ...mapped,
        brandProfile: { ...mapped.brandProfile, brand_name: brandName },
        runContext: { ...mapped.runContext, brand_name: brandName },
      };
    }

    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection
          title="Brand Kit intelligence"
          description="Review the Brand DNA and design-system sources Continuum applies, plus the evidence-derived context that guides them."
        >
          <BrandIntelligenceWorkspace
            brandId={activeBrandId}
            brandName={defaultBrandName}
            brandBook={brandBook}
            initialOverview={brandIntelligence}
          />
          {!brandBook?.present && generationPayload ? (
            <div className="mt-6 border-t border-white/10 pt-6">
              <BrandBookSection
                brandBook={brandBook}
                generation={{
                  brandId: activeBrandId,
                  brandName: defaultBrandName,
                  payload: generationPayload,
                }}
              />
            </div>
          ) : null}
          {/* The approved Brand Book and Design System are the source layer; derived
              intelligence can guide them but does not silently rewrite them. */}
          {activeBrandId ? (
            <div className="mt-6 border-t border-white/10 pt-6">
              <DesignSystemSection brandId={activeBrandId} />
            </div>
          ) : null}
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'integrations') {
    const repo = createBrandProfileRepository();
    const [integrationSummary, members, adNamingSchema] = await Promise.all([
      fetchBrandIntegrationSummary(activeBrandId),
      repo.fetchMembers(activeBrandId),
      fetchBrandAdNamingSchema(activeBrandId, 'meta'),
    ]);
    await ensureOnboardingState(activeBrandId);
    const namingRole =
      members.find((m) => m.id === user?.id || m.email === user?.email)?.role ?? null;
    // Editors (owner/admin/operator) may set the naming convention — matches the
    // ad_naming_schemas write RLS and the paid_naming_schema_set MCP tool.
    const canEditNaming =
      namingRole === 'owner' || namingRole === 'admin' || namingRole === 'operator';

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
            currentUserId={user?.id ?? ''}
          />
        </SettingsSection>
        <SettingsSection
          title="Shared with this brand"
          description="Connections other members have granted to this brand."
        >
          <BrandGrantsSection brandProfileId={activeBrandId} />
        </SettingsSection>
        <SettingsSection
          title="Ad naming convention"
          description="Declare how you name ads so paid-media insights can read them by their named parts."
        >
          <BrandAdNamingSection
            key={activeBrandId}
            brandId={activeBrandId}
            platform="meta"
            initial={adNamingSchema}
            canEdit={canEditNaming}
          />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'knowledge') {
    const documents = await fetchBrandDocuments(activeBrandId);

    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection
          title="Knowledge"
          description="Documents your agents use for app-wide brand intelligence. Files attached in chat appear here as temporary for 14 days — save one to keep it permanently."
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
  } else if (initialSection === 'billing') {
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
  } else if (initialSection === 'profile') {
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
  } else if (initialSection === 'connections') {
    const userIntegrationSummary = user
      ? await fetchUserIntegrationSummary(user.id)
      : createEmptyUserIntegrationSummary();
    const reconnectPrompts = user
      ? await fetchProviderReconnectPrompts(user.id, userIntegrationSummary)
      : [];

    activeSectionSlot = (
      <>
        <SettingsSection
          title="Personal connections"
          description="OAuth providers tied to your account. Assign these to brands from the brand integrations panel."
        >
          <UserConnectionsSwitcher
            integrations={userIntegrationSummary}
            reconnectPrompts={reconnectPrompts}
          />
        </SettingsSection>
        {user?.id ? (
          <SettingsSection
            title="Sharing and removal"
            description="Which brands each connection reaches, and how to take one back."
          >
            <MyConnectionsSharingSection userId={user.id} />
          </SettingsSection>
        ) : null}
        <SettingsSection
          title="Chat request delivery"
          description="Slack and Microsoft Teams identities that can receive Goal questions. Choose the preferred route for this brand."
        >
          <ChatConnectionsSection brandId={activeBrandId} brandName={defaultBrandName} />
        </SettingsSection>
        <SettingsSection
          title="Connected apps"
          description={
            <>
              <GlossaryTooltip termKey="mcp">MCP</GlossaryTooltip> connectors (like Claude) you have
              authorized with your Continuum login. Revoke any you no longer use.
            </>
          }
        >
          <McpConnectionsSection />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'activity') {
    activeSectionSlot = (
      <SettingsSection
        title="MCP activity"
        description={
          <>
            Every tool call made through your connected{' '}
            <GlossaryTooltip termKey="mcp">MCP</GlossaryTooltip> apps — which client, which tool,
            when, and whether it succeeded.
          </>
        }
      >
        <McpActivityTable />
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
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <header className="mb-3 shrink-0 space-y-1">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-muted-foreground">Manage this brand and your personal account.</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Suspense fallback={null}>
          <SettingsShell
            activeSection={initialSection}
            brandPill={<BrandNavPill name={defaultBrandName} logoUrl={brandLogoUrl} />}
            accountPill={<AccountNavPill email={userEmail} />}
            activeSectionSlot={activeSectionSlot}
          />
        </Suspense>
      </div>
    </div>
  );
}
