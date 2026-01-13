import React from "react";
import { Button, Callout, Card, Flex, Heading, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

import type { OnboardingState } from "@/lib/onboarding/state";
import type { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";
import { ConnectionsPanel } from "../integrations/ConnectionsPanel";
import type { PlatformKey } from "../platforms";

type IntegrationsStepProps = {
  state: OnboardingState;
  selectableAssets: SelectableAsset[];
  selectableAssetsData: SelectableAssetsResponse | null;
  selectedAccountIdsByKey: Record<PlatformKey, Set<string>>;
  isHydrated: boolean;
  isPending: boolean;
  isAgentRunning: boolean;
  onConnectGroup: (group: "google" | "facebook") => void;
  onDisconnectGroup: (group: "google" | "facebook") => void;
  onResyncGroup: (group: "google" | "facebook") => void;
  onRefreshAll: () => void;
  onToggleAccount: (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => void;
  onToggleAssets: (assets: SelectableAsset[], checked: boolean) => void;
  onClear: () => void;
  onBack: () => void;
  onNext: () => void;
  canContinue: boolean;
  cardClassName?: string;
  cardStyle?: React.CSSProperties;
};

export const IntegrationsStep = React.memo(function IntegrationsStep({
  state,
  selectableAssets,
  selectableAssetsData,
  selectedAccountIdsByKey,
  isHydrated,
  isPending,
  isAgentRunning,
  onConnectGroup,
  onDisconnectGroup,
  onResyncGroup,
  onRefreshAll,
  onToggleAccount,
  onToggleAssets,
  onClear,
  onBack,
  onNext,
  canContinue,
  cardClassName,
  cardStyle,
}: IntegrationsStepProps) {
  return (
    <Card className={cardClassName} style={cardStyle}>
      <Flex direction="column" gap="4" p="4">
        <Flex align="center" justify="between">
          <Heading size="4">Connect your channels</Heading>
          <Button
            variant="ghost"
            size="1"
            onClick={onRefreshAll}
            disabled={isPending || isAgentRunning}
          >
            Refresh
          </Button>
        </Flex>
        <Text color="gray">
          Secure popups handle authentication for each network. We’ll show live account data as soon as the provider confirms access.
        </Text>
        <Text color="gray" size="2">
          You can continue without connecting accounts and finish setup later in Settings.
        </Text>
        <ConnectionsPanel
          connections={state.connections}
          selectableAssets={selectableAssets}
          selectableAssetsData={selectableAssetsData}
          selectedAccountIdsByKey={selectedAccountIdsByKey}
          isHydrated={isHydrated}
          isPending={isPending}
          isAgentRunning={isAgentRunning}
          onConnectGroup={onConnectGroup}
          onDisconnectGroup={onDisconnectGroup}
          onResyncGroup={onResyncGroup}
          onToggleAccount={onToggleAccount}
          onToggleAssets={onToggleAssets}
          cardClassName={cardClassName}
          cardStyle={cardStyle}
        />
        <Callout.Root color="indigo">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            Popups talk to the Continuum integrations service. We cache the callback URL you pass in, exchange tokens with Google or Meta, then stream the connected accounts back into this brand automatically.
          </Callout.Text>
        </Callout.Root>
        <Flex justify="between" align="center">
          <Button
            type="button"
            variant="ghost"
            color="gray"
            onClick={onClear}
            disabled={isPending || isAgentRunning}
          >
            Clear
          </Button>
          <Flex gap="2">
            <Button variant="soft" onClick={onBack} disabled={isPending || isAgentRunning}>
              Back
            </Button>
            <Button onClick={onNext} disabled={!canContinue || isPending || isAgentRunning}>
              Continue
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Card>
  );
});
