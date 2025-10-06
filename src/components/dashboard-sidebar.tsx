"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  HomeIcon,
  GearIcon,
  BarChartIcon,
  Link2Icon,
  MagicWandIcon,
  FileTextIcon,
} from "@radix-ui/react-icons";
import { Flex, Badge } from "@radix-ui/themes";

export const navigationItems = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: HomeIcon,
  },
  {
    name: "Organic",
    href: "/organic",
    icon: BarChartIcon,
  },
  {
    name: "Paid Media",
    href: "/paid-media",
    icon: FileTextIcon,
  },
  {
    name: "Integrations",
    href: "/integrations",
    icon: Link2Icon,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: GearIcon,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      <div className="p-6">
        <Flex align="center" gap="2">
          <Badge color="violet" highContrast>
            Continuum AI
          </Badge>
        </Flex>
      </div>

      <nav className="px-3">
        <ul className="space-y-1">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
