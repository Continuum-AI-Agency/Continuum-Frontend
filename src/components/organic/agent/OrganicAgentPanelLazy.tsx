"use client";

import dynamic from "next/dynamic";

const OrganicAgentPanelDynamic = dynamic(
  () =>
    import("@/components/organic/agent/OrganicAgentPanel").then((m) => ({
      default: m.OrganicAgentPanel,
    })),
  { ssr: false }
);

type OrganicAgentPanelLazyProps = {
  brandId: string;
  platformAccountIds: Record<string, string>;
};

export function OrganicAgentPanelLazy(props: OrganicAgentPanelLazyProps) {
  return <OrganicAgentPanelDynamic {...props} />;
}
