"use client";

import React, { ReactNode } from "react";
import { Tabs } from "@radix-ui/themes";

interface SettingsTabsProps {
  children: ReactNode;
}

export function SettingsTabs({ children }: SettingsTabsProps) {
  return (
    <Tabs.Root defaultValue="brand" className="space-y-4">
      {children}
    </Tabs.Root>
  );
}

export function SettingsTabsList({ children }: { children: ReactNode }) {
  return <Tabs.List>{children}</Tabs.List>;
}

export function SettingsTabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return <Tabs.Trigger value={value}>{children}</Tabs.Trigger>;
}

export function SettingsTabsContent({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  return (
    <Tabs.Content value={value} className={className}>
      {children}
    </Tabs.Content>
  );
}
