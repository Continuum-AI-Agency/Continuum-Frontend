"use client";

import type { ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { BillingTabVisibility } from "@continuum/billing-ui";
import { ACCOUNT_SECTIONS, BRAND_SECTIONS } from "./sections";
import { SettingsNavItem } from "./SettingsNavItem";

type SettingsNavProps = {
  brandPill: ReactNode;
  accountPill: ReactNode;
  /** Owner: full; admin: locked (visible); others: hidden */
  billingTabVisibility?: BillingTabVisibility;
};

export function SettingsNav({
  brandPill,
  accountPill,
  billingTabVisibility = "full",
}: SettingsNavProps) {
  const brandSections = BRAND_SECTIONS.filter((section) => {
    if (section.key !== "billing") return true;
    return billingTabVisibility !== "hidden";
  });

  return (
    <Tabs.List
      aria-label="Settings sections"
      className="flex flex-col gap-6"
    >
      <NavGroup label="Brand" pill={brandPill}>
        {brandSections.map((section) => (
          <SettingsNavItem
            key={section.key}
            value={section.key}
            label={
              section.key === "billing" && billingTabVisibility === "locked"
                ? "Billing (owner)"
                : section.label
            }
            icon={section.icon}
          />
        ))}
      </NavGroup>
      <NavGroup label="Account" pill={accountPill}>
        {ACCOUNT_SECTIONS.map((section) => (
          <SettingsNavItem
            key={section.key}
            value={section.key}
            label={section.label}
            icon={section.icon}
          />
        ))}
      </NavGroup>
    </Tabs.List>
  );
}

type NavGroupProps = {
  label: string;
  pill: ReactNode;
  children: ReactNode;
};

function NavGroup({ label, pill, children }: NavGroupProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
          {label}
        </span>
        {pill}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}
