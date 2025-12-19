"use client";

import { Callout, Flex, IconButton } from "@radix-ui/themes";
import {
  HamburgerMenuIcon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import React from "react";
import { useSession } from "@/hooks/useSession";
import { BrandSwitcherMenu } from "@/components/navigation/BrandSwitcherMenu";

const DISMISS_MS = 10_000;
const TICK_MS = 120;

type CountdownRingProps = {
  progress: number; // 0..1
};

function CountdownRing({ progress }: CountdownRingProps) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return (
    <div
      aria-hidden="true"
      style={{
        width: 28,
        height: 28,
        borderRadius: "9999px",
        background: `conic-gradient(var(--ring) ${clamped * 360}deg, rgba(148, 163, 184, 0.4) ${clamped * 360}deg)`,
        display: "grid",
        placeItems: "center",
        boxShadow: "0 0 0 1px rgba(148, 163, 184, 0.35)",
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "9999px",
          background: "var(--color-background)",
        }}
      />
    </div>
  );
}

export function DashboardHeader({
  onOpenMobile,
}: {
  onOpenMobile?: () => void;
}) {
  const { user } = useSession();
  const [welcomeVisible, setWelcomeVisible] = React.useState(true);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (!welcomeVisible) return;
    const started = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - started;
      const pct = Math.min(elapsed / DISMISS_MS, 1);
      setProgress(pct);
      if (pct >= 1) {
        setWelcomeVisible(false);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [welcomeVisible]);

  return (
    <div className="px-4 sm:px-6 pt-3 sm:pt-4">
      <Flex direction="column" gap="3">
        {welcomeVisible && (
          <Callout.Root color="indigo" variant="surface" className="shadow-sm">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Flex align="center" gap="3" justify="between" className="w-full">
              <Callout.Text>
                Welcome back, {user?.user_metadata?.name || user?.email?.split("@")[0] || "User"}. Your dashboard shows
                live brand insights and quick actions. Switch brands or add a new one from the menu on the right.
              </Callout.Text>
              <CountdownRing progress={progress} />
            </Flex>
          </Callout.Root>
        )}

        <Flex align="center" justify="between" gap="3">
          <div className="sm:hidden">
            <IconButton variant="ghost" onClick={onOpenMobile} aria-label="Open navigation">
              <HamburgerMenuIcon />
            </IconButton>
          </div>

          <Flex align="center" gap="3 sm:gap-4" className="ml-auto">
            <BrandSwitcherMenu triggerId="dashboard-brand-menu-trigger" />
          </Flex>
        </Flex>
      </Flex>
    </div>
  );
}
