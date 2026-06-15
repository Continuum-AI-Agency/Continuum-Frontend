import {
  BookOpen,
  Building2,
  CreditCard,
  IdCard,
  Link2,
  Plug,
  ScrollText,
  User,
  type LucideIcon,
} from "lucide-react";

export type SectionDef = {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  scope: "brand" | "account";
};

export const BRAND_SECTIONS = [
  { key: "general", label: "General", icon: IdCard, scope: "brand" },
  { key: "integrations", label: "Integrations", icon: Plug, scope: "brand" },
  { key: "knowledge", label: "Knowledge", icon: BookOpen, scope: "brand" },
  { key: "billing", label: "Billing", icon: CreditCard, scope: "brand" },
] as const satisfies readonly SectionDef[];

export const ACCOUNT_SECTIONS = [
  { key: "profile", label: "Profile", icon: User, scope: "account" },
  { key: "connections", label: "Connections", icon: Link2, scope: "account" },
  { key: "activity", label: "Activity", icon: ScrollText, scope: "account" },
  { key: "brands", label: "Brands", icon: Building2, scope: "account" },
] as const satisfies readonly SectionDef[];

export const ALL_SECTION_KEYS = [
  "general",
  "integrations",
  "knowledge",
  "billing",
  "profile",
  "connections",
  "activity",
  "brands",
] as const;

export type SectionKey = (typeof ALL_SECTION_KEYS)[number];

export const DEFAULT_SECTION: SectionKey = "general";

export function isSectionKey(value: string | undefined | null): value is SectionKey {
  if (!value) return false;
  return (ALL_SECTION_KEYS as readonly string[]).includes(value);
}

export function resolveSection(value: string | string[] | undefined | null): SectionKey {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isSectionKey(candidate) ? candidate : DEFAULT_SECTION;
}
