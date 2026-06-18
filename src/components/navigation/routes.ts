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
  Code,
  Gauge,
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
  // Renders a lock affordance on a disabled entry (coming-soon, gated surface).
  locked?: boolean;
};

export type AppNavigationGroup = {
  label: string | null;
  items: AppNavigationItem[];
};

// Sub-routes for the Organic section. Shown as flat nested items under the
// "Organic" section header (Hessian-style), and reused as the parent's items
// for breadcrumb resolution.
const ORGANIC_ITEMS: AppNavigationItem[] = [
  { label: "Agent", href: "/organic?tab=agent", icon: Bot, accentColor: "text-emerald-500" },
  { label: "Analytics", href: "/organic?tab=metrics", icon: ChartColumn, accentColor: "text-emerald-500" },
  { label: "Calendar", href: "/organic?tab=planner", icon: CalendarDays, accentColor: "text-emerald-500" },
];

// Sub-routes for the Scale section. "Optimization" is the campaign performance
// surface (the Scale page tab formerly labeled "Performance").
const SCALE_ITEMS: AppNavigationItem[] = [
  { label: "Agent", href: "/scale?tab=jaina", icon: Bot, accentColor: "text-amber-500" },
  { label: "Analytics", href: "/scale?tab=dashboard", icon: Activity, accentColor: "text-amber-500" },
  { label: "Optimization", href: "/scale?tab=performance", icon: Gauge, accentColor: "text-amber-500" },
];

const HOME: AppNavigationItem = { label: "Home", href: "/dashboard", icon: Home };
const CANVAS: AppNavigationItem = {
  label: "Canvas",
  href: "/ai-studio",
  icon: Frame,
  accentColor: "text-violet-500",
};
const LIBRARY: AppNavigationItem = {
  label: "Library",
  href: "/library",
  icon: Images,
  accentColor: "text-rose-500",
  description: "Media library + competitor inspiration for your brand.",
};

// Parent area entries — used by the flat list (breadcrumb + command palette).
// In the sidebar these render as section headers; the flat entries keep their
// canonical /organic and /scale hrefs so the breadcrumb resolves by pathname.
const ORGANIC: AppNavigationItem = {
  label: "Organic",
  href: "/organic",
  icon: Sprout,
  accentColor: "text-emerald-500",
  items: ORGANIC_ITEMS,
};
const SCALE: AppNavigationItem = {
  label: "Scale",
  href: "/scale",
  icon: TrendingUp,
  accentColor: "text-amber-500",
  items: SCALE_ITEMS,
};

// Locked developer surface. Greyed-out and non-interactive until released.
const DEVELOPERS: AppNavigationItem = {
  label: "Developers",
  href: "/developers",
  icon: Code,
  disabled: true,
  locked: true,
};

// The canonical sidebar IA: an unlabeled lead group, then one labeled section
// per product area, Storage, and the locked Developers section.
export const APP_NAVIGATION_GROUPS: AppNavigationGroup[] = [
  { label: null, items: [HOME, CANVAS] },
  { label: "Organic", items: ORGANIC_ITEMS },
  { label: "Scale", items: SCALE_ITEMS },
  { label: "Storage", items: [LIBRARY] },
  { label: null, items: [DEVELOPERS] },
];

// Flat list of navigable areas for non-grouped consumers (breadcrumb, command
// palette). Parent areas only — sub-routes are reached from the sidebar.
export const APP_NAVIGATION: AppNavigationItem[] = [HOME, CANVAS, ORGANIC, SCALE, LIBRARY];

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
