import React, { useMemo, useRef } from "react";
import { Badge, Box, Card, Checkbox, Flex, IconButton, Separator, Text } from "@radix-ui/themes";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import * as Accordion from "@radix-ui/react-accordion";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { MetaSelectableAdAccountBundles } from "@/lib/integrations/selectableAssets";
import type { PlatformKey } from "../platforms";
import type { SelectableAsset } from "@/lib/schemas/integrations";
import { mapIntegrationTypeToPlatformKey } from "@/lib/integrations/platform";
import { resolveSelectableAssetLabel } from "./selectableAssetUtils";

type MetaBundlesAccordionProps = {
  bundles: MetaSelectableAdAccountBundles;
  selectedAccountIdsByKey: Record<PlatformKey, Set<string>>;
  onToggleAssets: (assets: SelectableAsset[], checked: boolean) => void;
  onToggleAccount: (provider: PlatformKey, accountId: string, checked: boolean, label?: string | null) => void;
};

const VIRTUAL_THRESHOLD = 20;
const VIRTUAL_ASSET_ESTIMATE = 40;
const VIRTUAL_MAX_HEIGHT = 240;

type VirtualizedRowsProps<T> = {
  items: T[];
  estimateSize: number;
  maxHeight: number;
  getKey: (item: T) => string;
  renderRow: (item: T) => React.ReactNode;
};

