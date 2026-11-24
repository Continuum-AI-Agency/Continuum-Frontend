'use client';

import dynamic from 'next/dynamic';
import type { SectionKey } from '@/components/settings/shell/sections';

// Settings renders ONE section per request, yet every client component the page imports joins
// the route's single client chunk group, so any section paid for all of them. `dynamic` only
// splits on the client side of the boundary (on the server page it changed nothing), so each
// section is re-exported through this client module and downloads its own code when rendered.
// SSR still renders them. BrandBookView alone is 2.6 MB of markdown, diagram and math rendering.
// No `loading` on purpose: a section only mounts through a router transition (SettingsShell's
// router.replace), so a pending chunk suspends to the page's already-revealed boundary and the
// section skeleton simply stays up a moment longer instead of flashing a blank placeholder.
// The nav warms a section's imports on intent (warmSection), so its code is usually loaded
// before the server answers the switch.

const load = {
  BrandAdNamingSection: () => import('@/components/settings/brand/BrandAdNamingSection'),
  BrandBookView: () => import('@/components/settings/brand/BrandBookView'),
  BrandBillingPanel: () => import('@/components/settings/brand/BrandBillingPanel'),
  BrandDangerZone: () => import('@/components/settings/brand/BrandDangerZone'),
  BrandDocumentsSection: () => import('@/components/settings/BrandDocumentsSection'),
  BrandIdentitySection: () => import('@/components/settings/brand/BrandIdentitySection'),
  BrandIntelligenceWorkspace: () =>
    import('@/components/settings/brand/BrandIntelligenceWorkspace'),
  BrandInvitesSection: () => import('@/components/settings/brand/BrandInvitesSection'),
  BrandMembersSection: () => import('@/components/settings/BrandMembersSection'),
  BrandPulseSection: () => import('@/components/settings/brand/BrandPulseSection'),
  BrandSlackRoomsSection: () => import('@/components/settings/brand/BrandSlackRoomsSection'),
  BrandSlackWorkspacesSection: () =>
    import('@/components/settings/brand/BrandSlackWorkspacesSection'),
  ChatConnectionsSection: () => import('@/components/settings/account/ChatConnectionsSection'),
  DesignSystemSection: () => import('@/components/settings/brand/DesignSystemSection'),
  McpActivityTable: () => import('@/components/settings/account/McpActivityTable'),
  McpConnectionsSection: () => import('@/components/settings/account/McpConnectionsSection'),
  NotificationPreferences: () => import('@/components/notifications/NotificationPreferences'),
  OptimizerNotificationsSection: () =>
    import('@/components/settings/account/OptimizerNotificationsSection'),
  ProjectsSettingsSection: () => import('@/components/settings/projects/ProjectsSettingsSection'),
  PromptsSettingsSection: () => import('@/components/settings/brand/PromptsSettingsSection'),
  RoleCapabilityLegend: () => import('@/components/settings/RoleCapabilityLegend'),
  RunStrategicAnalysisButton: () =>
    import('@/components/strategic-analyses/RunStrategicAnalysisButton'),
  SignOutEverywhereSection: () => import('@/components/settings/account/SignOutEverywhereSection'),
  SkillsSettingsSection: () => import('@/components/settings/brand/SkillsSettingsSection'),
  UserBrandsPanel: () => import('@/components/settings/account/UserBrandsPanel'),
  UserConnectionsSwitcher: () => import('@/components/settings/account/UserConnectionsSwitcher'),
  UserProfileSection: () => import('@/components/settings/account/UserProfileSection'),
};

