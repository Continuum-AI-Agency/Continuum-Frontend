import type { ComponentType, ComponentProps } from "react";
import {
  HomeIcon,
  ChatBubbleIcon,
  FrameIcon,
  GearIcon,
  CheckCircledIcon,
  MixerHorizontalIcon
} from "@radix-ui/react-icons";
import {
  RocketLaunchIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  ChartBarSquareIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  DocumentTextIcon,
  UserCircleIcon,
  ArrowRightStartOnRectangleIcon
} from "@heroicons/react/24/outline";

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
    icon: SparklesIcon,
    items: [
      {
        label: "Chat",
        href: "/ai-studio?mode=chat",
        icon: ChatBubbleLeftRightIcon,
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
    icon: ChartBarSquareIcon,
    items: [
      {
        label: "Content Calendar",
        href: "/organic",
        icon: CalendarIcon,
      },
      {
        label: "Metrics",
        href: "/organic?tab=metrics",
        icon: ClipboardDocumentListIcon,
      },
    ],
  },
  {
    label: "Paid Media",
    href: "/paid-media",
    icon: RocketLaunchIcon,
    badge: {
      label: "Beta",
      tone: "violet",
    },
    items: [
      {
        label: "Jaina",
        href: "/paid-media?tab=jaina",
        icon: ChatBubbleIcon,
      },
      {
        label: "Campaigns",
        href: "/paid-media?tab=campaigns",
        icon: ClipboardDocumentListIcon,
      },
      {
        label: "DCO",
        href: "/paid-media?tab=dco",
        icon: ChartBarSquareIcon,
      },
    ],
  },
  {
    label: "Primitives",
    href: "/primitives",
    icon: UsersIcon,
    badge: {
      label: "MVP",
      tone: "blue",
    },
    description: "Shared building blocks for paid media (audiences, guidelines, personas).",
    items: [
      {
        label: "Audiences",
        href: "/primitives?tab=audiences",
        icon: UsersIcon,
      },
      {
        label: "Brand Guidelines",
        href: "/primitives?tab=guidelines",
        icon: DocumentTextIcon,
      },
      {
        label: "Personas",
        href: "/primitives?tab=personas",
        icon: UserCircleIcon,
      },
    ],
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
