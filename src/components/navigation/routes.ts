import type { ComponentType, SVGProps } from "react";
import { BarChartIcon, HomeIcon, MagicWandIcon, RocketIcon } from "@radix-ui/react-icons";

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
    label: "Creative Studio",
    href: "/ai-studio",
    icon: MagicWandIcon,
  },
  {
    label: "Organic Content",
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
];
