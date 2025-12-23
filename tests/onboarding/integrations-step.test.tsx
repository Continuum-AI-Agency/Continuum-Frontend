import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createDefaultOnboardingState } from "@/lib/onboarding/state";
import "../mocks/radixThemes";

const noop = () => undefined;

test("IntegrationsStep renders header and refresh", async () => {
  const state = createDefaultOnboardingState();
  const { IntegrationsStep } = await import("@/components/onboarding/steps/IntegrationsStep");

  const html = renderToStaticMarkup(
    <IntegrationsStep
      state={state}
      selectableAssets={[]}
      selectableAssetsData={null}
      selectedAccountIdsByKey={{
        youtube: new Set(),
        googleAds: new Set(),
        dv360: new Set(),
        instagram: new Set(),
        facebook: new Set(),
        threads: new Set(),
        tiktok: new Set(),
        linkedin: new Set(),
        amazonAds: new Set(),
      }}
      isHydrated={false}
      isPending={false}
      isAgentRunning={false}
      onConnectGroup={noop}
      onDisconnectGroup={noop}
      onResyncGroup={noop}
      onRefreshAll={noop}
      onToggleAccount={noop}
      onToggleAssets={noop}
      onClear={noop}
      onBack={noop}
      onNext={noop}
      canContinue={false}
    />
  );

  expect(html).toContain("Connect your channels");
  expect(html).toContain("Refresh");
});
