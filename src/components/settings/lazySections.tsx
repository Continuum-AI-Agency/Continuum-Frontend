'use client';

import dynamic from 'next/dynamic';

// Settings renders ONE section per request, yet every client component the page imports joins
// the route's single client chunk group, so any section paid for all of them. `dynamic` only
// splits on the client side of the boundary (on the server page it changed nothing), so each
// section is re-exported through this client module and downloads its own code when rendered.
// SSR still renders them. BrandBookView alone is 2.6 MB of markdown, diagram and math rendering.
// No `loading` on purpose: a section only mounts through a router transition (SettingsShell's
// router.replace), so a pending chunk suspends to the page's already-revealed boundary and the
// section skeleton simply stays up a moment longer instead of flashing a blank placeholder.
export const BrandAdNamingSection = dynamic(() =>
  import('@/components/settings/brand/BrandAdNamingSection').then((m) => m.BrandAdNamingSection),
);
export const BrandBookView = dynamic(() =>
  import('@/components/settings/brand/BrandBookView').then((m) => m.BrandBookView),
);
export const BrandBillingPanel = dynamic(() =>
  import('@/components/settings/brand/BrandBillingPanel').then((m) => m.BrandBillingPanel),
);
export const BrandDangerZone = dynamic(() =>
  import('@/components/settings/brand/BrandDangerZone').then((m) => m.BrandDangerZone),
);
export const BrandDocumentsSection = dynamic(() =>
  import('@/components/settings/BrandDocumentsSection').then((m) => m.BrandDocumentsSection),
);
export const BrandIdentitySection = dynamic(() =>
  import('@/components/settings/brand/BrandIdentitySection').then((m) => m.BrandIdentitySection),
);
export const BrandIntelligenceWorkspace = dynamic(() =>
  import('@/components/settings/brand/BrandIntelligenceWorkspace').then(
    (m) => m.BrandIntelligenceWorkspace,
  ),
);
export const BrandInvitesSection = dynamic(() =>
  import('@/components/settings/brand/BrandInvitesSection').then((m) => m.BrandInvitesSection),
);
export const BrandMembersSection = dynamic(() =>
  import('@/components/settings/BrandMembersSection').then((m) => m.BrandMembersSection),
);
export const BrandPulseSection = dynamic(() =>
  import('@/components/settings/brand/BrandPulseSection').then((m) => m.BrandPulseSection),
);
export const BrandSlackRoomsSection = dynamic(() =>
  import('@/components/settings/brand/BrandSlackRoomsSection').then(
    (m) => m.BrandSlackRoomsSection,
  ),
);
export const BrandSlackWorkspacesSection = dynamic(() =>
  import('@/components/settings/brand/BrandSlackWorkspacesSection').then(
    (m) => m.BrandSlackWorkspacesSection,
  ),
);
export const ChatConnectionsSection = dynamic(() =>
  import('@/components/settings/account/ChatConnectionsSection').then(
    (m) => m.ChatConnectionsSection,
  ),
);
export const DesignSystemSection = dynamic(() =>
  import('@/components/settings/brand/DesignSystemSection').then((m) => m.DesignSystemSection),
);
export const McpActivityTable = dynamic(() =>
  import('@/components/settings/account/McpActivityTable').then((m) => m.McpActivityTable),
);
export const McpConnectionsSection = dynamic(() =>
  import('@/components/settings/account/McpConnectionsSection').then(
    (m) => m.McpConnectionsSection,
  ),
);
export const NotificationPreferences = dynamic(() =>
  import('@/components/notifications/NotificationPreferences').then(
    (m) => m.NotificationPreferences,
  ),
);
export const OptimizerNotificationsSection = dynamic(() =>
  import('@/components/settings/account/OptimizerNotificationsSection').then(
    (m) => m.OptimizerNotificationsSection,
  ),
);
export const ProjectsSettingsSection = dynamic(() =>
  import('@/components/settings/projects/ProjectsSettingsSection').then(
    (m) => m.ProjectsSettingsSection,
  ),
);
export const PromptsSettingsSection = dynamic(() =>
  import('@/components/settings/brand/PromptsSettingsSection').then(
    (m) => m.PromptsSettingsSection,
  ),
);
export const RoleCapabilityLegend = dynamic(() =>
  import('@/components/settings/RoleCapabilityLegend').then((m) => m.RoleCapabilityLegend),
);
export const RunStrategicAnalysisButton = dynamic(() =>
  import('@/components/strategic-analyses/RunStrategicAnalysisButton').then(
    (m) => m.RunStrategicAnalysisButton,
  ),
);
export const SignOutEverywhereSection = dynamic(() =>
  import('@/components/settings/account/SignOutEverywhereSection').then(
    (m) => m.SignOutEverywhereSection,
  ),
);
export const SkillsSettingsSection = dynamic(() =>
  import('@/components/settings/brand/SkillsSettingsSection').then((m) => m.SkillsSettingsSection),
);
export const UserBrandsPanel = dynamic(() =>
  import('@/components/settings/account/UserBrandsPanel').then((m) => m.UserBrandsPanel),
);
export const UserConnectionsSwitcher = dynamic(() =>
  import('@/components/settings/account/UserConnectionsSwitcher').then(
    (m) => m.UserConnectionsSwitcher,
  ),
);
export const UserProfileSection = dynamic(() =>
  import('@/components/settings/account/UserProfileSection').then((m) => m.UserProfileSection),
);
