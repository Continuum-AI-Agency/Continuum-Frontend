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
  type LucideIcon,
} from "lucide-react";

export type AppNavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  quickTabs?: boolean;
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
  },
  {
    label: "Organic Content",
    href: "/organic",
    icon: Sprout,
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
        label: "Jaina",
        href: "/paid-media?tab=jaina",
        icon: Bot,
      },
    ],
  },
  {
    label: "Primitives",
    href: "/primitives",
    icon: Blocks,
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
