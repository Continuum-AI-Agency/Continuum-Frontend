import React from "react";
import { Badge, Card, Checkbox, Flex, Text } from "@radix-ui/themes";

import { PLATFORMS, type PlatformKey } from "../platforms";
import { PlatformIcon } from "../PlatformIcons";
import type { OnboardingState } from "@/lib/onboarding/state";
import type { SelectableAsset } from "@/lib/schemas/integrations";
import type { MetaSelectableAdAccountBundles } from "@/lib/integrations/selectableAssets";
import { sortSelectableAssetsByTypeThenLabel } from "./selectableAssetUtils";
import { MetaBundlesAccordion } from "./MetaBundlesAccordion";
import { SelectableAssetList } from "./SelectableAssetList";

type ProviderDetailsCardProps = {
  provider: PlatformKey;
  connection?: OnboardingState["connections"][PlatformKey];
  selectableAssets: SelectableAsset[];
  metaBundles: MetaSelectableAdAccountBundles | null;
  selectedAccountIdsByKey: Record<PlatformKey, Set<string>>;
  isHydrated: boolean;
  onToggleAccount: (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => void;
  onToggleAssets: (assets: SelectableAsset[], checked: boolean) => void;
  cardClassName?: string;
  cardStyle?: React.CSSProperties;
};

export const ProviderDetailsCard = React.memo(function ProviderDetailsCard({
  provider,
  connection,
  selectableAssets,
  metaBundles,
  selectedAccountIdsByKey,
  isHydrated,
  onToggleAccount,
  onToggleAssets,
  cardClassName,
  cardStyle,
}: ProviderDetailsCardProps) {
  const label = PLATFORMS.find(p => p.key === provider)?.label ?? provider;
  const isMetaManagedProvider = provider === "instagram" || provider === "threads";
  const managedSelectableAssets = isMetaManagedProvider
    ? selectableAssets.filter(asset => asset.ad_account_id)
    : [];
  const directSelectableAssets = isMetaManagedProvider
    ? selectableAssets.filter(asset => !asset.ad_account_id)
    : selectableAssets;
  const sortedManagedAssets = sortSelectableAssetsByTypeThenLabel(managedSelectableAssets);
  const sortedDirectAssets = sortSelectableAssetsByTypeThenLabel(directSelectableAssets);
  const hasSelectableAssets = selectableAssets.length > 0 || (provider === "facebook" && Boolean(metaBundles));
  const isConnected = Boolean(connection?.connected || hasSelectableAssets);
  const resolvedMetaBundles = provider === "facebook" ? metaBundles : null;
  const hasAssetList = sortedManagedAssets.length > 0 || sortedDirectAssets.length > 0;

  return (
    <Card className={cardClassName} style={cardStyle}>
      <Flex direction="column" gap="3" p="4">
        <Flex align="center" justify="between">
          <Flex align="center" gap="2">
            <PlatformIcon platform={provider} />
            <Text weight="medium">{label}</Text>
          </Flex>
          <Badge color={isConnected ? "green" : "gray"}>
            {isConnected ? "Connected" : "Not connected"}
          </Badge>
        </Flex>
        {isConnected && (
          <Flex direction="column" gap="2">
            <Text size="2" weight="medium">
              Synced accounts
            </Text>
            {resolvedMetaBundles ? (
              <MetaBundlesAccordion
                bundles={resolvedMetaBundles}
                selectedAccountIdsByKey={selectedAccountIdsByKey}
                onToggleAssets={onToggleAssets}
                onToggleAccount={onToggleAccount}
              />
            ) : hasAssetList ? (
              isMetaManagedProvider ? (
                <Flex direction="column" gap="2">
                  {sortedManagedAssets.length > 0 && (
                    <Flex direction="column" gap="1">
                      <Text size="1" color="gray">
                        Managed by Facebook ad accounts
                      </Text>
                      <SelectableAssetList
                        provider={provider}
                        assets={sortedManagedAssets}
                        selectedAccountIds={selectedAccountIdsByKey[provider] ?? new Set<string>()}
                        onToggleAccount={onToggleAccount}
                      />
                    </Flex>
                  )}
                  {sortedDirectAssets.length > 0 && (
                    <Flex direction="column" gap="1">
                      {sortedManagedAssets.length > 0 && (
                        <Text size="1" color="gray">
                          Other
                        </Text>
                      )}
                      <SelectableAssetList
                        provider={provider}
                        assets={sortedDirectAssets}
                        selectedAccountIds={selectedAccountIdsByKey[provider] ?? new Set<string>()}
                        onToggleAccount={onToggleAccount}
                      />
                    </Flex>
                  )}
                </Flex>
              ) : (
                <SelectableAssetList
                  provider={provider}
                  assets={sortedDirectAssets}
                  selectedAccountIds={selectedAccountIdsByKey[provider] ?? new Set<string>()}
                  onToggleAccount={onToggleAccount}
                />
              )
            ) : !isHydrated && connection?.accounts?.length ? (
              <Flex direction="column" gap="1">
                {connection.accounts.map(account => {
                  const selected = selectedAccountIdsByKey[provider]?.has(account.id) ?? false;
                  return (
                    <Card key={account.id} variant="surface">
                      <Flex justify="between" align="center" p="2" gap="2">
                        <Flex align="center" gap="2">
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(value) =>
                              onToggleAccount(provider, account.id, value === true, account.name)
                            }
                          />
                          <Text size="2">{account.name}</Text>
                        </Flex>
                        <Badge color={account.status === "active" ? "green" : account.status === "pending" ? "amber" : "red"}>
                          {account.status}
                        </Badge>
                      </Flex>
                    </Card>
                  );
                })}
              </Flex>
            ) : (
              <Text size="1" color="gray">
                No accounts returned yet. Try syncing again.
              </Text>
            )}
            <Text size="1" color="gray">
              Last synced {connection?.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "—"}
            </Text>
          </Flex>
        )}
      </Flex>
    </Card>
  );
});