function VirtualizedRows<T>({ items, estimateSize, maxHeight, getKey, renderRow }: VirtualizedRowsProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
  });

  const rows = useMemo(() => rowVirtualizer.getVirtualItems(), [rowVirtualizer]);

  return (
    <div ref={parentRef} style={{ maxHeight, overflow: "auto" }} role="list">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rows.map(row => {
          const item = items[row.index];
          if (!item) return null;
          return (
            <div
              key={getKey(item)}
              ref={rowVirtualizer.measureElement}
              data-index={row.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
                paddingBottom: 6,
              }}
            >
              {renderRow(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const MetaBundlesAccordion = React.memo(function MetaBundlesAccordion({
  bundles,
  selectedAccountIdsByKey,
  onToggleAssets,
  onToggleAccount,
}: MetaBundlesAccordionProps) {
  const canVirtualize = typeof window !== "undefined";
  return (
    <Flex direction="column" gap="2">
      <Accordion.Root type="multiple">
        {bundles.ad_accounts.map(bundle => {
          const adAccountLabel = bundle.ad_account
            ? resolveSelectableAssetLabel(bundle.ad_account)
            : bundle.ad_account_id;
          const selectionAssets = (bundle.ad_account ? [bundle.ad_account, ...bundle.assets] : bundle.assets)
            .filter(asset => {
              if (!asset.integration_account_id) return false;
              return Boolean(mapIntegrationTypeToPlatformKey(asset.type));
            });
          const uniqueSelections = new Map<string, { key: PlatformKey; id: string }>();
          selectionAssets.forEach(asset => {
            const id = asset.integration_account_id;
            const key = mapIntegrationTypeToPlatformKey(asset.type);
            if (!id || !key) return;
            uniqueSelections.set(`${key}:${id}`, { key, id });
          });

          let selectedCount = 0;
          uniqueSelections.forEach(({ key, id }) => {
            if (selectedAccountIdsByKey[key]?.has(id)) selectedCount += 1;
          });

          const totalSelectable = uniqueSelections.size;
          const allSelected = totalSelectable > 0 && selectedCount === totalSelectable;
          const partiallySelected = selectedCount > 0 && selectedCount < totalSelectable;
          const disabled = totalSelectable === 0;

          const selectionBadge = totalSelectable === 0
            ? { color: "gray" as const, label: "Unavailable" }
            : allSelected
              ? { color: "green" as const, label: `Selected ${selectedCount}/${totalSelectable}` }
              : partiallySelected
                ? { color: "amber" as const, label: `Selected ${selectedCount}/${totalSelectable}` }
                : { color: "gray" as const, label: `Selected ${selectedCount}/${totalSelectable}` };

          return (
            <Accordion.Item
              key={bundle.ad_account_id}
              value={bundle.ad_account_id}
              className="mb-2 last:mb-0"
            >
              <Card variant="surface">
                <Accordion.Header>
                  <Flex justify="between" align="center" gap="2" p="2">
                    <Text as="label" size="2" className="min-w-0">
                      <Flex as="span" align="center" gap="2" className="min-w-0">
                        <Checkbox
                          checked={partiallySelected ? "indeterminate" : allSelected}
                          disabled={disabled}
                          onCheckedChange={(value) => {
                            onToggleAssets(selectionAssets, value === true);
                          }}
                        />
                        <Text size="2" weight="medium" className="truncate">
                          {adAccountLabel}
                        </Text>
                        <Badge color="gray" variant="soft">
                          Ad account
                        </Badge>
                      </Flex>
                    </Text>
                    <Flex align="center" gap="2">
                      <Badge color={selectionBadge.color} variant="soft">
                        {selectionBadge.label}
                      </Badge>
                      <Accordion.Trigger asChild>
                        <IconButton
                          variant="ghost"
                          color="gray"
                          size="1"
                          aria-label={`Toggle ${adAccountLabel} assets`}
                          className="group"
                        >
                          <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </IconButton>
                      </Accordion.Trigger>
                    </Flex>
                  </Flex>
                </Accordion.Header>

                <Accordion.Content className="overflow-hidden">
                  <Box px="2" pb="2">
                    <Separator size="4" my="2" />
                  {bundle.assets.length > 0 ? (
                    canVirtualize && bundle.assets.length > VIRTUAL_THRESHOLD ? (
                      <VirtualizedRows
                        items={bundle.assets}
                        estimateSize={VIRTUAL_ASSET_ESTIMATE}
                        maxHeight={VIRTUAL_MAX_HEIGHT}
                        getKey={item => item.asset_pk}
                        renderRow={asset => {
                          const assetLabel = resolveSelectableAssetLabel(asset);
                          const isSelectable = Boolean(asset.integration_account_id)
                            && Boolean(mapIntegrationTypeToPlatformKey(asset.type));
                          return (
                            <Flex justify="between" align="center" gap="2">
                              <Flex align="center" gap="2" className="min-w-0">
                                <Text size="2" color={!isSelectable ? "gray" : undefined} className="truncate">
                                  {assetLabel}
                                </Text>
                                <Badge color="gray" variant="soft">
                                  {asset.type}
                                </Badge>
                              </Flex>
                            </Flex>
                          );
                        }}
                      />
                    ) : (
                      <Flex direction="column" gap="2">
                        {bundle.assets.map(asset => {
                          const assetLabel = resolveSelectableAssetLabel(asset);
                          const isSelectable = Boolean(asset.integration_account_id)
                            && Boolean(mapIntegrationTypeToPlatformKey(asset.type));
                          return (
                            <Flex key={asset.asset_pk} justify="between" align="center" gap="2">
                              <Flex align="center" gap="2" className="min-w-0">
                                <Text size="2" color={!isSelectable ? "gray" : undefined} className="truncate">
                                  {assetLabel}
                                </Text>
                                <Badge color="gray" variant="soft">
                                  {asset.type}
                                </Badge>
                              </Flex>
                            </Flex>
                          );
                        })}
                      </Flex>
                    )
                  ) : (
                    <Text size="1" color="gray">
                      No assets for this ad account.
                    </Text>
                  )}
                  </Box>
                </Accordion.Content>
              </Card>
            </Accordion.Item>
          );
        })}
      </Accordion.Root>

      {bundles.assets_without_ad_account.length > 0 ? (
        <Flex direction="column" gap="1">
          <Text size="1" color="gray">
            Other
          </Text>
          <Card variant="surface">
            <Flex direction="column" gap="1" p="2">
              {canVirtualize && bundles.assets_without_ad_account.length > VIRTUAL_THRESHOLD ? (
                <VirtualizedRows
                  items={bundles.assets_without_ad_account}
                  estimateSize={VIRTUAL_ASSET_ESTIMATE}
                  maxHeight={VIRTUAL_MAX_HEIGHT}
                  getKey={item => item.asset_pk}
                  renderRow={asset => {
                    const integrationAccountId = asset.integration_account_id;
                    const key = mapIntegrationTypeToPlatformKey(asset.type);
                    const disabled = !integrationAccountId || !key;
                    const selected = integrationAccountId && key
                      ? (selectedAccountIdsByKey[key]?.has(integrationAccountId) ?? false)
                      : false;
                    const assetLabel = asset.business_id
                      ? `${resolveSelectableAssetLabel(asset)} · ${asset.business_id}`
                      : resolveSelectableAssetLabel(asset);

                    return (
                      <Flex justify="between" align="center" gap="2">
                        <Flex align="center" gap="2" className="min-w-0">
                          <Checkbox
                            checked={selected}
                            disabled={disabled}
                            onCheckedChange={(value) => {
                              if (!integrationAccountId || !key) return;
                              onToggleAccount(key, integrationAccountId, value === true, assetLabel);
                            }}
                          />
                          <Text size="2" color={disabled ? "gray" : undefined} className="truncate">
                            {assetLabel}
                          </Text>
                          <Badge color="gray" variant="soft">
                            {asset.type}
                          </Badge>
                        </Flex>
                        <Badge color="green" variant="soft">
                          active
                        </Badge>
                      </Flex>
                    );
                  }}
                />
              ) : (
                bundles.assets_without_ad_account.map(asset => {
                  const integrationAccountId = asset.integration_account_id;
                  const key = mapIntegrationTypeToPlatformKey(asset.type);
                  const disabled = !integrationAccountId || !key;
                  const selected = integrationAccountId && key
                    ? (selectedAccountIdsByKey[key]?.has(integrationAccountId) ?? false)
                    : false;
                  const assetLabel = asset.business_id
                    ? `${resolveSelectableAssetLabel(asset)} · ${asset.business_id}`
                    : resolveSelectableAssetLabel(asset);

                  return (
                    <Flex key={asset.asset_pk} justify="between" align="center" gap="2">
                      <Flex align="center" gap="2" className="min-w-0">
                        <Checkbox
                          checked={selected}
                          disabled={disabled}
                          onCheckedChange={(value) => {
                            if (!integrationAccountId || !key) return;
                            onToggleAccount(key, integrationAccountId, value === true, assetLabel);
                          }}
                        />
                        <Text size="2" color={disabled ? "gray" : undefined} className="truncate">
                          {assetLabel}
                        </Text>
                        <Badge color="gray" variant="soft">
                          {asset.type}
                        </Badge>
                      </Flex>
                      <Badge color="green" variant="soft">
                        active
                      </Badge>
                    </Flex>
                  );
                })
              )}
            </Flex>
          </Card>
        </Flex>
      ) : null}
    </Flex>
  );
});