export const BrandAdNamingSection = dynamic(() =>
  load.BrandAdNamingSection().then((m) => m.BrandAdNamingSection),
);
export const BrandBookView = dynamic(() => load.BrandBookView().then((m) => m.BrandBookView));
export const BrandBillingPanel = dynamic(() =>
  load.BrandBillingPanel().then((m) => m.BrandBillingPanel),
);
export const BrandDangerZone = dynamic(() => load.BrandDangerZone().then((m) => m.BrandDangerZone));
export const BrandDocumentsSection = dynamic(() =>
  load.BrandDocumentsSection().then((m) => m.BrandDocumentsSection),
);
export const BrandIdentitySection = dynamic(() =>
  load.BrandIdentitySection().then((m) => m.BrandIdentitySection),
);
export const BrandIntelligenceWorkspace = dynamic(() =>
  load.BrandIntelligenceWorkspace().then((m) => m.BrandIntelligenceWorkspace),
);
export const BrandInvitesSection = dynamic(() =>
  load.BrandInvitesSection().then((m) => m.BrandInvitesSection),
);
export const BrandMembersSection = dynamic(() =>
  load.BrandMembersSection().then((m) => m.BrandMembersSection),
);
export const BrandPulseSection = dynamic(() =>
  load.BrandPulseSection().then((m) => m.BrandPulseSection),
);
export const BrandSlackRoomsSection = dynamic(() =>
  load.BrandSlackRoomsSection().then((m) => m.BrandSlackRoomsSection),
);
export const BrandSlackWorkspacesSection = dynamic(() =>
  load.BrandSlackWorkspacesSection().then((m) => m.BrandSlackWorkspacesSection),
);
export const ChatConnectionsSection = dynamic(() =>
  load.ChatConnectionsSection().then((m) => m.ChatConnectionsSection),
);
export const DesignSystemSection = dynamic(() =>
  load.DesignSystemSection().then((m) => m.DesignSystemSection),
);
export const McpActivityTable = dynamic(() =>
  load.McpActivityTable().then((m) => m.McpActivityTable),
);
export const McpConnectionsSection = dynamic(() =>
  load.McpConnectionsSection().then((m) => m.McpConnectionsSection),
);
export const NotificationPreferences = dynamic(() =>
  load.NotificationPreferences().then((m) => m.NotificationPreferences),
);
export const OptimizerNotificationsSection = dynamic(() =>
  load.OptimizerNotificationsSection().then((m) => m.OptimizerNotificationsSection),
);
export const ProjectsSettingsSection = dynamic(() =>
  load.ProjectsSettingsSection().then((m) => m.ProjectsSettingsSection),
);
export const PromptsSettingsSection = dynamic(() =>
  load.PromptsSettingsSection().then((m) => m.PromptsSettingsSection),
);
export const RoleCapabilityLegend = dynamic(() =>
  load.RoleCapabilityLegend().then((m) => m.RoleCapabilityLegend),
);
export const RunStrategicAnalysisButton = dynamic(() =>
  load.RunStrategicAnalysisButton().then((m) => m.RunStrategicAnalysisButton),
);
export const SignOutEverywhereSection = dynamic(() =>
  load.SignOutEverywhereSection().then((m) => m.SignOutEverywhereSection),
);
export const SkillsSettingsSection = dynamic(() =>
  load.SkillsSettingsSection().then((m) => m.SkillsSettingsSection),
);
export const UserBrandsPanel = dynamic(() => load.UserBrandsPanel().then((m) => m.UserBrandsPanel));
export const UserConnectionsSwitcher = dynamic(() =>
  load.UserConnectionsSwitcher().then((m) => m.UserConnectionsSwitcher),
);
export const UserProfileSection = dynamic(() =>
  load.UserProfileSection().then((m) => m.UserProfileSection),
);

// Activation and Drive render only server components: nothing to warm.
const sectionImports: Partial<Record<SectionKey, Array<keyof typeof load>>> = {
  general: [
    'BrandIdentitySection',
    'BrandMembersSection',
    'RoleCapabilityLegend',
    'BrandPulseSection',
    'BrandInvitesSection',
    'BrandDangerZone',
  ],
  projects: ['ProjectsSettingsSection'],
  skills: ['SkillsSettingsSection'],
  prompts: ['PromptsSettingsSection'],
  'brand-intelligence': ['BrandIntelligenceWorkspace', 'BrandBookView', 'DesignSystemSection'],
  integrations: ['BrandSlackWorkspacesSection', 'BrandSlackRoomsSection', 'BrandAdNamingSection'],
  knowledge: ['RunStrategicAnalysisButton', 'BrandDocumentsSection'],
  billing: ['BrandBillingPanel'],
  profile: ['UserProfileSection', 'SignOutEverywhereSection'],
  connections: [
    'UserConnectionsSwitcher',
    'ChatConnectionsSection',
    'OptimizerNotificationsSection',
    'McpConnectionsSection',
  ],
  notifications: ['NotificationPreferences'],
  activity: ['McpActivityTable'],
  brands: ['UserBrandsPanel'],
};

export function warmSection(section: SectionKey) {
  return Promise.all((sectionImports[section] ?? []).map((name) => load[name]()));
}
