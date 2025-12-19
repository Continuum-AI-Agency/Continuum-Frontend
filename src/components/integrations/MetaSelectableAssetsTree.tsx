"use client";

import { ChevronDownIcon } from "@radix-ui/react-icons";
import * as Accordion from "@radix-ui/react-accordion";
import { Badge, Box, Checkbox, Flex, Text } from "@radix-ui/themes";
import type { MetaSelectableHierarchy, SelectableAsset } from "@/lib/schemas/integrations";
import { getSelectableAssetLabel } from "@/lib/integrations/selectableAssets";

type SelectedByIntegrationAccountId = Record<string, boolean>;

type Props = {
  hierarchy: MetaSelectableHierarchy;
  selectedByIntegrationAccountId: SelectedByIntegrationAccountId;
  onToggleIntegrationAccountId: (integrationAccountId: string, checked: boolean) => void;
  disabled?: boolean;
};

function getAssetRowKey(asset: SelectableAsset): string {
  return asset.integration_account_id ?? asset.asset_pk;
}

function SelectableAssetRow({
  asset,
  selectedByIntegrationAccountId,
  onToggleIntegrationAccountId,
  disabled,
  seenKeys,
}: {
  asset: SelectableAsset;
  selectedByIntegrationAccountId: SelectedByIntegrationAccountId;
  onToggleIntegrationAccountId: (integrationAccountId: string, checked: boolean) => void;
  disabled: boolean;
  seenKeys: Set<string>;
}) {
  const key = getAssetRowKey(asset);
  if (seenKeys.has(key)) return null;
  seenKeys.add(key);

  const integrationAccountId = asset.integration_account_id;
  const checked = integrationAccountId ? Boolean(selectedByIntegrationAccountId[integrationAccountId]) : false;
  const isDisabled = disabled || !integrationAccountId;

  return (
    <Box className="border-subtle border-t px-3 py-2">
      <Text as="label" size="2" color={isDisabled ? "gray" : undefined}>
        <Flex as="span" align="center" justify="between" gap="3">
          <Flex as="span" align="center" gap="2" className="min-w-0">
            <Checkbox
              checked={checked}
              disabled={isDisabled}
              onCheckedChange={(value) => {
                if (!integrationAccountId) return;
                onToggleIntegrationAccountId(integrationAccountId, value === true);
              }}
            />
            <Text as="span" className="truncate">
              {getSelectableAssetLabel(asset)}
            </Text>
          </Flex>
          <Flex as="span" align="center" gap="2">
            <Badge variant="soft" color="gray">
              {asset.type}
            </Badge>
            {!integrationAccountId ? (
              <Text as="span" size="1" color="amber">
                Not ready
              </Text>
            ) : null}
          </Flex>
        </Flex>
      </Text>
    </Box>
  );
}

function AssetsList({
  title,
  assets,
  selectedByIntegrationAccountId,
  onToggleIntegrationAccountId,
  disabled,
  seenKeys,
}: {
  title: string;
  assets: SelectableAsset[];
  selectedByIntegrationAccountId: SelectedByIntegrationAccountId;
  onToggleIntegrationAccountId: (integrationAccountId: string, checked: boolean) => void;
  disabled: boolean;
  seenKeys: Set<string>;
}) {
  if (assets.length === 0) return null;
  return (
    <Box className="border-subtle rounded-lg border bg-surface">
      <Box className="px-3 py-2">
        <Text size="2" weight="medium" className="text-primary">
          {title}
        </Text>
      </Box>
      <Box>
        {assets.map((asset) => (
          <SelectableAssetRow
            key={asset.asset_pk}
            asset={asset}
            selectedByIntegrationAccountId={selectedByIntegrationAccountId}
            onToggleIntegrationAccountId={onToggleIntegrationAccountId}
            disabled={disabled}
            seenKeys={seenKeys}
          />
        ))}
      </Box>
    </Box>
  );
}

