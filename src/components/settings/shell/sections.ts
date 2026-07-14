import {
  BookOpen,
  BookText,
  Building2,
  CreditCard,
  IdCard,
  Library,
  Link2,
  type LucideIcon,
  Plug,
  Rocket,
  ScrollText,
  Sparkles,
  User,
} from 'lucide-react';

export type SectionDef = {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  scope: 'brand' | 'account';
};

export const BRAND_SECTIONS = [
  { key: 'activation', label: 'Activation', icon: Rocket, scope: 'brand' },
  { key: 'general', label: 'General', icon: IdCard, scope: 'brand' },
  { key: 'brand-book', label: 'Brand Book', icon: Library, scope: 'brand' },
  { key: 'skills', label: 'Skills', icon: Sparkles, scope: 'brand' },
  { key: 'prompts', label: 'Prompts', icon: BookText, scope: 'brand' },
  { key: 'integrations', label: 'Integrations', icon: Plug, scope: 'brand' },
  { key: 'knowledge', label: 'Knowledge', icon: BookOpen, scope: 'brand' },
  { key: 'billing', label: 'Billing', icon: CreditCard, scope: 'brand' },
] as const satisfies readonly SectionDef[];

export const ACCOUNT_SECTIONS = [
  { key: 'profile', label: 'Profile', icon: User, scope: 'account' },
  { key: 'connections', label: 'Connections', icon: Link2, scope: 'account' },
  { key: 'activity', label: 'Activity', icon: ScrollText, scope: 'account' },
  { key: 'brands', label: 'Brands', icon: Building2, scope: 'account' },
] as const satisfies readonly SectionDef[];

export const ALL_SECTION_KEYS = [
  'activation',
  'general',
  'brand-book',
  'skills',
  'prompts',
  'integrations',
  'knowledge',
  'billing',
  'profile',
  'connections',
  'activity',
  'brands',
] as const;

export type SectionKey = (typeof ALL_SECTION_KEYS)[number];

export const DEFAULT_SECTION: SectionKey = 'general';

export function isSectionKey(value: string | undefined | null): value is SectionKey {
  if (!value) return false;
  return (ALL_SECTION_KEYS as readonly string[]).includes(value);
}

export function resolveSection(value: string | string[] | undefined | null): SectionKey {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isSectionKey(candidate) ? candidate : DEFAULT_SECTION;
}
