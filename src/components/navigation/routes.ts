import {
  Home,
  Settings,
  ShieldCheck,
  Plug,
  Sparkles,
  Sprout,
  Target,
  Activity,
  Bot,
  CalendarDays,
  ChartColumn,
  Blocks,
  Users,
  FileText,
  User,
  Package,
  CircleCheck,
  Images,
  Eye,
  type LucideIcon,
} from "lucide-react";

const COMPETITOR_SPY_ENABLED =
  (process.env.NEXT_PUBLIC_COMPETITOR_AD_SPY_ENABLED ?? "").toLowerCase() === "true";

export type AppNavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  quickTabs?: boolean;
  accentColor?: string;
  badge?: {
    label: string;
    tone?: "green" | "red" | "blue" | "violet";
  };
  description?: string;
  items?: {
    label: string;
    href: string;
    icon: LucideIcon;
  }[];
  adminOnly?: boolean;
};

export const APP_NAVIGATION: AppNavigationItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: Home,
  },
  {
    label: "Creative Studio",
    href: "/ai-studio",
    icon: Sparkles,
    accentColor: "text-violet-500",
  },
  {
    label: "Organic Content",
    href: "/organic",
    icon: Sprout,
    accentColor: "text-emerald-500",
    quickTabs: true,
    items: [
      {
        label: "Metrics Dashboard",
        href: "/organic?tab=metrics",
        icon: ChartColumn,
      },
      {
        label: "Planner",
        href: "/organic?tab=planner",
        icon: CalendarDays,
      },
    ],
  },
  {
    label: "Campaigns",
    href: "/paid-media",
    icon: Target,
    accentColor: "text-amber-500",
    quickTabs: true,
    badge: {
      label: "Beta",
      tone: "violet",
    },
    items: [
      {
        label: "Observability",
        href: "/paid-media?tab=dashboard",
        icon: Activity,
      },
      {
        label: "Approvals",
        href: "/paid-media/approvals",
        icon: CircleCheck,
      },
      {
        label: "Jaina",
        href: "/paid-media?tab=jaina",
        icon: Bot,
      },
    ],
  },
  ...((COMPETITOR_SPY_ENABLED
    ? [
        {
          label: "Competitor Spy",
          href: "/competitor-spy",
          icon: Eye,
          accentColor: "text-cyan-500",
          badge: { label: "Beta", tone: "violet" },
          description: "Track competitors' paid ad creatives and how they evolve over time.",
        },
      ]
    : []) as AppNavigationItem[]),
  {
    label: "Library",
    href: "/library",
    icon: Images,
    accentColor: "text-rose-500",
    description: "Semantically-understood media library for your brand assets.",
  },
  {
    label: "Primitives",
    href: "/primitives",
    icon: Blocks,
    accentColor: "text-sky-500",
    badge: {
      label: "MVP",
      tone: "blue",
    },
    description: "Shared building blocks for paid media (audiences, guidelines, personas).",
    items: [
      {
        label: "Audiences",
        href: "/primitives?tab=audiences",
        icon: Users,
      },
      {
        label: "Brand Guidelines",
        href: "/primitives?tab=guidelines",
        icon: FileText,
      },
      {
        label: "Personas",
        href: "/primitives?tab=personas",
        icon: User,
      },
      {
        label: "Products",
        href: "/primitives?tab=products",
        icon: Package,
      },
    ],
  },
];

export const APP_NAVIGATION_FOOTER: AppNavigationItem[] = [
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
  {
    label: "Integrations",
    href: "/settings/integrations",
    icon: Plug,
  },
  {
    label: "Admin",
    href: "/admin",
    icon: ShieldCheck,
    adminOnly: true,
  },
];
