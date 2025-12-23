import React from "react";
import { Badge, Button, Card, Flex, Grid, Text } from "@radix-ui/themes";
import { ReloadIcon } from "@radix-ui/react-icons";

import { PLATFORMS, type PlatformKey } from "../platforms";
import { PlatformIcon, ExtraIcon } from "../PlatformIcons";
import type { OnboardingState } from "@/lib/onboarding/state";
import type { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";
import { getMetaSelectableAdAccountBundles } from "@/lib/integrations/selectableAssets";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import { ProviderDetailsCard } from "./ProviderDetailsCard";
import { COMING_SOON_EXTRA, COMING_SOON_KEYS, FACEBOOK_OAUTH_KEYS, GOOGLE_OAUTH_KEYS } from "./constants";

type ConnectionsPanelProps = {
  connections: OnboardingState["connections"];
  selectableAssets: SelectableAsset[];
  selectableAssetsData: SelectableAssetsResponse | null;
  selectedAccountIdsByKey: Record<PlatformKey, Set<string>>;
  isHydrated: boolean;
  isPending: boolean;
  isAgentRunning: boolean;
  onConnectGroup: (group: "google" | "facebook") => void;
  onDisconnectGroup: (group: "google" | "facebook") => void;
  onResyncGroup: (group: "google" | "facebook") => void;
  onToggleAccount: (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => void;
  onToggleAssets: (assets: SelectableAsset[], checked: boolean) => void;
  cardClassName?: string;
  cardStyle?: React.CSSProperties;
};

export const ConnectionsPanel = React.memo(function ConnectionsPanel({
  connections,
  selectableAssets,
  selectableAssetsData,
  selectedAccountIdsByKey,
  isHydrated,
  isPending,
  isAgentRunning,
  onConnectGroup,
  onDisconnectGroup,
  onResyncGroup,
  onToggleAccount,
  onToggleAssets,
  cardClassName,
  cardStyle,
}: ConnectionsPanelProps) {
  const getLabel = (key: PlatformKey): string =>
    PLATFORMS.find(p => p.key === key)?.label ?? key;

  const isAnyConnected = (keys: PlatformKey[]) =>
    keys.some(key => connections[key]?.connected);

  const metaBundles = selectableAssetsData
    ? getMetaSelectableAdAccountBundles(selectableAssetsData)
    : null;

  const renderGroup = (
    title: string,
    keys: PlatformKey[],
    group: "google" | "facebook"
  ) => {
    const connected = isAnyConnected(keys);
    return (
      <Flex direction="column" gap="2">
        <Flex align="center" justify="between">
          <Text size="2" weight="medium">{title}</Text>
          <Flex gap="2">
            <Button
              onClick={() => (connected ? onDisconnectGroup(group) : onConnectGroup(group))}
              variant={connected ? "soft" : "solid"}
              color={connected ? "gray" : "violet"}
              disabled={isPending || isAgentRunning}
            >
              {connected ? "Disconnect" : "Connect"}
            </Button>
            {connected && (
              <Button
                variant="outline"
                color="gray"
                onClick={() => onResyncGroup(group)}
                disabled={isPending || isAgentRunning}
                aria-label={`Refresh ${title} accounts`}
              >
                <ReloadIcon />
              </Button>
            )}
          </Flex>
        </Flex>
        <Grid columns={{ initial: "1", sm: "2" }} gap="3">
          {keys.map(key => {
            const selectableAssetsForProvider = selectableAssets.filter(
              asset => mapIntegrationTypeToPlatformKey(asset.type) === key
            );
            return (
              <ProviderDetailsCard
                key={key}
                provider={key}
                connection={connections[key]}
                selectableAssets={selectableAssetsForProvider}
                metaBundles={metaBundles}
                selectedAccountIdsByKey={selectedAccountIdsByKey}
                isHydrated={isHydrated}
                onToggleAccount={onToggleAccount}
                onToggleAssets={onToggleAssets}
                cardClassName={cardClassName}
                cardStyle={cardStyle}
              />
            );
          })}
        </Grid>
      </Flex>
    );
  };

  const ComingSoonProviderCard = ({ provider }: { provider: PlatformKey }) => (
    <Card
      key={provider}
      className={`${cardClassName ?? ""} opacity-60`}
      style={cardStyle}
    >
      <Flex direction="column" gap="3" p="4">
        <Flex align="center" justify="between">
          <Flex align="center" gap="2">
            <PlatformIcon platform={provider} />
            <Text weight="medium">{getLabel(provider)}</Text>
          </Flex>
          <Badge color="gray">Coming soon</Badge>
        </Flex>
        <Flex>
          <Button disabled variant="soft" color="gray">
            Connect
          </Button>
        </Flex>
      </Flex>
    </Card>
  );

  const ComingSoonExtraCard = ({ id, label }: { id: "x"; label: string }) => (
    <Card
      key={id}
      className={`${cardClassName ?? ""} opacity-60`}
      style={cardStyle}
    >
      <Flex direction="column" gap="3" p="4">
        <Flex align="center" justify="between">
          <Flex align="center" gap="2">
            <ExtraIcon id={id} />
            <Text weight="medium">{label}</Text>
          </Flex>
          <Badge color="gray">Coming soon</Badge>
        </Flex>
        <Flex>
          <Button disabled variant="soft" color="gray">
            Connect
          </Button>
        </Flex>
      </Flex>
    </Card>
  );

  return (
    <Flex direction="column" gap="4">
      {renderGroup("Google OAuth", GOOGLE_OAUTH_KEYS, "google")}
      {renderGroup("Facebook OAuth", FACEBOOK_OAUTH_KEYS, "facebook")}
      <Flex direction="column" gap="2">
        <Text size="2" weight="medium">Coming soon</Text>
        <Grid columns={{ initial: "1", sm: "2" }} gap="3">
          {COMING_SOON_KEYS.map(key => (
            <ComingSoonProviderCard key={key} provider={key} />
          ))}
          {COMING_SOON_EXTRA.map(item => (
            <ComingSoonExtraCard key={item.key} id={item.key} label={item.label} />
          ))}
        </Grid>
      </Flex>
    </Flex>
  );
});