export function MetaSelectableAssetsTree({
  hierarchy,
  selectedByIntegrationAccountId,
  onToggleIntegrationAccountId,
  disabled = false,
}: Props) {
  const integrations = hierarchy.integrations ?? [];
  if (integrations.length === 0) {
    return (
      <Text size="2" color="gray">
        No Meta businesses found.
      </Text>
    );
  }

  const seenKeys = new Set<string>();

  return (
    <Flex direction="column" gap="4">
      {integrations.map((integration) => {
        const businesses = integration.businesses ?? [];
        if (businesses.length === 0) return null;

        return (
          <Box key={integration.integration_id}>
            <Accordion.Root type="multiple" className="flex flex-col gap-2">
              {businesses.map((business, index) => {
                const businessKey = `${integration.integration_id}:${business.business_id ?? "none"}:${index}`;
                const businessLabel =
                  business.business_name?.trim() ||
                  business.business_id ||
                  "Meta business";

                return (
                  <Accordion.Item
                    key={businessKey}
                    value={businessKey}
                    className="border-subtle overflow-hidden rounded-lg border bg-surface"
                  >
                    <Accordion.Header>
                      <Accordion.Trigger className="text-primary group flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                        <Flex direction="column" gap="1" className="min-w-0">
                          <Text size="2" weight="medium" className="truncate">
                            {businessLabel}
                          </Text>
                          {business.business_id ? (
                            <Text size="1" color="gray" className="truncate">
                              Business ID {business.business_id}
                            </Text>
                          ) : null}
                        </Flex>
                        <ChevronDownIcon className="text-secondary shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                      </Accordion.Trigger>
                    </Accordion.Header>

                    <Accordion.Content className="border-subtle border-t px-3 py-3">
                      <Flex direction="column" gap="3">
                        {(business.ad_accounts ?? []).length > 0 ? (
                          <Flex direction="column" gap="2">
                            <Text size="2" weight="medium" className="text-primary">
                              Ad accounts
                            </Text>
                          <Accordion.Root type="multiple" className="flex flex-col gap-2">
                            {(business.ad_accounts ?? []).map((adAccount) => {
                              const adAccountKey = `${businessKey}:ad:${adAccount.ad_account_id}`;
                              const adAccountLabel = adAccount.ad_account
                                ? getSelectableAssetLabel(adAccount.ad_account)
                                : adAccount.ad_account_id;

                              const adAccountIntegrationAccountId = adAccount.ad_account?.integration_account_id ?? null;
                              const adAccountChecked = adAccountIntegrationAccountId
                                ? Boolean(selectedByIntegrationAccountId[adAccountIntegrationAccountId])
                                : false;
                              const adAccountDisabled = disabled || !adAccountIntegrationAccountId;

                              return (
                                <Accordion.Item
                                  key={adAccountKey}
                                  value={adAccountKey}
                                  className="border-subtle overflow-hidden rounded-lg border bg-default"
                                >
                                  <Accordion.Header className="px-3 py-2">
                                    <Flex align="center" gap="2">
                                      <Checkbox
                                        checked={adAccountChecked}
                                        disabled={adAccountDisabled}
                                        onCheckedChange={(value) => {
                                          if (!adAccountIntegrationAccountId) return;
                                          onToggleIntegrationAccountId(adAccountIntegrationAccountId, value === true);
                                        }}
                                      />
                                      <Accordion.Trigger className="text-primary group flex w-full flex-1 items-center justify-between gap-2 text-left">
                                        <Flex direction="column" gap="1" className="min-w-0">
                                          <Flex align="center" gap="2">
                                            <Text size="2" weight="medium" className="truncate">
                                              {adAccountLabel}
                                            </Text>
                                            <Badge variant="soft" color="gray">
                                              ad account
                                            </Badge>
                                          </Flex>
                                          <Text size="1" color="gray" className="truncate">
                                            Ad Account ID {adAccount.ad_account_id}
                                          </Text>
                                        </Flex>
                                        <ChevronDownIcon className="text-secondary shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                                      </Accordion.Trigger>
                                    </Flex>
                                  </Accordion.Header>

                                  <Accordion.Content className="border-subtle border-t px-3 py-3">
                                    <Flex direction="column" gap="3">
                                      <AssetsList
                                        title="Pages"
                                        assets={adAccount.pages ?? []}
                                        selectedByIntegrationAccountId={selectedByIntegrationAccountId}
                                        onToggleIntegrationAccountId={onToggleIntegrationAccountId}
                                        disabled={disabled}
                                        seenKeys={seenKeys}
                                      />
                                      <AssetsList
                                        title="Instagram accounts"
                                        assets={adAccount.instagram_accounts ?? []}
                                        selectedByIntegrationAccountId={selectedByIntegrationAccountId}
                                        onToggleIntegrationAccountId={onToggleIntegrationAccountId}
                                        disabled={disabled}
                                        seenKeys={seenKeys}
                                      />
                                      <AssetsList
                                        title="Threads accounts"
                                        assets={adAccount.threads_accounts ?? []}
                                        selectedByIntegrationAccountId={selectedByIntegrationAccountId}
                                        onToggleIntegrationAccountId={onToggleIntegrationAccountId}
                                        disabled={disabled}
                                        seenKeys={seenKeys}
                                      />
                                    </Flex>
                                  </Accordion.Content>
                                </Accordion.Item>
                              );
                              })}
                            </Accordion.Root>
                          </Flex>
                        ) : null}

                        <AssetsList
                          title="Pages (no ad account)"
                          assets={business.pages_without_ad_account ?? []}
                          selectedByIntegrationAccountId={selectedByIntegrationAccountId}
                          onToggleIntegrationAccountId={onToggleIntegrationAccountId}
                          disabled={disabled}
                          seenKeys={seenKeys}
                        />
                        <AssetsList
                          title="Instagram accounts (no ad account)"
                          assets={business.instagram_accounts_without_ad_account ?? []}
                          selectedByIntegrationAccountId={selectedByIntegrationAccountId}
                          onToggleIntegrationAccountId={onToggleIntegrationAccountId}
                          disabled={disabled}
                          seenKeys={seenKeys}
                        />
                        <AssetsList
                          title="Threads accounts (no ad account)"
                          assets={business.threads_accounts_without_ad_account ?? []}
                          selectedByIntegrationAccountId={selectedByIntegrationAccountId}
                          onToggleIntegrationAccountId={onToggleIntegrationAccountId}
                          disabled={disabled}
                          seenKeys={seenKeys}
                        />
                      </Flex>
                    </Accordion.Content>
                  </Accordion.Item>
                );
              })}
            </Accordion.Root>
          </Box>
        );
      })}
    </Flex>
  );
}
