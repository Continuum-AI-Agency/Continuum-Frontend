import {
  Home,
  Settings,
  ShieldCheck,
  Frame,
  Sprout,
  TrendingUp,
  Activity,
  Bot,
  BookOpen,
  CalendarDays,
  ChartColumn,
  Code,
  Eye,
  Gauge,
  Images,
  Plug,
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
  // User-facing explanation for why a disabled entry is inert (surfaced as a
  // tooltip + accessible name). Required reading for disabled items so they
  // never read as an unexplained dead affordance.
  disabledReason?: string;
};

export type AppNavigationGroup = {
  label: string | null;
  items: AppNavigationItem[];
};

// Sub-routes for the Organic section. Shown as flat nested items under the
// "Organic" section header (Hessian-style), and reused as the parent's items
// for breadcrumb resolution. Labels are area-qualified so "Organic Agent" and
// "Organic Analytics" never collide with Scale's "Jaina"/"Paid Analytics" when
// read outside their section header (breadcrumb, command palette, tooltip).
const ORGANIC_ITEMS: AppNavigationItem[] = [
  { label: "Organic Agent", href: "/organic?tab=agent", icon: Bot, accentColor: "text-emerald-500" },
  { label: "Organic Analytics", href: "/organic?tab=metrics", icon: ChartColumn, accentColor: "text-emerald-500" },
  { label: "Calendar", href: "/organic?tab=planner", icon: CalendarDays, accentColor: "text-emerald-500" },
];

// Sub-routes for the Scale section. The Scale agent is Jaina; "Paid Analytics"
// and "Paid Optimization" mirror Organic's qualified labels so no sub-label is
// ambiguous across areas. "Paid Optimization" is the campaign performance
// surface (the Scale page tab keyed as "performance").
const SCALE_ITEMS: AppNavigationItem[] = [
  { label: "Jaina", href: "/scale?tab=jaina", icon: Bot, accentColor: "text-amber-500" },
  { label: "Paid Analytics", href: "/scale?tab=dashboard", icon: Activity, accentColor: "text-amber-500" },
  { label: "Paid Optimization", href: "/scale?tab=performance", icon: Gauge, accentColor: "text-amber-500" },
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
const BRAND_SPY: AppNavigationItem = {
  label: "Brand Spy",
  href: "/competitor-spy",
  icon: Eye,
  accentColor: "text-cyan-500",
  description: "Track competitor activity and creative signals.",
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

// Locked developer surface. Greyed-out and non-interactive for users not in the
// Continuum Developers program; disabledReason is the hover tooltip + a11y name
// so the entry never reads as an unexplained dead affordance (BUG-009).
const DEVELOPERS: AppNavigationItem = {
  label: "Developers",
  href: "/developers",
  icon: Code,
  disabled: true,
  locked: true,
  disabledReason: "You are not enrolled in our developers program",
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
export const APP_NAVIGATION: AppNavigationItem[] = [
  HOME,
  CANVAS,
  ORGANIC,
  SCALE,
  LIBRARY,
  BRAND_SPY,
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

// A single page-specific action offered by the command palette. Each is a deep
// link into a real surface — the palette uses these to teach what is available
// from the page the user is currently on.
export type CommandSuggestion = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// Static route -> suggestions map keyed by top-level route. Intentionally
// backend-free: these are curated deep links, not search results. A
// backend-ranked universal command search (FEAT-023) is out of scope here;
// keep this map static and add routes as new surfaces ship.
const CONTEXTUAL_SUGGESTIONS: Record<string, CommandSuggestion[]> = {
  "/dashboard": [
    { label: "Generate Brand Book", href: "/settings?section=brand-book", icon: BookOpen },
    { label: "Connect Meta", href: "/settings?section=integrations", icon: Plug },
    { label: "Create reel plan", href: "/organic?tab=planner", icon: CalendarDays },
    { label: "Analyze ROAS drop", href: "/scale?tab=dashboard", icon: Activity },
  ],
  "/organic": [
    { label: "Create reel plan", href: "/organic?tab=planner", icon: CalendarDays },
    { label: "Ask the Organic Agent", href: "/organic?tab=agent", icon: Bot },
    { label: "Review Organic Analytics", href: "/organic?tab=metrics", icon: ChartColumn },
  ],
  "/scale": [
    { label: "Ask Jaina", href: "/scale?tab=jaina", icon: Bot },
    { label: "Analyze ROAS drop", href: "/scale?tab=dashboard", icon: Activity },
    { label: "Optimize campaigns", href: "/scale?tab=performance", icon: Gauge },
  ],
  "/ai-studio": [
    { label: "Open media Library", href: "/library", icon: Images },
    { label: "Create reel plan", href: "/organic?tab=planner", icon: CalendarDays },
  ],
  "/library": [
    { label: "Open Canvas", href: "/ai-studio", icon: Frame },
    { label: "Open content Calendar", href: "/organic?tab=planner", icon: CalendarDays },
  ],
  "/settings": [
    { label: "Generate Brand Book", href: "/settings?section=brand-book", icon: BookOpen },
    { label: "Connect Meta", href: "/settings?section=integrations", icon: Plug },
    { label: "Manage knowledge base", href: "/settings?section=knowledge", icon: BookOpen },
  ],
  "/competitor-spy": [
    { label: "Analyze ROAS drop", href: "/scale?tab=dashboard", icon: Activity },
    { label: "Create reel plan", href: "/organic?tab=planner", icon: CalendarDays },
  ],
};

// Resolve the suggestions for the current pathname by longest-matching route
// prefix (so nested paths like /scale/approvals inherit the Scale set). Returns
// an empty list for routes with no curated suggestions.
export function getContextualSuggestions(currentPath: string): CommandSuggestion[] {
  const matchedPrefix = Object.keys(CONTEXTUAL_SUGGESTIONS)
    .filter(
      (prefix) => currentPath === prefix || currentPath.startsWith(`${prefix}/`),
    )
    .sort((a, b) => b.length - a.length)[0];

  return matchedPrefix ? CONTEXTUAL_SUGGESTIONS[matchedPrefix] : [];
}
