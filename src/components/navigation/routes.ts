import type { ComponentType, SVGProps } from "react";
import {
  BarChartIcon,
  GearIcon,
  HomeIcon,
  Link2Icon,
  MagicWandIcon,
  RocketIcon,
} from "@radix-ui/react-icons";

export type AppNavigationItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: {
    label: string;
    tone?: "green" | "red" | "blue" | "violet";
  };
  description?: string;
};

export const APP_NAVIGATION: AppNavigationItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: HomeIcon,
  },
  {
    label: "AI Studio",
    href: "/ai-studio",
    icon: MagicWandIcon,
  },
  {
    label: "Organic",
    href: "/organic",
    icon: BarChartIcon,
  },
  {
    label: "Paid Media",
    href: "/paid-media",
    icon: RocketIcon,
    badge: {
      label: "Beta",
      tone: "violet",
    },
  },
  {
    label: "Integrations",
    href: "/integrations",
    icon: Link2Icon,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: GearIcon,
  },
];


