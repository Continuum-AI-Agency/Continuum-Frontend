import { Flex, Grid, Heading, Text } from "@radix-ui/themes";
import BrandSettingsPanel from "@/components/settings/BrandSettingsPanel";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { BrandIntegrationsSection } from "@/components/settings/BrandIntegrationsSection";
import { RunStrategicAnalysisButton } from "@/components/strategic-analyses/RunStrategicAnalysisButton";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { fetchBrandProfileDetails } from "@/lib/brands/profile";
import { fetchBrandDocuments } from "@/lib/brands/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UserSettingsPanel } from "@/components/settings/UserSettingsPanel";
import { createEmptyUserIntegrationSummary, fetchUserIntegrationSummary } from "@/lib/integrations/userIntegrations";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { createBrandProfileRepository } from "@/lib/repositories/brandProfile";
import { 
  SettingsTabs, 
  SettingsTabsList, 
  SettingsTabsTrigger, 
  SettingsTabsContent 
} from "@/components/settings/SettingsTabs";
import { BrandDocumentsSection } from "@/components/settings/BrandDocumentsSection";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  const { activeBrandId } = await getActiveBrandContext();

  if (!activeBrandId) {
    return (
    <div className="py-10 px-3 sm:px-4 lg:px-6 w-full">
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
    invites
  ] = await Promise.all([
    fetchBrandIntegrationSummary(activeBrandId),
    fetchBrandProfileDetails(activeBrandId),
    fetchBrandDocuments(activeBrandId),
    repo.fetchMembers(activeBrandId),
    repo.fetchInvites(activeBrandId)
  ]);
  
  const currentUserRole =
    members.find(
      member => member.id === userData?.user?.id || member.email === userData?.user?.email
    )?.role ?? null;

  const userIntegrationSummary = userData?.user
    ? await fetchUserIntegrationSummary(userData.user.id)
    : createEmptyUserIntegrationSummary();

  return (
    <div className="py-10 w-full max-w-none px-3 sm:px-4 lg:px-6">
      <Flex direction="column" gap="7">
        <div>
          <Heading size="7" className="text-white">Settings</Heading>
          <Text color="gray">Invite teammates, manage brand profiles, and update your own integrations.</Text>
        </div>
        <SettingsTabs>
          <SettingsTabsList>
            <SettingsTabsTrigger value="brand">Brand</SettingsTabsTrigger>
            <SettingsTabsTrigger value="knowledge">Knowledge</SettingsTabsTrigger>
            <SettingsTabsTrigger value="you">You</SettingsTabsTrigger>
          </SettingsTabsList>
          <SettingsTabsContent value="brand" className="mt-3">
            <Grid columns={{ initial: "1", lg: "12" }} gap="6" align="start">
              <GlassPanel className="p-6 h-full lg:col-span-7 xl:col-span-8">
                <BrandSettingsPanel
                  data={{
                    brandName: brandProfile?.name ?? "Untitled Brand",
                    logoPath: brandProfile?.logoPath ?? null,
                    members,
                    invites,
                    profile: brandProfile ?? undefined,
                    currentUserRole,
                  }}
                />
              </GlassPanel>
              <GlassPanel className="p-6 h-full lg:col-span-5 xl:col-span-4">
                <BrandIntegrationsSection initialSummary={integrationSummary} />
              </GlassPanel>
              <GlassPanel className="p-6 lg:col-span-12">
                <RunStrategicAnalysisButton brandProfileId={activeBrandId} />
              </GlassPanel>
            </Grid>
          </SettingsTabsContent>
          <SettingsTabsContent value="knowledge" className="mt-3">
              <GlassPanel className="p-6">
              <BrandDocumentsSection 
                brandId={activeBrandId} 
                documents={documents} 
              />
            </GlassPanel>
          </SettingsTabsContent>
          <SettingsTabsContent value="you" className="mt-3">
            <GlassPanel className="p-6">
              <UserSettingsPanel
                user={{
                  email: userData?.user?.email ?? "Unknown",
                  name: userData?.user?.user_metadata?.full_name ?? null,
                  lastSignIn: userData?.user?.last_sign_in_at ?? null,
                }}
                integrations={userIntegrationSummary}
              />
            </GlassPanel>
          </SettingsTabsContent>
        </SettingsTabs>
      </Flex>
    </div>
  );
}
