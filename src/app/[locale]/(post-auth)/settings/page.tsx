import { cookies } from 'next/headers';
import { getTranslations as getBetaTranslations, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { BrandGrantsSection } from '@/components/integrations/BrandGrantsSection';
import { MyConnectionsSharingSection } from '@/components/integrations/MyConnectionsSharingSection';
import { NotificationPreferences } from '@/components/notifications/NotificationPreferences';
import { ChatConnectionsSection } from '@/components/settings/account/ChatConnectionsSection';
import { McpActivityTable } from '@/components/settings/account/McpActivityTable';
import { McpConnectionsSection } from '@/components/settings/account/McpConnectionsSection';
import { OptimizerNotificationsSection } from '@/components/settings/account/OptimizerNotificationsSection';
import { SignOutEverywhereSection } from '@/components/settings/account/SignOutEverywhereSection';
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
import { BrandSlackRoomsSection } from '@/components/settings/brand/BrandSlackRoomsSection';
import { BrandSlackWorkspacesSection } from '@/components/settings/brand/BrandSlackWorkspacesSection';
import { DesignSystemSection } from '@/components/settings/brand/DesignSystemSection';
import { PromptsSettingsSection } from '@/components/settings/brand/PromptsSettingsSection';
import { SkillsSettingsSection } from '@/components/settings/brand/SkillsSettingsSection';
import { ProjectsSettingsSection } from '@/components/settings/projects/ProjectsSettingsSection';
import { RoleCapabilityLegend } from '@/components/settings/RoleCapabilityLegend';
import { AccountNavPill } from '@/components/settings/shell/AccountNavPill';
import { BrandNavPill } from '@/components/settings/shell/BrandNavPill';
import { SettingsSection } from '@/components/settings/shell/SettingsSection';
import { SettingsShell } from '@/components/settings/shell/SettingsShell';
import { resolveSection } from '@/components/settings/shell/sections';
import { GlossaryTooltip } from '@/components/shared/glossary';
import { RunStrategicAnalysisButton } from '@/components/strategic-analyses/RunStrategicAnalysisButton';
import { isImpersonationMarked } from '@/lib/auth/impersonation';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { fetchBrandAdNamingSchema } from '@/lib/brands/adNaming';
import { fetchBrandBook } from '@/lib/brands/brandBook';
import { fetchBrandIntelligenceOverview } from '@/lib/brands/brandIntelligence.server.ts';
import { fetchBrandDocuments } from '@/lib/brands/documents';
import { fetchBrandInviteLedger } from '@/lib/brands/members';
import { fetchBrandProfileDetails } from '@/lib/brands/profile';
import { fetchPulseRecipients } from '@/lib/brands/pulseRecipients';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import {
  createEmptyUserIntegrationSummary,
  fetchFigmaAccountNames,
  fetchProviderReconnectPrompts,
  fetchUserIntegrationSummary,
} from '@/lib/integrations/userIntegrations';
import type { AgentRequestPayload } from '@/lib/onboarding/agentClient';
import { mapOnboardingStateToAgentPayload } from '@/lib/onboarding/mapping';
import { ensureOnboardingState, fetchOnboardingState } from '@/lib/onboarding/storage';
import { createBrandProfileRepository } from '@/lib/repositories/brandProfile';
import { DriveSettings } from './drive/DriveSettings';

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type SettingsPageProps = {
  searchParams?: Promise<{ section?: string | string[] }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const betaUiText = await getBetaTranslations('settings');

  const tUi = await getTranslations('settings');

  const { activeBrandId, brandSummaries, permissions, brandAccess, user } =
    await getActiveBrandContext();
  const params = await searchParams;
  const initialSection = resolveSection(params?.section);

  if (!activeBrandId) {
    return (
      <div className="w-full px-3 py-10 sm:px-4 lg:px-6">
        <h1 className="text-2xl font-semibold">{tUi('m_c7f73bb54d')}</h1>
        <p className="text-muted-foreground">{tUi('m_2811a1ee09')}</p>
      </div>
    );
  }

  const activeBrand = brandSummaries.find((b) => b.id === activeBrandId);
  const defaultBrandName = activeBrand?.name ?? tUi('m_8b8c5b2bb7');
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
        <SettingsSection title={tUi('m_b9d3621863')} description={tUi('m_a0f6d1a356')}>
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
        <SettingsSection title={tUi('m_4b1efd53a2')} description={tUi('m_6a1ca7f0a2')}>
          <BrandIdentitySection
            key={activeBrandId}
            brandName={brandName}
            logoPath={brandProfile?.logoPath ?? null}
            profile={brandProfile ?? undefined}
            canEdit={canEdit}
            contentLanguage={brandProfile?.contentLanguage ?? null}
          />
        </SettingsSection>
        <SettingsSection title={tUi('m_1cb449c112')} description={tUi('m_944da61507')}>
          <BrandMembersSection brandId={activeBrandId} members={members} canEdit={canEdit} />
          <RoleCapabilityLegend />
        </SettingsSection>
        <SettingsSection title={tUi('m_b1730daf81')} description={tUi('m_7343c12bb1')}>
          <BrandPulseSection
            brandId={activeBrandId}
            optIn={brandProfile?.emailReportOptIn ?? true}
            recipients={pulseRecipients}
            ownerUserId={brandProfile?.createdBy ?? null}
            canEdit={canEdit}
          />
        </SettingsSection>
        <SettingsSection title={tUi('m_9b69a35ab5')} description={tUi('m_39c50163d9')}>
          <BrandInvitesSection invites={invites} canEdit={canEdit} />
        </SettingsSection>
        {canDelete ? (
          <SettingsSection title={tUi('m_963a652eae')} description={tUi('m_bc3d6d79a9')}>
            <BrandDangerZone
              brandName={brandName}
              hasProfile={Boolean(brandProfile)}
              canDelete={canDelete}
            />
          </SettingsSection>
        ) : null}
      </>
    );
  } else if (initialSection === 'projects') {
    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection title={tUi('m_53e890d5f0')} description={tUi('m_62af1136e7')}>
          <ProjectsSettingsSection brandId={activeBrandId} />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'skills') {
    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection title={tUi('m_8d39314955')} description={tUi('m_7104f736cb')}>
          <SkillsSettingsSection brandId={activeBrandId} />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'prompts') {
    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection title={tUi('m_f693e7340a')} description={tUi('m_78aaf9c185')}>
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
      const canonicalBrandName = activeBrand?.name;
      const brandName =
        canonicalBrandName && canonicalBrandName !== 'Untitled Brand'
          ? canonicalBrandName
          : mapped.runContext.brand_name;
      generationPayload = {
        ...mapped,
        brandProfile: { ...mapped.brandProfile, brand_name: brandName },
        runContext: { ...mapped.runContext, brand_name: brandName },
      };
    }

    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection title={tUi('m_3c41409a2e')} description={tUi('m_887acf7fca')}>
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
    // Slack rooms are gated by `assertCanManageRooms` on the Backend — the same three roles, but a
    // separate policy from naming, so it is derived separately rather than aliased.
    const canManageSlackRooms =
      namingRole === 'owner' || namingRole === 'admin' || namingRole === 'operator';

    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection title={tUi('m_b3d2a2c0b3')} description={tUi('m_85e84b359e')}>
          <BrandIntegrationsSwitcher
            initialSummary={integrationSummary}
            members={members}
            currentUserId={user?.id ?? ''}
          />
        </SettingsSection>
        <SettingsSection title={tUi('m_ed20ee5ffe')} description={tUi('m_3df65c88be')}>
          <BrandGrantsSection brandProfileId={activeBrandId} />
        </SettingsSection>
        <SettingsSection title={tUi('m_b0317efbf5')} description={tUi('m_c124d3fb89')}>
          <BrandSlackWorkspacesSection
            key={activeBrandId}
            brandId={activeBrandId}
            canManage={namingRole === 'owner' || namingRole === 'admin'}
          />
        </SettingsSection>
        <SettingsSection title={tUi('m_600ba8d6dd')} description={tUi('m_1042ccfbfd')}>
          {/* Operator-gated, unlike connecting a workspace above — an operator runs the
              day-to-day delivery without owning the install. */}
          <BrandSlackRoomsSection
            key={activeBrandId}
            brandId={activeBrandId}
            canManage={canManageSlackRooms}
          />
        </SettingsSection>
        <SettingsSection title={tUi('m_7b3ee90365')} description={tUi('m_b3fd19e480')}>
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
          title={tUi('m_dec1fccaba')}
          description={tUi('m_d4d6eb332b')}
          action={<RunStrategicAnalysisButton brandProfileId={activeBrandId} compact />}
        >
          <BrandDocumentsSection brandId={activeBrandId} documents={documents} />
        </SettingsSection>
        <SettingsSection title={tUi('m_03693dc0e0')} description={tUi('m_cb4956899a')}>
          <BrandGuidelineSection brandId={activeBrandId} />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'billing') {
    activeSectionSlot = (
      <>
        {createBrandHeader(defaultBrandName)}
        <SettingsSection title={tUi('m_1448f8b233')} description={tUi('m_051916a367')}>
          <BrandBillingPanel billingLive={brandAccess.billingLive} />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'profile') {
    const impersonating = isImpersonationMarked(await cookies());

    activeSectionSlot = (
      <>
        <SettingsSection
          title={betaUiText('beta_528d89ad72cb')}
          description={betaUiText('beta_36f529d74969')}
        >
          <UserProfileSection
            email={userEmail}
            name={user?.user_metadata?.full_name ?? null}
            lastSignIn={null}
          />
        </SettingsSection>
        <SettingsSection title={betaUiText('beta_6fa3cbf451b2')}>
          <SignOutEverywhereSection impersonating={impersonating} />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'connections') {
    const userIntegrationSummary = user
      ? await fetchUserIntegrationSummary(user.id)
      : createEmptyUserIntegrationSummary();
    const reconnectPrompts = user
      ? await fetchProviderReconnectPrompts(user.id, userIntegrationSummary)
      : [];
    const figmaAccounts = user ? await fetchFigmaAccountNames(user.id) : [];

    activeSectionSlot = (
      <>
        <SettingsSection title={tUi('m_0e0a6ba495')} description={tUi('m_f385058e96')}>
          <UserConnectionsSwitcher
            integrations={userIntegrationSummary}
            reconnectPrompts={reconnectPrompts}
            figmaAccounts={figmaAccounts}
          />
        </SettingsSection>
        {user?.id ? <MyConnectionsSharingSection userId={user.id} /> : null}
        <SettingsSection title={tUi('m_6c017c7903')} description={tUi('m_fcf432b361')}>
          <ChatConnectionsSection brandId={activeBrandId} brandName={defaultBrandName} />
        </SettingsSection>
        <SettingsSection title={tUi('m_fc3d3059eb')} description={tUi('m_5723bb19c6')}>
          <OptimizerNotificationsSection brandId={activeBrandId} brandName={defaultBrandName} />
        </SettingsSection>
        <SettingsSection
          title={tUi('m_8f5e8efc6c')}
          description={
            <>
              <GlossaryTooltip termKey="mcp">MCP</GlossaryTooltip>
              {tUi('m_6b83e2ea1c')}
            </>
          }
        >
          <McpConnectionsSection />
        </SettingsSection>
      </>
    );
  } else if (initialSection === 'drive') {
    activeSectionSlot = <DriveSettings email={userEmail} />;
  } else if (initialSection === 'notifications') {
    activeSectionSlot = (
      <SettingsSection title={tUi('m_753a22b2eb')} description={tUi('m_014e36fa40')}>
        <NotificationPreferences />
      </SettingsSection>
    );
  } else if (initialSection === 'activity') {
    activeSectionSlot = (
      <SettingsSection
        title={tUi('m_f12eb2ef76')}
        description={
          <>
            {tUi('m_25eb052cce')} <GlossaryTooltip termKey="mcp">MCP</GlossaryTooltip>
            {tUi('m_5281630551')}
          </>
        }
      >
        <McpActivityTable />
      </SettingsSection>
    );
  } else {
    activeSectionSlot = (
      <SettingsSection title={tUi('m_4d9e35c63c')} description={tUi('m_03080d6fe4')}>
        <UserBrandsPanel permissions={permissions} />
      </SettingsSection>
    );
  }

  return (
    <div className="flex h-[var(--app-content-h)] min-h-0 w-full max-w-none flex-col overflow-hidden px-[var(--page-pad-inline)] py-[var(--page-pad-block)]">
      <header className="mb-3 shrink-0 space-y-1">
        <h1 className="text-xl font-semibold text-white">{tUi('m_c7f73bb54d')}</h1>
        <p className="text-muted-foreground">{tUi('m_f65f5e6445')}</p>
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
