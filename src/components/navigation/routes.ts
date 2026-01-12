import type { ComponentType, ComponentProps } from "react";
import { 
  BarChartIcon, 
  Component1Icon, 
  HomeIcon, 
  MagicWandIcon, 
  RocketIcon, 
  ChatBubbleIcon, 
  FrameIcon,
  GearIcon,
  MixerHorizontalIcon,
  CheckCircledIcon
} from "@radix-ui/react-icons";

export type AppNavigationItem = {
  label: string;
  href: string;
  icon: ComponentType<ComponentProps<typeof HomeIcon>>;
  badge?: {
    label: string;
    tone?: "green" | "red" | "blue" | "violet";
  };
  description?: string;
  items?: {
    label: string;
    href: string;
    icon: ComponentType<ComponentProps<typeof HomeIcon>>;
  }[];
  adminOnly?: boolean;
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
    items: [
      {
        label: "Chat",
        href: "/ai-studio?mode=chat",
        icon: ChatBubbleIcon,
      },
      {
        label: "Canvas",
        href: "/ai-studio?mode=canvas",
        icon: FrameIcon,
      },
    ],
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
  {
    label: "Primitives",
    href: "/primitives",
    icon: Component1Icon,
    badge: {
      label: "MVP",
      tone: "blue",
    },
    description: "Shared building blocks for paid media (audiences, guidelines, personas).",
  },
];

export const APP_NAVIGATION_FOOTER: AppNavigationItem[] = [
  {
    label: "Settings",
    href: "/settings",
    icon: GearIcon,
  },
  {
    label: "Integrations",
    href: "/settings/integrations",
    icon: MixerHorizontalIcon,
  },
  {
    label: "Admin",
    href: "/admin",
    icon: CheckCircledIcon,
    adminOnly: true,
  },
];
