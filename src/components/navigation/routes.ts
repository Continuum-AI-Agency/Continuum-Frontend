import {
  Home,
  Settings,
  ShieldCheck,
  Frame,
  Sprout,
  TrendingUp,
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
  type LucideIcon,
} from "lucide-react";

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
  // Greyed-out, non-interactive nav entry (e.g. not yet available).
  disabled?: boolean;
};

export type AppNavigationGroup = {
  label: string | null;
  items: AppNavigationItem[];
};

// The four product areas. Order and labels are the canonical IA.
export const APP_NAVIGATION_PRIMARY: AppNavigationItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: Home,
  },
  {
    label: "Canvas",
    href: "/ai-studio",
    icon: Frame,
    accentColor: "text-violet-500",
  },
  {
    label: "Organic",
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
    label: "Scale",
    href: "/scale",
    icon: TrendingUp,
    accentColor: "text-amber-500",
    quickTabs: true,
    items: [
      {
        label: "Observability",
        href: "/scale?tab=dashboard",
        icon: Activity,
      },
      {
        label: "Approvals",
        href: "/scale/approvals",
        icon: CircleCheck,
      },
      {
        label: "Jaina",
        href: "/scale?tab=jaina",
        icon: Bot,
      },
    ],
  },
];

// Cross-cutting tools that support the four areas, demoted below them.
export const APP_NAVIGATION_SECONDARY: AppNavigationItem[] = [
  {
    label: "Library",
    href: "/library",
    icon: Images,
    accentColor: "text-rose-500",
    description: "Media library + competitor inspiration for your brand.",
  },
  {
    label: "Primitives",
    href: "/primitives",
    icon: Blocks,
    accentColor: "text-sky-500",
    disabled: true,
    badge: {
      label: "Soon",
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

// Visual grouping consumed by AppSidebar. A null label renders no header.
export const APP_NAVIGATION_GROUPS: AppNavigationGroup[] = [
  { label: null, items: APP_NAVIGATION_PRIMARY },
  { label: "Resources", items: APP_NAVIGATION_SECONDARY },
];

// Flat list for non-grouped consumers (breadcrumb, command palette).
export const APP_NAVIGATION: AppNavigationItem[] = [
  ...APP_NAVIGATION_PRIMARY,
  ...APP_NAVIGATION_SECONDARY,
];

export const APP_NAVIGATION_FOOTER: AppNavigationItem[] = [
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
  {
    label: "Admin",
    href: "/admin",
    icon: ShieldCheck,
    adminOnly: true,
  },
];

type SearchParamsLike = { get(key: string): string | null };

// Active when the current location matches the item href. Dashboard matches
// only on exact equality; query-bearing hrefs require every param to match;
// otherwise the path matches exactly or as a parent prefix.
export function isRouteActive(
  currentPath: string,
  currentSearchParams: SearchParamsLike,
  item: { href: string },
): boolean {
  if (item.href === "/dashboard") {
    return currentPath === item.href;
  }

  if (item.href.includes("?")) {
    const [path, query] = item.href.split("?");
    const itemParams = new URLSearchParams(query);

    if (currentPath !== path) return false;

    for (const [key, value] of itemParams.entries()) {
      if (currentSearchParams.get(key) !== value) {
        return false;
      }
    }
    return true;
  }

  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}
